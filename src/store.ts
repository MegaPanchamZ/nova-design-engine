import { create } from 'zustand';
import { AITweak, DesignState, SceneNode, ToolType, Viewport, createDefaultNode, FrameNode, Page, Variable, Style, TextNode, SnapLine, Paint } from './types';
import { calculateLayout } from './lib/layoutUtils';
import { measureText } from './lib/measureText';
import { v4 as uuidv4 } from 'uuid';
import { generateUI, generateImage } from './services/novaAIService';
import { parseHTMLToNodes } from './lib/htmlParser';

interface ClipboardSnapshot {
    nodes: SceneNode[];
    rootIds: string[];
    minX: number;
    minY: number;
}

let clipboardSnapshot: ClipboardSnapshot | null = null;
let pasteNudgeCount = 0;
const MAX_CANVAS_COORD = 1_000_000;
const MAX_CANVAS_SIZE = 1_000_000;
const HISTORY_LIMIT = 50;
const HISTORY_MERGE_WINDOW_MS = 600;
const INSTANCE_OVERRIDE_EXCLUDED_KEYS = new Set([
    'id',
    'type',
    'parentId',
    'masterId',
    'variantGroupId',
    'variantName',
    'instanceOverrides',
]);

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let lastHistoryCommit: { source: string; timestamp: number } | null = null;

const resetHistoryCommit = () => {
    lastHistoryCommit = null;
};

const cloneValue = <T,>(value: T): T => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return deepClone(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getDynamicNodeValue = (node: SceneNode | undefined, key: string): unknown => {
    if (!node) return undefined;
    return (node as unknown as Record<string, unknown>)[key];
};

const areValuesEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) return false;
        return left.every((item, index) => areValuesEqual(item, right[index]));
    }

    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length) return false;
        return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
    }

    return false;
};

const sanitizeCoordinate = (value: number, fallback = 0): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, value));
};

const sanitizeSize = (value: number, fallback = 1): number => {
    if (!Number.isFinite(value)) return Math.max(1, fallback);
    return Math.max(1, Math.min(MAX_CANVAS_SIZE, Math.abs(value)));
};

const sanitizeUnitInterval = (value: number, fallback = 0): number => {
    if (!Number.isFinite(value)) return Math.min(1, Math.max(0, fallback));
    return Math.min(1, Math.max(0, value));
};

const sanitizePaintCollection = (paints: Paint[] | undefined, fallbackColor: string): Paint[] | undefined => {
    if (!paints) return undefined;

    return paints.map((paint) => {
        const base = {
            id: paint.id || uuidv4(),
            type: paint.type,
            opacity: sanitizeUnitInterval(paint.opacity ?? 1, 1),
            visible: paint.visible !== false,
        } as Paint;

        if (paint.type === 'solid') {
            return {
                ...base,
                type: 'solid',
                color: paint.color || fallbackColor,
            } as Paint;
        }

        const stops = (paint.gradientStops || [
            { offset: 0, color: '#FFFFFF' },
            { offset: 1, color: '#000000' },
        ]).map((stop, index) => ({
            offset: sanitizeUnitInterval(stop.offset ?? (index === 0 ? 0 : 1), index === 0 ? 0 : 1),
            color: stop.color || (index === 0 ? '#FFFFFF' : '#000000'),
        }));

        if (paint.type === 'gradient-radial') {
            return {
                ...base,
                type: 'gradient-radial',
                gradientStops: stops,
                gradientCenter: {
                    x: sanitizeUnitInterval(paint.gradientCenter?.x ?? 0.5, 0.5),
                    y: sanitizeUnitInterval(paint.gradientCenter?.y ?? 0.5, 0.5),
                },
                gradientRadius: Math.min(1, Math.max(0.05, Number.isFinite(paint.gradientRadius) ? Number(paint.gradientRadius) : 0.5)),
            } as Paint;
        }

        return {
            ...base,
            type: 'gradient-linear',
            gradientStops: stops,
            gradientAngle: Number.isFinite(paint.gradientAngle) ? Number(paint.gradientAngle) : 0,
        } as Paint;
    });
};

const deriveConvenienceColorFromPaints = (paints: Paint[] | undefined, fallback: string): string => {
    if (!paints || paints.length === 0) return fallback;

    const visiblePaints = paints.filter((paint) => paint.visible !== false);
    const source = visiblePaints.length > 0 ? visiblePaints : paints;

    for (let i = source.length - 1; i >= 0; i--) {
        const paint = source[i];
        if (paint.type === 'solid' && paint.color) {
            return String(paint.color);
        }
        const stops = paint.gradientStops || [];
        if (stops.length > 0) {
            const lastStop = stops[stops.length - 1];
            if (lastStop?.color) return String(lastStop.color);
        }
    }

    return fallback;
};

const applyNodePatch = (baseNode: SceneNode, patch: Partial<SceneNode>): SceneNode => {
    let updated = { ...baseNode, ...patch } as SceneNode;

    if (patch.fill !== undefined && patch.fills === undefined) {
        const targetColor = String(patch.fill);
        const nextFills: Paint[] = (updated.fills && updated.fills.length > 0)
            ? updated.fills.map((paint) => ({ ...paint }))
            : [{ id: uuidv4(), type: 'solid', color: targetColor, opacity: updated.opacity || 1, visible: true }];

        let applied = false;
        for (let index = nextFills.length - 1; index >= 0; index -= 1) {
            if (nextFills[index].type === 'solid') {
                nextFills[index] = { ...nextFills[index], color: targetColor };
                applied = true;
                break;
            }
        }

        if (!applied) {
            nextFills.push({ id: uuidv4(), type: 'solid', color: targetColor, opacity: 1, visible: true });
        }

        updated.fills = nextFills;
    }

    if (patch.stroke !== undefined && patch.strokes === undefined) {
        const targetColor = String(patch.stroke);
        const nextStrokes: Paint[] = (updated.strokes && updated.strokes.length > 0)
            ? updated.strokes.map((paint) => ({ ...paint }))
            : [{ id: uuidv4(), type: 'solid', color: targetColor, opacity: 1, visible: true }];

        let applied = false;
        for (let index = nextStrokes.length - 1; index >= 0; index -= 1) {
            if (nextStrokes[index].type === 'solid') {
                nextStrokes[index] = { ...nextStrokes[index], color: targetColor };
                applied = true;
                break;
            }
        }

        if (!applied) {
            nextStrokes.push({ id: uuidv4(), type: 'solid', color: targetColor, opacity: 1, visible: true });
        }

        updated.strokes = nextStrokes;
    }

    if (patch.fills !== undefined) {
        updated.fills = sanitizePaintCollection(updated.fills, updated.fill || '#D9D9D9');
        updated.fill = deriveConvenienceColorFromPaints(updated.fills, 'transparent');
    }

    if (patch.strokes !== undefined) {
        updated.strokes = sanitizePaintCollection(updated.strokes, updated.stroke || '#000000');
        updated.stroke = deriveConvenienceColorFromPaints(updated.strokes, updated.stroke || '#000000');
    }

    const textUpdates = patch as Partial<TextNode>;
    if (textUpdates.text !== undefined && updated.isAutoName) {
        updated.name = textUpdates.text || 'Text';
    }

    updated = sanitizeNodeGeometry(updated, baseNode);
    if (patch.name !== undefined && typeof patch.name === 'string') {
        if (patch.name.trim() === '') {
            updated.isAutoName = true;
            if (updated.type === 'text') updated.name = updated.text || 'Text';
        } else {
            updated.isAutoName = false;
        }
    }

    if (updated.type === 'text') {
        const textNode = updated as TextNode;
        const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
        const metrics = measureText(textNode.text, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);

        if (textNode.horizontalResizing === 'hug') updated.width = metrics.width;
        if (textNode.verticalResizing === 'hug') updated.height = metrics.height;
    }

    return updated;
};

const sanitizeInstanceOverrides = (
    overrides: Record<string, unknown> | undefined,
    masterNode: SceneNode | undefined
): Record<string, unknown> | undefined => {
    if (!overrides) return undefined;

    const nextOverrides = Object.entries(overrides).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (INSTANCE_OVERRIDE_EXCLUDED_KEYS.has(key)) return acc;
        const masterValue = getDynamicNodeValue(masterNode, key);
        if (masterNode && areValuesEqual(value, masterValue)) return acc;
        acc[key] = cloneValue(value);
        return acc;
    }, {});

    return Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined;
};

const buildInstanceOverrideRecord = (
    instanceNode: SceneNode,
    patch: Partial<SceneNode>,
    masterNode: SceneNode | undefined
): Record<string, unknown> | undefined => {
    const currentOverrides = isRecord(instanceNode.instanceOverrides)
        ? cloneValue(instanceNode.instanceOverrides)
        : {};

    Object.keys(patch).forEach((key) => {
        if (INSTANCE_OVERRIDE_EXCLUDED_KEYS.has(key)) return;
        const nextValue = cloneValue(getDynamicNodeValue(instanceNode, key));
        const masterValue = getDynamicNodeValue(masterNode, key);
        if (masterNode && areValuesEqual(nextValue, masterValue)) {
            delete currentOverrides[key];
            return;
        }
        currentOverrides[key] = nextValue;
    });

    return Object.keys(currentOverrides).length > 0 ? currentOverrides : undefined;
};

const reapplyInstanceOverrides = (instanceNode: SceneNode, masterNode: SceneNode | undefined): SceneNode => {
    const sanitizedOverrides = sanitizeInstanceOverrides(
        isRecord(instanceNode.instanceOverrides) ? instanceNode.instanceOverrides : undefined,
        masterNode
    );

    if (!sanitizedOverrides) {
        return instanceNode.instanceOverrides ? { ...instanceNode, instanceOverrides: undefined } : instanceNode;
    }

    const mergedNode = applyNodePatch({ ...instanceNode, instanceOverrides: undefined } as SceneNode, sanitizedOverrides as Partial<SceneNode>);
    return { ...mergedNode, instanceOverrides: sanitizedOverrides };
};

const getRelativeNodePath = (nodes: SceneNode[], rootId: string, nodeId: string): string => {
    if (rootId === nodeId) return 'root';

    const segments: number[] = [];
    let currentNode = getNodeById(nodes, nodeId);
    while (currentNode && currentNode.id !== rootId) {
        const siblings = nodes.filter((node) => node.parentId === currentNode?.parentId);
        const siblingIndex = siblings.findIndex((node) => node.id === currentNode?.id);
        segments.unshift(Math.max(0, siblingIndex));
        currentNode = getNodeById(nodes, currentNode.parentId);
    }

    return currentNode?.id === rootId ? segments.join('.') : nodeId;
};

const preserveInstanceSubtreeOverrides = (
    previousNodes: SceneNode[],
    previousRootId: string,
    nextNodes: SceneNode[],
    nextRootId: string
): SceneNode[] => {
    const previousSubtreeIds = collectSubtreeIds(previousNodes, previousRootId);
    const previousOverrideMap = new Map<string, Record<string, unknown>>();

    previousNodes.forEach((node) => {
        if (!previousSubtreeIds.has(node.id) || !isRecord(node.instanceOverrides)) return;
        const path = getRelativeNodePath(previousNodes, previousRootId, node.id);
        previousOverrideMap.set(path, cloneValue(node.instanceOverrides));
    });

    if (previousOverrideMap.size === 0) return nextNodes;

    const nextSubtreeIds = collectSubtreeIds(nextNodes, nextRootId);
    return nextNodes.map((node) => {
        if (!nextSubtreeIds.has(node.id)) return node;
        const path = getRelativeNodePath(nextNodes, nextRootId, node.id);
        const previousOverrides = previousOverrideMap.get(path);
        if (!previousOverrides) return node;
        return reapplyInstanceOverrides({ ...node, instanceOverrides: previousOverrides }, getNodeById(nextNodes, node.masterId));
    });
};

const sanitizeCornerValue = (value: number, fallback: number, maxCornerRadius: number): number => {
    const safeFallback = Number.isFinite(fallback) ? fallback : 0;
    if (!Number.isFinite(value)) return Math.min(maxCornerRadius, Math.max(0, safeFallback));
    return Math.min(maxCornerRadius, Math.max(0, value));
};

const sanitizeNodeGeometry = (node: SceneNode, fallback?: SceneNode): SceneNode => {
    const safeWidth = sanitizeSize(node.width, fallback?.width ?? 1);
    const safeHeight = sanitizeSize(node.height, fallback?.height ?? 1);
    const maxCornerRadius = Math.max(0, Math.min(safeWidth, safeHeight) / 2);

    const fallbackRadius = fallback?.cornerRadius ?? 0;
    const fallbackCorners = fallback?.individualCornerRadius;

    const normalizedCornerRadius = sanitizeCornerValue(node.cornerRadius ?? fallbackRadius, fallbackRadius, maxCornerRadius);
    const sourceCorners = node.individualCornerRadius ?? fallbackCorners;

    return {
        ...node,
        x: sanitizeCoordinate(node.x, fallback?.x ?? 0),
        y: sanitizeCoordinate(node.y, fallback?.y ?? 0),
        width: safeWidth,
        height: safeHeight,
        cornerRadius: normalizedCornerRadius,
        individualCornerRadius: sourceCorners
            ? {
                  topLeft: sanitizeCornerValue(
                      sourceCorners.topLeft,
                      fallbackCorners?.topLeft ?? normalizedCornerRadius,
                      maxCornerRadius
                  ),
                  topRight: sanitizeCornerValue(
                      sourceCorners.topRight,
                      fallbackCorners?.topRight ?? normalizedCornerRadius,
                      maxCornerRadius
                  ),
                  bottomRight: sanitizeCornerValue(
                      sourceCorners.bottomRight,
                      fallbackCorners?.bottomRight ?? normalizedCornerRadius,
                      maxCornerRadius
                  ),
                  bottomLeft: sanitizeCornerValue(
                      sourceCorners.bottomLeft,
                      fallbackCorners?.bottomLeft ?? normalizedCornerRadius,
                      maxCornerRadius
                  ),
              }
            : undefined,
        cornerSmoothing: sanitizeUnitInterval(node.cornerSmoothing ?? 0, fallback?.cornerSmoothing ?? 0),
    };
};

const isFrameLike = (node: SceneNode): node is FrameNode =>
    node.type === 'frame' ||
    node.type === 'section' ||
    node.type === 'group' ||
    node.type === 'component' ||
    node.type === 'instance';

const getNodeById = (nodes: SceneNode[], id: string | undefined): SceneNode | undefined => {
    if (!id) return undefined;
    return nodes.find((node) => node.id === id);
};

const getGlobalPosition = (nodes: SceneNode[], nodeId: string | undefined): { x: number; y: number } => {
    const node = getNodeById(nodes, nodeId);
    if (!node) return { x: 0, y: 0 };
    const parentPos = getGlobalPosition(nodes, node.parentId);
    return { x: parentPos.x + node.x, y: parentPos.y + node.y };
};

const collectDescendantIds = (nodes: SceneNode[], nodeId: string, acc: Set<string>): void => {
    const children = nodes.filter((node) => node.parentId === nodeId);
    children.forEach((child) => {
        acc.add(child.id);
        collectDescendantIds(nodes, child.id, acc);
    });
};

const getTopLevelSelectionIds = (nodes: SceneNode[], selectedIds: string[]): string[] => {
    const selectedSet = new Set(selectedIds);
    const topLevelIds = selectedIds.filter((id) => {
        let parentId = getNodeById(nodes, id)?.parentId;
        while (parentId) {
            if (selectedSet.has(parentId)) return false;
            parentId = getNodeById(nodes, parentId)?.parentId;
        }
        return true;
    });

    // Ensure we don't have duplicates and preserve order from selectedIds
    return Array.from(new Set(topLevelIds));
};

const getCommonParentId = (nodes: SceneNode[], nodeIds: string[]): string | undefined | 'mixed' => {
    if (nodeIds.length === 0) return undefined;
    const firstParent = getNodeById(nodes, nodeIds[0])?.parentId;
    for (let i = 1; i < nodeIds.length; i++) {
        const parentId = getNodeById(nodes, nodeIds[i])?.parentId;
        if (parentId !== firstParent) return 'mixed';
    }
    return firstParent;
};

const collectSubtreeIds = (nodes: SceneNode[], rootId: string): Set<string> => {
    const subtreeIds = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
        changed = false;
        nodes.forEach((node) => {
            if (node.parentId && subtreeIds.has(node.parentId) && !subtreeIds.has(node.id)) {
                subtreeIds.add(node.id);
                changed = true;
            }
        });
    }
    return subtreeIds;
};

const cloneComponentSubtreeAsInstance = (
    allNodes: SceneNode[],
    sourceComponent: SceneNode,
    overrides?: {
        rootId?: string;
        rootX?: number;
        rootY?: number;
        rootParentId?: string;
        rootName?: string;
    }
): { clonedSubtree: SceneNode[]; rootInstanceId: string } | null => {
    const sourceSubtreeIds = collectSubtreeIds(allNodes, sourceComponent.id);
    const sourceSubtree = allNodes.filter((node) => sourceSubtreeIds.has(node.id));
    if (sourceSubtree.length === 0) return null;

    const idMap = new Map<string, string>();
    sourceSubtree.forEach((node) => {
        if (node.id === sourceComponent.id && overrides?.rootId) {
            idMap.set(node.id, overrides.rootId);
        } else {
            idMap.set(node.id, uuidv4());
        }
    });

    const rootId = idMap.get(sourceComponent.id);
    if (!rootId) return null;

    const clonedSubtree = sourceSubtree.map((sourceNode) => {
        const isRoot = sourceNode.id === sourceComponent.id;
        const cloneId = idMap.get(sourceNode.id) || uuidv4();
        const cloneParentId = isRoot
            ? overrides?.rootParentId ?? sourceComponent.parentId
            : (sourceNode.parentId ? idMap.get(sourceNode.parentId) : undefined);
        const cloned = deepClone(sourceNode) as SceneNode;

        const nextNode = {
            ...cloned,
            id: cloneId,
            type: (isRoot ? 'instance' : cloned.type) as SceneNode['type'],
            parentId: cloneParentId,
            masterId: sourceNode.id,
            x: isRoot
                ? sanitizeCoordinate(overrides?.rootX ?? (cloned.x + 24), cloned.x)
                : cloned.x,
            y: isRoot
                ? sanitizeCoordinate(overrides?.rootY ?? (cloned.y + 24), cloned.y)
                : cloned.y,
            name: isRoot ? (overrides?.rootName || `${sourceComponent.name} Instance`) : cloned.name,
        } as SceneNode;

        return sanitizeNodeGeometry(nextNode, cloned);
    });

    return { clonedSubtree, rootInstanceId: rootId };
};

const toUniqueIds = (ids: string[]): string[] => Array.from(new Set(ids));

const parseAiTweaks = (rawTweaks: unknown, selectedIds: string[]): AITweak[] => {
    if (!Array.isArray(rawTweaks)) return [];

    return rawTweaks
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => {
            const targetIdValue = typeof item.targetId === 'string' ? item.targetId : '';
            const targetNodeId = targetIdValue === 'Selection' ? selectedIds[0] : targetIdValue;

            return {
                id: uuidv4(),
                label: typeof item.label === 'string' ? item.label : 'Tweak',
                type:
                    item.type === 'slider' || item.type === 'color' || item.type === 'toggle' || item.type === 'action'
                        ? item.type
                        : 'slider',
                targetNodeId: targetNodeId || selectedIds[0] || '',
                targetProperty: typeof item.property === 'string' ? item.property : '',
                min: typeof item.min === 'number' ? item.min : undefined,
                max: typeof item.max === 'number' ? item.max : undefined,
                value: item.value ?? 0,
            } as AITweak;
        })
        .filter((tweak) => tweak.targetNodeId.length > 0 && tweak.targetProperty.length > 0);
};

const applyFrameSizingWithoutAutoLayout = (
    frame: FrameNode,
    children: SceneNode[],
    allNodes: SceneNode[]
): { frame: FrameNode; children: SceneNode[] } => {
    const updatedFrame: FrameNode = {
        ...frame,
        x: sanitizeCoordinate(frame.x, 0),
        y: sanitizeCoordinate(frame.y, 0),
        width: sanitizeSize(frame.width, 100),
        height: sanitizeSize(frame.height, 100),
    };
    const updatedChildren: SceneNode[] = children.map((child) => ({
        ...child,
        x: sanitizeCoordinate(child.x, 0),
        y: sanitizeCoordinate(child.y, 0),
        width: sanitizeSize(child.width, 1),
        height: sanitizeSize(child.height, 1),
    }));

    const parentCandidate = getNodeById(allNodes, frame.parentId);
    if (parentCandidate && isFrameLike(parentCandidate) && !updatedFrame.isAbsolute) {
        const parentInnerWidth = sanitizeSize(parentCandidate.width - parentCandidate.padding.left - parentCandidate.padding.right, updatedFrame.width);
        const parentInnerHeight = sanitizeSize(parentCandidate.height - parentCandidate.padding.top - parentCandidate.padding.bottom, updatedFrame.height);

        if (updatedFrame.horizontalResizing === 'fill') {
            updatedFrame.width = parentInnerWidth;
            updatedFrame.x = parentCandidate.padding.left;
        }
        if (updatedFrame.verticalResizing === 'fill') {
            updatedFrame.height = parentInnerHeight;
            updatedFrame.y = parentCandidate.padding.top;
        }
    }

    const getInnerWidth = () => sanitizeSize(updatedFrame.width - updatedFrame.padding.left - updatedFrame.padding.right, updatedFrame.width);
    const getInnerHeight = () => sanitizeSize(updatedFrame.height - updatedFrame.padding.top - updatedFrame.padding.bottom, updatedFrame.height);

    updatedChildren.forEach((child) => {
        if (child.isAbsolute) return;
        if (child.horizontalResizing === 'fill') {
            child.width = getInnerWidth();
            child.x = updatedFrame.padding.left;
        }
        if (child.verticalResizing === 'fill') {
            child.height = getInnerHeight();
            child.y = updatedFrame.padding.top;
        }
    });

    if (updatedChildren.length > 0 && updatedFrame.horizontalResizing === 'hug') {
        const targetMinX = updatedFrame.padding.left;
        const minX = Math.min(...updatedChildren.map((child) => sanitizeCoordinate(child.x, 0)));
        const shiftX = minX - targetMinX;

        if (Number.isFinite(shiftX) && Math.abs(shiftX) > 0.001) {
            updatedFrame.x = sanitizeCoordinate(updatedFrame.x + shiftX, updatedFrame.x);
            updatedChildren.forEach((child) => {
                child.x = sanitizeCoordinate(child.x - shiftX, child.x);
            });
        }

        const maxX = Math.max(targetMinX, ...updatedChildren.map((child) => sanitizeCoordinate(child.x, 0) + sanitizeSize(child.width, 1)));
        updatedFrame.width = sanitizeSize(maxX + updatedFrame.padding.right, updatedFrame.width);
    }

    if (updatedChildren.length > 0 && updatedFrame.verticalResizing === 'hug') {
        const targetMinY = updatedFrame.padding.top;
        const minY = Math.min(...updatedChildren.map((child) => sanitizeCoordinate(child.y, 0)));
        const shiftY = minY - targetMinY;

        if (Number.isFinite(shiftY) && Math.abs(shiftY) > 0.001) {
            updatedFrame.y = sanitizeCoordinate(updatedFrame.y + shiftY, updatedFrame.y);
            updatedChildren.forEach((child) => {
                child.y = sanitizeCoordinate(child.y - shiftY, child.y);
            });
        }

        const maxY = Math.max(targetMinY, ...updatedChildren.map((child) => sanitizeCoordinate(child.y, 0) + sanitizeSize(child.height, 1)));
        updatedFrame.height = sanitizeSize(maxY + updatedFrame.padding.bottom, updatedFrame.height);
    }

    return {
        frame: updatedFrame,
        children: updatedChildren,
    };
};

const reflowFrameBranch = (nodes: SceneNode[], frameId: string): SceneNode[] => {
    const frame = getNodeById(nodes, frameId);
    if (!frame || !isFrameLike(frame)) return nodes;

    const children = nodes.filter((node) => node.parentId === frameId);
    const { frame: updatedFrame, children: updatedChildren } = frame.layoutMode !== 'none'
        ? calculateLayout(frame, children)
        : applyFrameSizingWithoutAutoLayout(frame, children, nodes);

    const updatedChildrenMap = new Map(updatedChildren.map((child) => [child.id, child]));
    const nextNodes = nodes.map((node) => {
        if (node.id === updatedFrame.id) return updatedFrame;
        return updatedChildrenMap.get(node.id) || node;
    });

    return updatedFrame.parentId ? reflowFrameBranch(nextNodes, updatedFrame.parentId) : nextNodes;
};

const reflowNodeBranch = (nodes: SceneNode[], targetId: string): SceneNode[] => {
    const node = getNodeById(nodes, targetId);
    if (!node) return nodes;

    const frameId = isFrameLike(node) ? node.id : node.parentId;
    if (!frameId) return nodes;

    return reflowFrameBranch(nodes, frameId);
};

const reflowNodeBranches = (nodes: SceneNode[], targetIds: Array<string | undefined>): SceneNode[] => {
    return Array.from(new Set(targetIds.filter((id): id is string => Boolean(id)))).reduce(
        (currentNodes, targetId) => reflowNodeBranch(currentNodes, targetId),
        nodes
    );
};

interface DesignStore extends DesignState {
  setTool: (tool: ToolType) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setMode: (mode: DesignState['mode']) => void;
  setHoveredId: (id: string | null) => void;
  toggleRulers: () => void;
  addGuide: (type: 'horizontal' | 'vertical', position: number) => void;
    updateGuide: (id: string, position: number) => void;
  removeGuide: (id: string) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  // Page Actions
  addPage: (name: string) => void;
  updatePage: (id: string, updates: Partial<Page>) => void;
  setPage: (id: string) => void;
  setPages: (pages: Page[]) => void;
  // Node Actions
  addNode: (node: SceneNode) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  deleteNodes: (ids: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  sendAIChat: (message: string) => Promise<void>;
  generateUIFromPrompt: (prompt: string) => Promise<void>;
  groupSelected: () => void;
    createComponentFromSelection: () => void;
    createInstanceFromComponent: (componentId?: string) => void;
    createVariantFromComponent: (componentId?: string) => void;
    switchInstanceVariant: (instanceId: string, variantComponentId: string) => void;
    frameSelected: () => void;
    copySelected: () => void;
    pasteCopied: (x?: number, y?: number) => void;
    canPaste: () => boolean;
  alignSelected: (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v') => void;
  selectMatching: () => void;
  reorderNode: (id: string, index: number) => void;
  moveNodeHierarchy: (dragId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  // Variables & Styles
  addVariable: (variable: Omit<Variable, 'id'>) => void;
  addStyle: (style: Omit<Style, 'id'>) => void;
    mutateVariable: (id: string, newValue: unknown) => void;
  // History
  undo: () => void;
  redo: () => void;
    pushHistory: (source?: string) => void;
}

const initialPageId = uuidv4();

export const useStore = create<DesignStore>((set, get) => ({
  pages: [{ id: initialPageId, name: 'Page 1', nodes: [] }],
  currentPageId: initialPageId,
  variables: [],
  styles: [],
  selectedIds: [],
  hoveredId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  tool: 'select',
  history: [[{ id: initialPageId, name: 'Page 1', nodes: [] }]],
  historyIndex: 0,
  mode: 'design',
  showRulers: false,
  aiHistory: [],
  aiTweaks: [],
  guides: [],
  snapLines: [],

  setTool: (tool) => set({ tool }),
  setMode: (mode) => set({ mode }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  toggleRulers: () => set(s => ({ showRulers: !s.showRulers })),
  addGuide: (type, position) => set(s => ({ guides: [...s.guides, { id: uuidv4(), type, position }] })),
    updateGuide: (id, position) => set((state) => ({
        guides: state.guides.map((guide) => guide.id === id ? { ...guide, position } : guide)
    })),
  removeGuide: (id) => set(s => ({ guides: s.guides.filter(g => g.id !== id) })),
  setSnapLines: (snapLines) => set({ snapLines }),
  
  setViewport: (viewport) => set((state) => ({ 
    viewport: { ...state.viewport, ...viewport } 
  })),

  setSelectedIds: (selectedIds) => set({ selectedIds }),

  sendAIChat: async (message: string) => {
    const { aiHistory, pages, currentPageId, selectedIds } = get();
    const currentPage = pages.find(p => p.id === currentPageId);
    if (!currentPage) return;

    const userMessage = { role: 'user' as const, content: message };
    set(s => ({ aiHistory: [...s.aiHistory, userMessage] }));

    const contextNodes = selectedIds.length > 0 
        ? currentPage.nodes.filter(n => selectedIds.includes(n.id) || (n.parentId && selectedIds.includes(n.parentId)))
        : currentPage.nodes.slice(0, 100);

    const rawResponse = await generateUI(message, aiHistory, contextNodes);
    
    if (!rawResponse) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "I'm sorry, I couldn't generate a response. Please try again." }] }));
        return;
    }

    // Parse structured sections with robust logic
    const extractBlock = (tag: string, str: string) => {
        const start = str.indexOf(`[${tag}]`);
        const end = str.indexOf(`[/${tag}]`);
        if (start !== -1 && end !== -1) {
            return str.substring(start + tag.length + 2, end).trim();
        }
        return null;
    };

    const aiText = extractBlock('MESSAGE', rawResponse) || "I have updated the design.";
    let html = extractBlock('HTML', rawResponse) || "";
    const tweaksStr = extractBlock('TWEAKS', rawResponse);

    // Handle Image Generation in HTML
    const imgRegex = /<img[^>]+src="GENERATE:([^"]+)"[^>]*>/g;
    let match;
    const pendingGenerations: { tag: string, prompt: string }[] = [];
    while ((match = imgRegex.exec(html)) !== null) {
        pendingGenerations.push({ tag: match[0], prompt: match[1] });
    }

    if (pendingGenerations.length > 0) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "Generating images for your design..." }] }));
        for (const gen of pendingGenerations) {
            const dataUrl = await generateImage(gen.prompt);
            if (dataUrl) {
                html = html.replace(gen.tag, gen.tag.replace(`src="GENERATE:${gen.prompt}"`, `src="${dataUrl}"`));
            } else {
                html = html.replace(gen.tag, gen.tag.replace(`src="GENERATE:${gen.prompt}"`, `src="https://placehold.co/600x400?text=Failed+to+Generate"`));
            }
        }
    }
    
    let tweaks: AITweak[] = [];
    if (tweaksStr) {
        try {
            const rawTweaks: unknown = JSON.parse(tweaksStr);
            tweaks = parseAiTweaks(rawTweaks, selectedIds);
        } catch (e) {
            console.error("Tweak parse error", e);
        }
    }

    if (!html) {
         set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: aiText || "Design updated." }] }));
         return;
    }

    const viewport = get().viewport;
    const basePosition = { 
        x: -viewport.x / viewport.zoom + 100, 
        y: -viewport.y / viewport.zoom + 100 
    };

    const newNodes = parseHTMLToNodes(html, basePosition);
    if (!newNodes || newNodes.length === 0) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "I generated some code but couldn't parse it into design elements." }] }));
        return;
    }
    
    set((state) => {
        const pages = state.pages.map(p => {
            if (p.id === state.currentPageId) {
                const newNodeIdSet = new Set(newNodes.map(n => n.id));
                const isIterative = newNodes.some(nn => p.nodes.some(en => en.id === nn.id));
                
                let filteredNodes = p.nodes;
                if (isIterative) {
                    filteredNodes = p.nodes.filter(n => !newNodeIdSet.has(n.id));
                } else if (state.selectedIds.length > 0) {
                    const selectedSet = new Set(state.selectedIds);
                    filteredNodes = p.nodes.filter(n => !selectedSet.has(n.id) && !selectedSet.has(n.parentId || ''));
                }

                return { ...p, nodes: [...filteredNodes, ...newNodes] };
            }
            return p;
        });

        return { 
            pages,
            selectedIds: newNodes.filter(n => !n.parentId).map(n => n.id),
            aiHistory: [...state.aiHistory, { role: 'assistant' as const, content: aiText }],
            aiTweaks: tweaks
        };
    });
    get().pushHistory();
  },

  generateUIFromPrompt: async (prompt: string) => {
    await get().sendAIChat(prompt);
  },

  addPage: (name) => set((state) => {
      const newPage = { id: uuidv4(), name, nodes: [] };
      return { 
          pages: [...state.pages, newPage],
          currentPageId: newPage.id
      };
  }),

  setPages: (pages) => set({ pages }),

  updatePage: (id, updates) => set((state) => ({
      pages: state.pages.map(p => p.id === id ? { ...p, ...updates } : p)
  })),

  setPage: (id) => set({ currentPageId: id, selectedIds: [] }),

  addNode: (node) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage) return state;

        let nodeToInsert = sanitizeNodeGeometry(node);
    
    // Initial measurement for text nodes
        if (nodeToInsert.type === 'text') {
                const textNode = nodeToInsert as TextNode;
        const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
        const metrics = measureText(textNode.text, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);
                nodeToInsert = sanitizeNodeGeometry({
                    ...textNode,
                    width: textNode.horizontalResizing === 'hug' ? metrics.width : textNode.width,
                    height: textNode.verticalResizing === 'hug' ? metrics.height : textNode.height,
                }, nodeToInsert);
    }

        let newNodes = [...currentPage.nodes, nodeToInsert];
        newNodes = reflowNodeBranch(newNodes, nodeToInsert.id);

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
        return { pages, selectedIds: [nodeToInsert.id] };
  }),

  updateNode: (id, updates) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage) return state;
    let newNodes = currentPage.nodes.map((n) => {
            if (n.id !== id) return n;
            return applyNodePatch(n, updates);
    });

        let sourceNode = newNodes.find((n) => n.id === id);
        if (sourceNode?.masterId) {
            const masterNode = getNodeById(newNodes, sourceNode.masterId) || getNodeById(currentPage.nodes, sourceNode.masterId);
            const nextOverrides = buildInstanceOverrideRecord(sourceNode, updates, masterNode);
            newNodes = newNodes.map((nodeEntry) => nodeEntry.id === id ? { ...sourceNode!, instanceOverrides: nextOverrides } : nodeEntry);
            sourceNode = newNodes.find((nodeEntry) => nodeEntry.id === id);
        }

        const sourceIsMasterNode = (() => {
            if (!sourceNode || sourceNode.type === 'instance') return false;
            let cursor: SceneNode | undefined = sourceNode;
            while (cursor) {
                if (cursor.type === 'component') return true;
                cursor = getNodeById(newNodes, cursor.parentId);
            }
            return false;
        })();

        const propagationPatch = Object.fromEntries(
            Object.entries(updates).filter(([key]) => !['id', 'type', 'parentId', 'masterId', 'x', 'y', 'name', 'instanceOverrides'].includes(key))
        ) as Partial<SceneNode>;

        if (sourceIsMasterNode && Object.keys(propagationPatch).length > 0) {
            const propagatedMasterNode = newNodes.find((nodeEntry) => nodeEntry.id === id);
            newNodes = newNodes.map((nodeEntry) => {
                if (nodeEntry.masterId !== id) return nodeEntry;
                const propagatedNode = applyNodePatch(nodeEntry, propagationPatch);
                return reapplyInstanceOverrides(propagatedNode, propagatedMasterNode);
            });
        }

    // Handle spatial reordering for Auto Layout
    const node = newNodes.find(n => n.id === id);
    const hasSpatialUpdate = updates.x !== undefined || updates.y !== undefined;
    if (node && node.parentId && !node.isAbsolute && hasSpatialUpdate) {
        const parent = newNodes.find(n => n.id === node.parentId);
        if (parent && (parent.type === 'frame' || parent.type === 'section' || parent.type === 'group' || parent.type === 'component' || parent.type === 'instance') && parent.layoutMode !== 'none') {
            // Only consider non-absolute siblings for reordering
            const layoutSiblings = newNodes.filter(n => n.parentId === node.parentId && !n.isAbsolute && n.id !== node.id);
            let newIndex = layoutSiblings.length;

            if (parent.layoutMode === 'horizontal') {
                newIndex = layoutSiblings.findIndex(s => node.x < s.x + s.width / 2);
            } else if (parent.layoutMode === 'vertical') {
                newIndex = layoutSiblings.findIndex(s => node.y < s.y + s.height / 2);
            }

            if (newIndex === -1) newIndex = layoutSiblings.length;

            // Extract all children of this parent (including absolute ones)
            const allParentChildren = newNodes.filter(n => n.parentId === node.parentId);
            const otherNodes = newNodes.filter(n => n.parentId !== node.parentId);
            
            // Re-order the layout nodes specifically
            const reorderedLayoutNodes = [...layoutSiblings];
            reorderedLayoutNodes.splice(newIndex, 0, node);

            // Merge back absolute nodes into their original relative positions if possible, 
            // but for simplicity and stability in auto-layout, layout nodes should follow index.
            // Absolute nodes stay in their previous array positions.
            
            const finalChildren: SceneNode[] = [];
            let layoutIdx = 0;
            allParentChildren.forEach(origChild => {
                if (origChild.isAbsolute) {
                    finalChildren.push(origChild.id === id ? node : origChild);
                } else {
                    finalChildren.push(reorderedLayoutNodes[layoutIdx++]);
                }
            });
            
            // Sync newNodes array
            const mergedNodes: SceneNode[] = [];
            let childIdx = 0;
            newNodes.forEach(n => {
                if (n.parentId === node.parentId) {
                    mergedNodes.push(finalChildren[childIdx++]);
                } else {
                    mergedNodes.push(n);
                }
            });
            newNodes = mergedNodes;
        }
    }
    
    newNodes = reflowNodeBranch(newNodes, id);

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    return { pages };
  }),

  groupSelected: () => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
        if (!currentPage || state.selectedIds.length < 2) return state;

        const topLevelIds = getTopLevelSelectionIds(currentPage.nodes, state.selectedIds);
        if (topLevelIds.length < 2) return state;

        const bounds = topLevelIds
            .map((id) => {
                const node = getNodeById(currentPage.nodes, id);
                if (!node) return null;
                const pos = getGlobalPosition(currentPage.nodes, id);
                return {
                    node,
                    x: pos.x,
                    y: pos.y,
                    right: pos.x + node.width,
                    bottom: pos.y + node.height,
                };
            })
            .filter((item): item is { node: SceneNode; x: number; y: number; right: number; bottom: number } => item !== null);

        if (bounds.length < 2) return state;

        const minX = Math.min(...bounds.map((item) => item.x));
        const minY = Math.min(...bounds.map((item) => item.y));
        const maxX = Math.max(...bounds.map((item) => item.right));
        const maxY = Math.max(...bounds.map((item) => item.bottom));

        const groupNode = createDefaultNode('group', minX, minY) as FrameNode;
        groupNode.width = Math.max(20, maxX - minX);
        groupNode.height = Math.max(20, maxY - minY);
        groupNode.name = 'Group';
        groupNode.clipsContent = false;

        const topLevelSet = new Set(topLevelIds);
        const groupedNodes = currentPage.nodes.map((node) => {
            if (!topLevelSet.has(node.id)) return node;
            const globalPos = getGlobalPosition(currentPage.nodes, node.id);
            return {
                ...node,
                parentId: groupNode.id,
                x: globalPos.x - groupNode.x,
                y: globalPos.y - groupNode.y,
            };
        });

        const newNodes = [...groupedNodes, groupNode];
    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    
    return {
        pages,
                selectedIds: [groupNode.id]
    };
  }),

    createComponentFromSelection: () => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage || state.selectedIds.length === 0) return state;

        const topLevelIds = getTopLevelSelectionIds(currentPage.nodes, state.selectedIds);
        if (topLevelIds.length === 0) return state;

        const commonParent = getCommonParentId(currentPage.nodes, topLevelIds);
        if (commonParent === 'mixed') return state;

        const selectedTopLevelNodes = topLevelIds
            .map((nodeId) => getNodeById(currentPage.nodes, nodeId))
            .filter((node): node is SceneNode => Boolean(node));
        if (selectedTopLevelNodes.length === 0) return state;

        const minX = Math.min(...selectedTopLevelNodes.map((node) => node.x));
        const minY = Math.min(...selectedTopLevelNodes.map((node) => node.y));
        const maxX = Math.max(...selectedTopLevelNodes.map((node) => node.x + node.width));
        const maxY = Math.max(...selectedTopLevelNodes.map((node) => node.y + node.height));

        const componentNode = createDefaultNode('component', minX, minY) as FrameNode;
        componentNode.parentId = commonParent;
        componentNode.width = sanitizeSize(maxX - minX, componentNode.width);
        componentNode.height = sanitizeSize(maxY - minY, componentNode.height);
        componentNode.name = 'Component';

        const selectedSet = new Set(topLevelIds);
        const adjustedNodes = currentPage.nodes.map((node) => {
            if (!selectedSet.has(node.id)) return node;
            return {
                ...node,
                parentId: componentNode.id,
                x: sanitizeCoordinate(node.x - minX, node.x),
                y: sanitizeCoordinate(node.y - minY, node.y),
            };
        });

        const insertAt = Math.max(0, currentPage.nodes.findIndex((node) => selectedSet.has(node.id)));
        const nextNodes = [...adjustedNodes];
        nextNodes.splice(insertAt, 0, componentNode);

        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: nextNodes } : page
        );
        return { pages, selectedIds: [componentNode.id] };
    }),

    createInstanceFromComponent: (componentId) => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage) return state;

        const sourceComponent = componentId
            ? currentPage.nodes.find((node) => node.id === componentId && node.type === 'component')
            : currentPage.nodes.find((node) => state.selectedIds.includes(node.id) && node.type === 'component');
        if (!sourceComponent || sourceComponent.type !== 'component') return state;

        const result = cloneComponentSubtreeAsInstance(currentPage.nodes, sourceComponent);
        if (!result) return state;
        const sourceSubtreeIds = collectSubtreeIds(currentPage.nodes, sourceComponent.id);
        const subtreeIndexes = currentPage.nodes
            .map((node, index) => (sourceSubtreeIds.has(node.id) ? index : -1))
            .filter((index) => index >= 0);
        const insertAt = subtreeIndexes.length > 0 ? Math.max(...subtreeIndexes) + 1 : currentPage.nodes.length;

        const nextNodes = [...currentPage.nodes];
        nextNodes.splice(insertAt, 0, ...result.clonedSubtree);

        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: nextNodes } : page
        );
        return { pages, selectedIds: [result.rootInstanceId] };
    }),

    createVariantFromComponent: (componentId) => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage) return state;

        const sourceComponent = componentId
            ? currentPage.nodes.find((node) => node.id === componentId && node.type === 'component')
            : currentPage.nodes.find((node) => state.selectedIds.includes(node.id) && node.type === 'component');
        if (!sourceComponent || sourceComponent.type !== 'component') return state;

        const existingGroupId = sourceComponent.variantGroupId;
        const variantGroupId = existingGroupId || uuidv4();

        const componentsInGroup = currentPage.nodes.filter(
            (node) => node.type === 'component' && node.variantGroupId === variantGroupId
        );
        const variantNumber = Math.max(2, componentsInGroup.length + 1);

        const sourceSubtreeIds = collectSubtreeIds(currentPage.nodes, sourceComponent.id);
        const sourceSubtree = currentPage.nodes.filter((node) => sourceSubtreeIds.has(node.id));
        if (sourceSubtree.length === 0) return state;

        const idMap = new Map<string, string>();
        sourceSubtree.forEach((node) => idMap.set(node.id, uuidv4()));
        const newRootId = idMap.get(sourceComponent.id);
        if (!newRootId) return state;

        const clonedVariantSubtree = sourceSubtree.map((sourceNode) => {
            const isRoot = sourceNode.id === sourceComponent.id;
            const cloneId = idMap.get(sourceNode.id) || uuidv4();
            const cloneParentId = isRoot
                ? sourceComponent.parentId
                : (sourceNode.parentId ? idMap.get(sourceNode.parentId) : undefined);
            const clone = deepClone(sourceNode) as SceneNode;

            const nextNode = {
                ...clone,
                id: cloneId,
                parentId: cloneParentId,
                masterId: undefined,
                x: isRoot ? sanitizeCoordinate(clone.x + 40, clone.x) : clone.x,
                y: isRoot ? sanitizeCoordinate(clone.y + 40, clone.y) : clone.y,
                variantGroupId: variantGroupId,
                variantName: isRoot ? `Variant ${variantNumber}` : undefined,
                name: isRoot ? `${sourceComponent.name} / Variant ${variantNumber}` : clone.name,
            } as SceneNode;

            return sanitizeNodeGeometry(nextNode, clone);
        });

        const withUpdatedSource = currentPage.nodes.map((node) => {
            if (node.id !== sourceComponent.id) return node;
            return {
                ...node,
                variantGroupId,
                variantName: node.variantName || 'Variant 1',
            };
        });

        const sourceIndexes = currentPage.nodes
            .map((node, index) => (sourceSubtreeIds.has(node.id) ? index : -1))
            .filter((index) => index >= 0);
        const insertAt = sourceIndexes.length > 0 ? Math.max(...sourceIndexes) + 1 : withUpdatedSource.length;

        const nextNodes = [...withUpdatedSource];
        nextNodes.splice(insertAt, 0, ...clonedVariantSubtree);

        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: nextNodes } : page
        );
        return { pages, selectedIds: [newRootId] };
    }),

    switchInstanceVariant: (instanceId, variantComponentId) => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage) return state;

        const instanceNode = currentPage.nodes.find((node) => node.id === instanceId && node.type === 'instance');
        const targetVariant = currentPage.nodes.find((node) => node.id === variantComponentId && node.type === 'component');
        if (!instanceNode || !targetVariant) return state;

        const instanceMaster = instanceNode.masterId
            ? currentPage.nodes.find((node) => node.id === instanceNode.masterId && node.type === 'component')
            : undefined;
        if (!instanceMaster) return state;

        if (!instanceMaster.variantGroupId || instanceMaster.variantGroupId !== targetVariant.variantGroupId) {
            return state;
        }

        const oldInstanceSubtreeIds = collectSubtreeIds(currentPage.nodes, instanceNode.id);
        const filteredNodes = currentPage.nodes.filter((node) => !oldInstanceSubtreeIds.has(node.id));

        const rebuilt = cloneComponentSubtreeAsInstance(filteredNodes, targetVariant, {
            rootId: instanceNode.id,
            rootX: instanceNode.x,
            rootY: instanceNode.y,
            rootParentId: instanceNode.parentId,
            rootName: instanceNode.name,
        });
        if (!rebuilt) return state;

        let nextNodes = [...filteredNodes, ...rebuilt.clonedSubtree];
        nextNodes = preserveInstanceSubtreeOverrides(currentPage.nodes, instanceNode.id, nextNodes, instanceNode.id);
        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: nextNodes } : page
        );
        return { pages, selectedIds: [instanceNode.id] };
    }),

    frameSelected: () => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage || state.selectedIds.length === 0) return state;

        const topLevelIds = getTopLevelSelectionIds(currentPage.nodes, state.selectedIds);
        if (topLevelIds.length === 0) return state;

        const commonParentId = getCommonParentId(currentPage.nodes, topLevelIds);
        const frameParentId = commonParentId === 'mixed' ? undefined : commonParentId;
        const keepParentContext = commonParentId !== 'mixed';

        const bounds = topLevelIds
            .map((id) => {
                const node = getNodeById(currentPage.nodes, id);
                if (!node) return null;
                const pos = keepParentContext
                    ? { x: node.x, y: node.y }
                    : getGlobalPosition(currentPage.nodes, id);
                return {
                    node,
                    x: pos.x,
                    y: pos.y,
                    right: pos.x + node.width,
                    bottom: pos.y + node.height,
                };
            })
            .filter((item): item is { node: SceneNode; x: number; y: number; right: number; bottom: number } => item !== null);

        if (bounds.length === 0) return state;

        const minX = Math.min(...bounds.map((item) => item.x));
        const minY = Math.min(...bounds.map((item) => item.y));
        const maxX = Math.max(...bounds.map((item) => item.right));
        const maxY = Math.max(...bounds.map((item) => item.bottom));

        const frameNode = createDefaultNode('frame', minX, minY) as FrameNode;
        frameNode.name = 'Frame';
        frameNode.parentId = frameParentId;
        frameNode.width = Math.max(1, maxX - minX);
        frameNode.height = Math.max(1, maxY - minY);
        frameNode.fill = 'transparent';
        frameNode.fills = [];
        frameNode.stroke = '#6366F1'; // Give it a visible stroke initially to see it
        frameNode.strokeWidth = 1;
        frameNode.clipsContent = false;
        frameNode.layoutMode = 'none';
        frameNode.padding = { top: 0, right: 0, bottom: 0, left: 0 };
        frameNode.gap = 0;

        const topLevelSet = new Set(topLevelIds);
        const reframedNodes = currentPage.nodes.map((node) => {
            if (!topLevelSet.has(node.id)) return node;
            const sourcePos = keepParentContext
                ? { x: node.x, y: node.y }
                : getGlobalPosition(currentPage.nodes, node.id);
            return {
                ...node,
                parentId: frameNode.id,
                x: sourcePos.x - frameNode.x,
                y: sourcePos.y - frameNode.y,
            };
        });

        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: [...reframedNodes, frameNode] } : page
        );

        return {
            pages,
            selectedIds: [frameNode.id],
        };
    }),

    copySelected: () => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage || state.selectedIds.length === 0) return state;

        const topLevelIds = getTopLevelSelectionIds(currentPage.nodes, state.selectedIds);
        if (topLevelIds.length === 0) return state;

        const copySet = new Set<string>();
        topLevelIds.forEach((id) => {
            copySet.add(id);
            collectDescendantIds(currentPage.nodes, id, copySet);
        });

        const copiedNodes = deepClone(currentPage.nodes.filter((node) => copySet.has(node.id)));
        if (copiedNodes.length === 0) return state;

        const copiedSet = new Set(copiedNodes.map((node) => node.id));
        const rootIds = copiedNodes
            .filter((node) => !node.parentId || !copiedSet.has(node.parentId))
            .map((node) => node.id);

        const normalizedNodes = copiedNodes.map((node) => {
            if (!rootIds.includes(node.id)) return node;
            const globalPos = getGlobalPosition(currentPage.nodes, node.id);
            return {
                ...node,
                parentId: undefined,
                x: globalPos.x,
                y: globalPos.y,
            };
        });

        const roots = normalizedNodes.filter((node) => rootIds.includes(node.id));
        const minX = Math.min(...roots.map((node) => node.x));
        const minY = Math.min(...roots.map((node) => node.y));

        clipboardSnapshot = {
            nodes: normalizedNodes,
            rootIds,
            minX,
            minY,
        };

        return state;
    }),

    pasteCopied: (x?: number, y?: number) => set((state) => {
        const currentPage = state.pages.find((page) => page.id === state.currentPageId);
        if (!currentPage || !clipboardSnapshot) return state;

        const clonedNodes = deepClone(clipboardSnapshot.nodes);
        const idMap = new Map<string, string>();
        const remappedNodes = clonedNodes.map((node) => {
            const newId = uuidv4();
            idMap.set(node.id, newId);
            return { ...node, id: newId };
        });

        const patchedNodes = remappedNodes.map((node) => ({
            ...node,
            parentId: node.parentId ? idMap.get(node.parentId) : undefined,
        }));

        const newRootIds = clipboardSnapshot.rootIds
            .map((rootId) => idMap.get(rootId))
            .filter((rootId): rootId is string => typeof rootId === 'string');

        if (newRootIds.length === 0) return state;

        const rootSet = new Set(newRootIds);
        const rootNodes = patchedNodes.filter((node) => rootSet.has(node.id));
        if (rootNodes.length === 0) return state;

        const currentMinX = Math.min(...rootNodes.map((node) => node.x));
        const currentMinY = Math.min(...rootNodes.map((node) => node.y));

        const targetX = typeof x === 'number' ? x : clipboardSnapshot.minX + 24 * (pasteNudgeCount + 1);
        const targetY = typeof y === 'number' ? y : clipboardSnapshot.minY + 24 * (pasteNudgeCount + 1);
        const dx = targetX - currentMinX;
        const dy = targetY - currentMinY;

        const movedNodes = patchedNodes.map((node) => {
            if (!rootSet.has(node.id)) return node;
            return {
                ...node,
                x: node.x + dx,
                y: node.y + dy,
            };
        });

        pasteNudgeCount += 1;

        const pages = state.pages.map((page) =>
            page.id === state.currentPageId ? { ...page, nodes: [...page.nodes, ...movedNodes] } : page
        );

        return {
            pages,
            selectedIds: toUniqueIds(newRootIds),
        };
    }),

    canPaste: () => clipboardSnapshot !== null,

  reorderNode: (id, index) => set((state) => {
      const currentPage = state.pages.find(p => p.id === state.currentPageId);
      if (!currentPage) return state;

      const newNodes = [...currentPage.nodes];
      const oldIndex = newNodes.findIndex(n => n.id === id);
      const node = newNodes.splice(oldIndex, 1)[0];
      newNodes.splice(index, 0, node);
      
      const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
      return { pages };
  }),

  moveNodeHierarchy: (dragId, targetId, position: 'before' | 'after' | 'inside') => set((state) => {
      const currentPage = state.pages.find(p => p.id === state.currentPageId);
      if (!currentPage) return state;

      let newNodes = [...currentPage.nodes];
      const dragNode = newNodes.find(n => n.id === dragId);
      if (!dragNode) return state;
      const oldParentId = dragNode.parentId;
      const movingSubtreeIds = collectSubtreeIds(currentPage.nodes, dragId);
      const movingSubtree = currentPage.nodes.filter((node) => movingSubtreeIds.has(node.id));
      if (movingSubtree.length === 0) return state;

      // Calculate new parent and index
      let newParentId: string | undefined;
      let newIndex: number;

      const targetNode = newNodes.find(n => n.id === targetId);
      if (!targetNode && targetId !== 'root') return state;

      if (position === 'inside') {
          newParentId = targetId === 'root' ? undefined : targetId;
          newIndex = newNodes.length; // Place at end of list (visually top if reversed)
      } else {
          newParentId = targetNode?.parentId;
          const targetIdx = newNodes.findIndex(n => n.id === targetId);
          newIndex = position === 'before' ? targetIdx : targetIdx + 1;
      }

      // Guard against circular hierarchy when dropping into descendants.
      const isDescendant = (ancestorId: string, candidateId: string | undefined): boolean => {
          if (!candidateId) return false;
          if (candidateId === ancestorId) return true;
          const parent = newNodes.find(n => n.id === candidateId)?.parentId;
          return isDescendant(ancestorId, parent);
      };

      if (isDescendant(dragId, newParentId)) {
          return state;
      }

      // 1. Remove subtree as a contiguous block while preserving descendants.
      newNodes = newNodes.filter(n => !movingSubtreeIds.has(n.id));
      
      // 2. Adjust coordinates if parent changed
      // (This is skipped here for simplicity as the user specifically asked for SIDEBAR dragging,
      // and usually you don't want items to jump in the canvas just because you moved them in layers)
      // Actually, if we change parent, we MUST adjust coordinates to keep visual pos
      // unless the user EXPECTS it to snap to the frame.
      // For sidebar drag, usually position preservation is key.

      const getGlobalPos = (id: string | undefined, list: SceneNode[]): {x: number, y: number} => {
          if (!id) return {x: 0, y: 0};
          const n = list.find(x => x.id === id);
          if (!n) return {x: 0, y: 0};
          const parentPos = getGlobalPos(n.parentId, list);
          return { x: n.x + parentPos.x, y: n.y + parentPos.y };
      };

      const oldGlobal = getGlobalPos(dragNode.parentId, currentPage.nodes);
      const newGlobal = getGlobalPos(newParentId, newNodes);

      const movedNode = {
          ...dragNode,
          parentId: newParentId,
          x: (dragNode.x + oldGlobal.x) - newGlobal.x,
          y: (dragNode.y + oldGlobal.y) - newGlobal.y
      };

      const movedSubtree = movingSubtree.map((node) => node.id === dragId ? movedNode : node);

      if (position === 'inside' && targetId !== 'root') {
          const containerSubtree = collectSubtreeIds(newNodes, targetId);
          const containerIndexes = newNodes
              .map((node, index) => (containerSubtree.has(node.id) ? index : -1))
              .filter((index) => index >= 0);
          newIndex = containerIndexes.length > 0 ? Math.max(...containerIndexes) + 1 : newNodes.length;
      } else if (targetId !== 'root') {
          const targetSubtree = collectSubtreeIds(newNodes, targetId);
          const targetIndexes = newNodes
              .map((node, index) => (targetSubtree.has(node.id) ? index : -1))
              .filter((index) => index >= 0);
          if (targetIndexes.length > 0) {
              newIndex = position === 'before' ? Math.min(...targetIndexes) : Math.max(...targetIndexes) + 1;
          }
      }

      // 3. Insert subtree at new index.
      newNodes.splice(Math.min(newIndex, newNodes.length), 0, ...movedSubtree);
      newNodes = reflowNodeBranches(newNodes, [oldParentId, newParentId]);

      const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
      return { pages };
  }),

  addVariable: (v) => set(s => ({ variables: [...s.variables, { ...v, id: uuidv4() }] })),
  addStyle: (st) => set(s => ({ styles: [...s.styles, { ...st, id: uuidv4() }] })),

    pushHistory: (source = 'manual') => set((state) => {
        const timestamp = Date.now();
        const snapshot = deepClone(state.pages);
        const nextHistory = state.history.slice(0, state.historyIndex + 1);
        const shouldMerge = Boolean(
            source !== 'manual' &&
            lastHistoryCommit &&
            lastHistoryCommit.source === source &&
            timestamp - lastHistoryCommit.timestamp <= HISTORY_MERGE_WINDOW_MS &&
            nextHistory.length > 0
        );

        if (shouldMerge) {
            nextHistory[nextHistory.length - 1] = snapshot;
        } else {
            nextHistory.push(snapshot);
            if (nextHistory.length > HISTORY_LIMIT) nextHistory.shift();
        }

        lastHistoryCommit = { source, timestamp };

        return {
            history: nextHistory,
            historyIndex: nextHistory.length - 1
        };
  }),

  deleteNodes: (ids) => set((state) => {
    const pages = state.pages.map(p => {
        if (p.id === state.currentPageId) {
            return { ...p, nodes: p.nodes.filter((n) => !ids.includes(n.id)) };
        }
        return p;
    });
    return { pages, selectedIds: [] };
  }),

  // Multi-Edit Logic
  selectMatching: () => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage || state.selectedIds.length === 0) return state;

    const firstSelected = currentPage.nodes.find(n => n.id === state.selectedIds[0]);
    if (!firstSelected) return state;

    const matchingIds = currentPage.nodes
        .filter(n => n.name === firstSelected.name && n.type === firstSelected.type)
        .map(n => n.id);
    
    return { selectedIds: matchingIds };
  }),

  alignSelected: (alignment) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage || state.selectedIds.length < 2) return state;

    const selectedNodes = currentPage.nodes.filter(n => state.selectedIds.includes(n.id));
    
    // Bounds calculation for the selection
    const left = Math.min(...selectedNodes.map(n => n.x));
    const right = Math.max(...selectedNodes.map(n => n.x + n.width));
    const top = Math.min(...selectedNodes.map(n => n.y));
    const bottom = Math.max(...selectedNodes.map(n => n.y + n.height));
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;

    let newNodes = [...currentPage.nodes];

    if (alignment === 'distribute-h' || alignment === 'distribute-v') {
        const sorted = [...selectedNodes].sort((a, b) => alignment === 'distribute-h' ? a.x - b.x : a.y - b.y);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        
        if (alignment === 'distribute-h') {
            const availableSpace = (last.x + last.width) - first.x;
            const totalWidths = sorted.reduce((sum, n) => sum + (n.width || 0), 0);
            const gap = (availableSpace - totalWidths) / (sorted.length - 1);
            let currentX = first.x;
            sorted.forEach(sn => {
                const nodeIdx = newNodes.findIndex(node => node.id === sn.id);
                if (nodeIdx !== -1) {
                  newNodes[nodeIdx] = { ...newNodes[nodeIdx], x: currentX };
                  currentX += (newNodes[nodeIdx].width || 0) + gap;
                }
            });
        } else {
            const availableSpace = (last.y + last.height) - first.y;
            const totalHeights = sorted.reduce((sum, n) => sum + (n.height || 0), 0);
            const gap = (availableSpace - totalHeights) / (sorted.length - 1);
            let currentY = first.y;
            sorted.forEach(sn => {
                const nodeIdx = newNodes.findIndex(node => node.id === sn.id);
                if (nodeIdx !== -1) {
                  newNodes[nodeIdx] = { ...newNodes[nodeIdx], y: currentY };
                  currentY += (newNodes[nodeIdx].height || 0) + gap;
                }
            });
        }
    } else {
        newNodes = newNodes.map(n => {
          if (!state.selectedIds.includes(n.id)) return n;
          
          let newX = n.x;
          let newY = n.y;

          switch (alignment) {
            case 'left': newX = left; break;
            case 'right': newX = right - (n.width || 0); break;
            case 'center-h': newX = centerX - (n.width || 0) / 2; break;
            case 'top': newY = top; break;
            case 'bottom': newY = bottom - (n.height || 0); break;
            case 'center-v': newY = centerY - (n.height || 0) / 2; break;
          }
          return { ...n, x: newX, y: newY };
        });
    }

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    return { pages };
  }),

  // Prototyping Mutation
    mutateVariable: (id: string, newValue: unknown) => set((state) => {
      const variables = state.variables.map(v => v.id === id ? { ...v, value: newValue } : v);
      return { variables };
  }),

  undo: () => set((state) => {
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
            resetHistoryCommit();
      return {
        pages: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),

  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
            resetHistoryCommit();
      return {
        pages: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),
}));
