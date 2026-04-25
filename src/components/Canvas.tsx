import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Ellipse, Text, Path, Line, Group, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useStore } from '../store';
import { createDefaultNode, Effect, ImageNode, Interaction, Paint, PathNode, SceneNode, TextNode, ToolType } from '../types';
import Konva from 'konva';
import { measureText } from '../lib/measureText';
import { getSuperellipsePath } from '../lib/geometry';
import {
  buildPathDataFromPenPoints,
  insertAnchorAtPoint,
  moveAnchorWithHandles,
  moveControlHandle,
  parsePathData,
  scalePathData,
  serializePathData,
  toggleAnchorCurve,
} from '../lib/pathTooling';
import type { PathAnchor } from '../lib/pathTooling';
import { buildMaskingRuns } from '../lib/masking';
import { scaleSceneNode } from '../lib/nodeTransforms';
import { isDrawingTool as isRegisteredDrawingTool, isSelectionTool, matchToolShortcut } from '../lib/toolRegistry';
import type { DrawingToolType } from '../lib/toolRegistry';
import { computeViewportForZoomBox, getSelectableHitStack, normalizeCanvasRect, resolveDirectSelectCycle } from '../lib/toolSemantics';
import type { DirectSelectCycleState } from '../lib/toolSemantics';
import { FigmaRulers } from './Rulers';

type PenPoint = { x: number; y: number; cp1?: { x: number; y: number }; cp2?: { x: number; y: number } };
type CanvasMouseEvent = Konva.KonvaEventObject<MouseEvent>;
type CanvasWheelEvent = Konva.KonvaEventObject<WheelEvent>;

interface ContextMenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface KonvaImageProps {
  node: ImageNode;
  konvaProps: React.ComponentProps<typeof Rect>;
  selectionProps: React.ComponentProps<typeof Rect> | null;
  hoverProps: React.ComponentProps<typeof Rect> | null;
}

const isFrameLikeNode = (node: SceneNode): boolean =>
  node.type === 'frame' ||
  node.type === 'section' ||
  node.type === 'group' ||
  node.type === 'component' ||
  node.type === 'instance';

interface SanitizedCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

const clampCornerValue = (value: number, fallback: number, maxCornerRadius: number): number => {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!Number.isFinite(value)) return Math.min(maxCornerRadius, Math.max(0, safeFallback));
  return Math.min(maxCornerRadius, Math.max(0, value));
};

const getSanitizedCornerData = (node: Pick<SceneNode, 'width' | 'height' | 'cornerRadius' | 'individualCornerRadius' | 'cornerSmoothing'>) => {
  const safeWidth = Number.isFinite(node.width) ? Math.abs(node.width) : 0;
  const safeHeight = Number.isFinite(node.height) ? Math.abs(node.height) : 0;
  const maxCornerRadius = Math.max(0, Math.min(safeWidth, safeHeight) / 2);
  const uniform = clampCornerValue(node.cornerRadius || 0, 0, maxCornerRadius);
  const corners: SanitizedCorners = {
    topLeft: clampCornerValue(node.individualCornerRadius?.topLeft ?? uniform, uniform, maxCornerRadius),
    topRight: clampCornerValue(node.individualCornerRadius?.topRight ?? uniform, uniform, maxCornerRadius),
    bottomRight: clampCornerValue(node.individualCornerRadius?.bottomRight ?? uniform, uniform, maxCornerRadius),
    bottomLeft: clampCornerValue(node.individualCornerRadius?.bottomLeft ?? uniform, uniform, maxCornerRadius),
  };

  const smoothingRaw = Number.isFinite(node.cornerSmoothing) ? node.cornerSmoothing : 0;
  const smoothing = Math.min(1, Math.max(0, smoothingRaw));

  return {
    uniform,
    corners,
    cornerRadiusArray: [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft] as [number, number, number, number],
    smoothing,
  };
};

const KonvaImage = ({ node, konvaProps, selectionProps, hoverProps }: KonvaImageProps) => {
    const [img] = useImage(node.src, 'anonymous');
    const cornerData = getSanitizedCornerData(node);
    
    const getScaleProps = () => {
        if (!img) return {};
        
        const mode = node.imageScaleMode || 'fill';
        const nodeWidth = node.width;
        const nodeHeight = node.height;
        const imgWidth = img.width;
        const imgHeight = img.height;
        
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let repeat = 'no-repeat';

        if (mode === 'fill') {
            scale = Math.max(nodeWidth / imgWidth, nodeHeight / imgHeight);
            offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
            offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
        } else if (mode === 'fit') {
            scale = Math.min(nodeWidth / imgWidth, nodeHeight / imgHeight);
            offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
            offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
        } else if (mode === 'tile') {
            scale = node.imageScale || 1;
            repeat = 'repeat';
        } else {
            // Stretch (default / old behavior)
            return {
                fillPatternImage: img,
                fillPatternScaleX: nodeWidth / imgWidth,
                fillPatternScaleY: nodeHeight / imgHeight,
                fillPatternRepeat: 'no-repeat'
            };
        }

        return {
            fillPatternImage: img,
            fillPatternScaleX: scale,
            fillPatternScaleY: scale,
            fillPatternOffset: { x: offsetX, y: offsetY },
            fillPatternRepeat: repeat
        };
    };

    const imageProps = getScaleProps();

    return (
        <Group>
            <Rect 
                {...konvaProps}
                {...imageProps}
                fill={!img ? '#E5E7EB' : undefined}
                lineJoin="round"
              cornerRadius={cornerData.cornerRadiusArray}
            />
             {selectionProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                cornerRadius={cornerData.cornerRadiusArray}
                    {...selectionProps}
                />
            )}
            {hoverProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                cornerRadius={cornerData.cornerRadiusArray}
                    {...hoverProps}
                />
            )}
        </Group>
    );
};

export const Canvas = () => {
  const { 
    pages, currentPageId, selectedIds, viewport, tool, setTool, setViewport, 
    addNode, updateNode, setSelectedIds, pushHistory, mode, hoveredId, guides: persistentGuides, snapLines, setSnapLines,
    deleteNodes, groupSelected, frameSelected, copySelected, pasteCopied, canPaste, updateGuide, removeGuide, variables
  } = useStore();
  
  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const directSelectCycleRef = useRef<DirectSelectCycleState | null>(null);
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [isDrawing, setIsDrawing] = useState(false);
  const [newNode, setNewNode] = useState<SceneNode | null>(null);
  
  // Selection Marquee
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  
  // Text Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingHeight, setEditingHeight] = useState<number | null>(null);

  // Pen Tool
  const [penPoints, setPenPoints] = useState<PenPoint[]>([]);
  const [isPenDragging, setIsPenDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHandActive, setSpaceHandActive] = useState(false);
  const [zoomRect, setZoomRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [directSelectHoverIds, setDirectSelectHoverIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedPathAnchor, setSelectedPathAnchor] = useState<{ nodeId: string; index: number } | null>(null);

  // Redlines
  const [altHeld, setAltHeld] = useState(false);
  const canvasCursor = isPanning
    ? 'grabbing'
    : (tool === 'hand' || spaceHandActive)
      ? 'grab'
      : tool === 'zoom'
        ? (altHeld ? 'zoom-out' : 'zoom-in')
        : (isRegisteredDrawingTool(tool) || tool === 'pen')
          ? 'crosshair'
          : 'default';

  useEffect(() => {
    window.canvasStage = stageRef.current || undefined;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.container().style.cursor = canvasCursor;
  }, [canvasCursor]);

  useEffect(() => {
    if (tool !== 'direct-select') {
      directSelectCycleRef.current = null;
      setDirectSelectHoverIds([]);
    }
  }, [tool]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isTypingFieldFocused = () => {
    const active = document.activeElement as HTMLElement | null;
    const activeTag = active?.tagName?.toLowerCase();
    return !!active && (active.isContentEditable || activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');
  };

  const zoomAtPointer = (pointer: { x: number; y: number }, zoomIn: boolean) => {
    const scaleBy = 1.15;
    const oldScale = viewport.zoom;
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    let newScale = zoomIn ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.min(Math.max(newScale, 0.05), 20);

    setViewport({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setAltHeld(true);
        if (!isTypingFieldFocused() && e.code === 'Space') {
          e.preventDefault();
          setSpaceHandActive(true);
          return;
        }
        if (!isTypingFieldFocused()) {
          const shortcutTool = matchToolShortcut(e);
          if (shortcutTool) {
            e.preventDefault();
            if (shortcutTool !== 'pen' && penPoints.length > 0) setPenPoints([]);
            setSelectedPathAnchor(null);
            setTool(shortcutTool);
            return;
          }
        }

        if (e.key === '.' || e.key === 'Decimal') {
            zoomToFitSelected();
        }

      const arrowDeltaMap: Record<string, { x: number; y: number }> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const arrowDelta = arrowDeltaMap[e.key];
      if (arrowDelta && mode !== 'prototype' && !editingId && selectedIds.length > 0) {
        e.preventDefault();

        const step = e.shiftKey ? 10 : 1;
        const dx = arrowDelta.x * step;
        const dy = arrowDelta.y * step;
        const selectedSet = new Set(selectedIds);
        const topLevelSelection = nodes.filter((node) => {
          if (!selectedSet.has(node.id)) return false;
          let parentId = node.parentId;
          while (parentId) {
            if (selectedSet.has(parentId)) return false;
            parentId = nodes.find((entry) => entry.id === parentId)?.parentId;
          }
          return true;
        });

        if (topLevelSelection.length === 0) return;

        if (topLevelSelection.length === 1) {
          const target = topLevelSelection[0];
          const currentGlobal = getGlobalPosition(target.id);
          const parentGlobal = target.parentId ? getGlobalPosition(target.parentId) : { x: 0, y: 0 };
          const snapped = snapGlobalPosition(
            currentGlobal.x + dx,
            currentGlobal.y + dy,
            target.width,
            target.height,
            target.id,
            5 / viewport.zoom,
            [target.id]
          );

          updateNode(target.id, {
            x: clampCoord(snapped.x - parentGlobal.x, target.x),
            y: clampCoord(snapped.y - parentGlobal.y, target.y),
          });
          setSnapLines(snapped.guides);
          setTimeout(() => setSnapLines([]), 90);
        } else {
          topLevelSelection.forEach((target) => {
            updateNode(target.id, {
              x: clampCoord(target.x + dx, target.x),
              y: clampCoord(target.y + dy, target.y),
            });
          });
          setSnapLines([]);
        }

        pushHistory();
        return;
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedPathAnchor(null);
        directSelectCycleRef.current = null;
        if (penPoints.length > 0) {
          setPenPoints([]);
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPathAnchor) {
        e.preventDefault();
        const node = nodes.find((entry) => entry.id === selectedPathAnchor.nodeId);
        if (node && node.type === 'path') {
          const parsed = parsePathData(node.data);
          const anchors = [...parsed.anchors];
          if (anchors.length > 2 && selectedPathAnchor.index >= 0 && selectedPathAnchor.index < anchors.length) {
            anchors.splice(selectedPathAnchor.index, 1);
            const shouldClose = parsed.closed && anchors.length >= 3;
            updateNode(node.id, { data: serializePathData(anchors, shouldClose) });
            pushHistory();
          }
        }
        setSelectedPathAnchor(null);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && mode !== 'prototype' && !editingId && selectedIds.length > 0) {
        if (!isTypingFieldFocused()) {
          e.preventDefault();
          deleteNodes(selectedIds);
          setSelectedIds([]);
          setSelectedPathAnchor(null);
          pushHistory();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setAltHeld(false);
      if (e.code === 'Space') setSpaceHandActive(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteNodes, editingId, mode, nodes, penPoints.length, pushHistory, selectedIds, selectedPathAnchor, setSnapLines, setTool, updateNode, viewport.zoom]);

  // Tool Tool Handlers

  const clampCoord = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(-1_000_000, Math.min(1_000_000, value));
  };

  const clampSize = (value: number, fallback = 1) => {
    if (!Number.isFinite(value)) return Math.max(1, fallback);
    return Math.max(1, Math.min(1_000_000, Math.abs(value)));
  };

  const insertPathAnchorAtPointer = (nodeId: string) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type !== 'path') return;

    const parsed = parsePathData(node.data);
    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const localPoint = { x: pointer.x - globalPos.x, y: pointer.y - globalPos.y };

    const result = insertAnchorAtPoint(parsed, localPoint);
    if (!result) return;

    updateNode(nodeId, { data: serializePathData(result.anchors, parsed.closed) });
    setSelectedPathAnchor({ nodeId, index: result.insertionIndex });
    pushHistory();
  };

  const zoomToFitSelected = () => {
    if (selectedIds.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedIds.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        const pos = getGlobalPosition(id);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + node.width);
        maxY = Math.max(maxY, pos.y + node.height);
      }
    });

    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 100;

    const container = document.getElementById('canvas-container');
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const zoom = Math.min((cw - padding * 2) / width, (ch - padding * 2) / height);
    const finalZoom = Math.max(0.05, Math.min(zoom, 8)); // Clamp zoom

    const newX = (cw / 2) - (minX + width / 2) * finalZoom;
    const newY = (ch / 2) - (minY + height / 2) * finalZoom;

    setViewport({ x: newX, y: newY, zoom: finalZoom });
  };

  const updatePathAnchors = (nodeId: string, updater: (anchors: PathAnchor[]) => void) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type === 'path') {
        const parsed = parsePathData(node.data);
        const anchors = [...parsed.anchors];
        updater(anchors);
        updateNode(nodeId, { data: serializePathData(anchors, parsed.closed) });
    }
  };

  const handlePointDragMove = (nodeId: string, index: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'path') return;

    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const nextX = pointer.x - globalPos.x;
    const nextY = pointer.y - globalPos.y;

    updatePathAnchors(nodeId, (anchors) => {
      const next = moveAnchorWithHandles(anchors, index, { x: nextX, y: nextY });
      anchors.splice(0, anchors.length, ...next);
    });
  };

  const handleControlPointDragMove = (nodeId: string, index: number, kind: 'in' | 'out', event: CanvasMouseEvent) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'path') return;

    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const nextX = pointer.x - globalPos.x;
    const nextY = pointer.y - globalPos.y;
    const mirrorHandle = !event.evt.altKey;

    updatePathAnchors(nodeId, (anchors) => {
      const next = moveControlHandle(anchors, index, kind, { x: nextX, y: nextY }, mirrorHandle);
      anchors.splice(0, anchors.length, ...next);
    });
  };

  const togglePathAnchorMode = (nodeId: string, index: number) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type !== 'path') return;

    const parsed = parsePathData(node.data);
    const anchors = [...parsed.anchors];
    const toggled = toggleAnchorCurve(anchors, index);
    updateNode(nodeId, { data: serializePathData(toggled, parsed.closed) });
    setSelectedPathAnchor({ nodeId, index });
    pushHistory();
  };

  const filterTopLevelSelection = (ids: string[]): string[] => {
    const selectedSet = new Set(ids);

    const hasSelectedAncestor = (nodeId: string): boolean => {
      let cursor = nodes.find((node) => node.id === nodeId)?.parentId;
      while (cursor) {
        if (selectedSet.has(cursor)) return true;
        cursor = nodes.find((node) => node.id === cursor)?.parentId;
      }
      return false;
    };

    return ids.filter((nodeId) => !hasSelectedAncestor(nodeId));
  };

  const collectDescendantIds = (rootId: string): string[] => {
    const children = nodes.filter((node) => node.parentId === rootId);
    return children.flatMap((child) => [child.id, ...collectDescendantIds(child.id)]);
  };

  const buildScalePatch = (originalNode: SceneNode, scaledNode: SceneNode, includePosition: boolean): Partial<SceneNode> => {
    const patch: Partial<SceneNode> & {
      data?: PathNode['data'];
      fontSize?: TextNode['fontSize'];
      lineHeight?: TextNode['lineHeight'];
      imageTransform?: ImageNode['imageTransform'];
      radiusX?: number;
      radiusY?: number;
    } = {
      width: scaledNode.width,
      height: scaledNode.height,
      strokeWidth: scaledNode.strokeWidth,
      cornerRadius: scaledNode.cornerRadius,
      individualCornerRadius: scaledNode.individualCornerRadius,
      effects: scaledNode.effects,
    };

    if (includePosition) {
      patch.x = scaledNode.x;
      patch.y = scaledNode.y;
    }

    if (scaledNode.type === 'path' && originalNode.type === 'path') {
      patch.data = scaledNode.data;
    }

    if (scaledNode.type === 'text' && originalNode.type === 'text') {
      patch.fontSize = scaledNode.fontSize;
      patch.lineHeight = scaledNode.lineHeight;
    }

    if (scaledNode.type === 'image' && originalNode.type === 'image') {
      patch.imageTransform = scaledNode.imageTransform;
    }

    if (scaledNode.type === 'ellipse' && originalNode.type === 'ellipse') {
      patch.radiusX = scaledNode.radiusX;
      patch.radiusY = scaledNode.radiusY;
    }

    return patch;
  };

  // Handle selection Transformer
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      if (editingId || penPoints.length > 0) {
        transformerRef.current.nodes([]);
        return;
      }
      const selectedNodes = filterTopLevelSelection(selectedIds)
        .map(id => stageRef.current?.findOne('#' + id))
        .filter(node => node !== undefined) as Konva.Node[];
      
      transformerRef.current.nodes(selectedNodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds, nodes, editingId]);

  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const pointer = stage.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    
    return {
      x: (pointer.x - viewport.x) / viewport.zoom,
      y: (pointer.y - viewport.y) / viewport.zoom,
    };
  };

  const getGlobalPosition = (nodeId: string): { x: number, y: number } => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    if (!node.parentId) return { x: node.x, y: node.y };
    const parentPos = getGlobalPosition(node.parentId);
    return { x: parentPos.x + node.x, y: parentPos.y + node.y };
  };

  const evaluateInteractionCondition = (condition: Interaction['condition']) => {
    if (!condition) return true;

    const variable = useStore.getState().variables.find((entry) => entry.id === condition.variableId);
    if (!variable) return false;

    const leftValue = variable.value;
    const rightValue = condition.value;

    switch (condition.operator) {
      case '==':
        return leftValue === rightValue;
      case '!=':
        return leftValue !== rightValue;
      case '>':
        return Number(leftValue) > Number(rightValue);
      case '<':
        return Number(leftValue) < Number(rightValue);
      case '>=':
        return Number(leftValue) >= Number(rightValue);
      case '<=':
        return Number(leftValue) <= Number(rightValue);
      default:
        return false;
    }
  };

  const runNodeInteractions = (node: SceneNode, trigger: 'onClick' | 'onHover' | 'onDrag') => {
    if (mode !== 'prototype') return;
    const interactions = (node.interactions || []).filter((interaction) => interaction.trigger === trigger);
    if (interactions.length === 0) return;

    interactions.forEach((interaction) => {
      if (!evaluateInteractionCondition(interaction.condition)) return;
      interaction.actions.forEach((action) => {
        if (action.type === 'navigate') {
          const targetId = typeof action.targetId === 'string'
            ? action.targetId
            : (typeof action.value === 'string' ? action.value : undefined);

          if (targetId && pages.some((page) => page.id === targetId)) {
            useStore.getState().setPage(targetId);
          }
          return;
        }

        if (action.type === 'setVariable') {
          if (typeof action.targetId === 'string') {
            useStore.getState().mutateVariable(action.targetId, action.value);
          }
          return;
        }

        if (action.type === 'toggleVisibility') {
          if (typeof action.targetId !== 'string') return;
          const targetNode = nodes.find((entry) => entry.id === action.targetId);
          if (!targetNode) return;
          updateNode(action.targetId, { visible: !targetNode.visible });
        }
      });
    });
  };

  const findInnermostFrame = (x: number, y: number, excludeIds: string[] = []): string | undefined => {
    const frames = nodes.filter(n => {
      if (!isFrameLikeNode(n) || excludeIds.includes(n.id)) return false;
      const globalPos = getGlobalPosition(n.id);
      return x >= globalPos.x && x <= globalPos.x + n.width &&
             y >= globalPos.y && y <= globalPos.y + n.height;
    });

    if (frames.length === 0) return undefined;
    // Smallest area usually means most nested frame
    return frames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0].id;
  };

  const snapGlobalPosition = (
    globalX: number,
    globalY: number,
    width: number,
    height: number,
    nodeId: string,
    snapThreshold: number,
    excludedIds: string[] = []
  ): { x: number; y: number; guides: { x?: number; y?: number }[] } => {
    let snappedX = globalX;
    let snappedY = globalY;
    const guides: { x?: number; y?: number }[] = [];
    const excludedSet = new Set(excludedIds);
    const dedupeThreshold = Math.max(0.25, snapThreshold * 0.35);

    nodes.forEach((otherNode) => {
      if (otherNode.id === nodeId || excludedSet.has(otherNode.id)) return;
      const otherPos = getGlobalPosition(otherNode.id);

      if (Math.abs(snappedX - otherPos.x) < snapThreshold) {
        snappedX = otherPos.x;
        guides.push({ x: otherPos.x });
      }
      if (Math.abs(snappedX + width / 2 - (otherPos.x + otherNode.width / 2)) < snapThreshold) {
        snappedX = otherPos.x + otherNode.width / 2 - width / 2;
        guides.push({ x: otherPos.x + otherNode.width / 2 });
      }
      if (Math.abs(snappedX + width - (otherPos.x + otherNode.width)) < snapThreshold) {
        snappedX = otherPos.x + otherNode.width - width;
        guides.push({ x: otherPos.x + otherNode.width });
      }

      if (Math.abs(snappedY - otherPos.y) < snapThreshold) {
        snappedY = otherPos.y;
        guides.push({ y: otherPos.y });
      }
      if (Math.abs(snappedY + height / 2 - (otherPos.y + otherNode.height / 2)) < snapThreshold) {
        snappedY = otherPos.y + otherNode.height / 2 - height / 2;
        guides.push({ y: otherPos.y + otherNode.height / 2 });
      }
      if (Math.abs(snappedY + height - (otherPos.y + otherNode.height)) < snapThreshold) {
        snappedY = otherPos.y + otherNode.height - height;
        guides.push({ y: otherPos.y + otherNode.height });
      }
    });

    persistentGuides.forEach((guide) => {
      if (guide.type === 'vertical') {
        if (Math.abs(snappedX - guide.position) < snapThreshold) {
          snappedX = guide.position;
          guides.push({ x: guide.position });
        }
        if (Math.abs(snappedX + width / 2 - guide.position) < snapThreshold) {
          snappedX = guide.position - width / 2;
          guides.push({ x: guide.position });
        }
        if (Math.abs(snappedX + width - guide.position) < snapThreshold) {
          snappedX = guide.position - width;
          guides.push({ x: guide.position });
        }
      } else {
        if (Math.abs(snappedY - guide.position) < snapThreshold) {
          snappedY = guide.position;
          guides.push({ y: guide.position });
        }
        if (Math.abs(snappedY + height / 2 - guide.position) < snapThreshold) {
          snappedY = guide.position - height / 2;
          guides.push({ y: guide.position });
        }
        if (Math.abs(snappedY + height - guide.position) < snapThreshold) {
          snappedY = guide.position - height;
          guides.push({ y: guide.position });
        }
      }
    });

    const dedupedGuides: { x?: number; y?: number }[] = [];
    guides.forEach((guide) => {
      const hasEquivalent = dedupedGuides.some((existing) => {
        const xClose = typeof guide.x === 'number' && typeof existing.x === 'number' && Math.abs(guide.x - existing.x) <= dedupeThreshold;
        const yClose = typeof guide.y === 'number' && typeof existing.y === 'number' && Math.abs(guide.y - existing.y) <= dedupeThreshold;
        return xClose || yClose;
      });
      if (!hasEquivalent) dedupedGuides.push(guide);
    });

    return { x: snappedX, y: snappedY, guides: dedupedGuides };
  };

  const finalizePenPath = (closed: boolean = false) => {
    const built = buildPathDataFromPenPoints(penPoints, closed);
    if (!built) {
      setPenPoints([]);
      return;
    }

    const node = createDefaultNode('path', built.bounds.minX, built.bounds.minY) as PathNode;
    node.data = built.data;
    node.width = built.bounds.width;
    node.height = built.bounds.height;
    node.strokeWidth = 2;
    node.stroke = '#6366F1';
    addNode(node);
    setPenPoints([]);
    pushHistory();
  };

  const handleMouseDown = (e: CanvasMouseEvent) => {
    setContextMenu(null);

    if (e.evt.button === 2) {
      return;
    }

    // Middle Mouse Button (button 1) for panning
    if (e.evt.button === 1 || tool === 'hand' || spaceHandActive) {
      setIsPanning(true);
      const stage = stageRef.current;
      if (stage) {
        stage.container().style.cursor = 'grabbing';
      }
      return;
    }

    if (mode === 'prototype') {
      return;
    }

    // Stop editing if clicking elsewhere
    if (editingId) {
      updateNode(editingId, { text: editingText });
      pushHistory();
      setEditingId(null);
    }

    const clickedOnStage = e.target === e.target.getStage();
    const isActiveDrawingTool = isRegisteredDrawingTool(tool);

    if (tool === 'zoom') {
      const { x, y } = getPointerPosition();
      setZoomRect({ x, y, width: 0, height: 0 });
      return;
    }

    // If text tool and clicked on existing text, edit it instead of creating new
    if (tool === 'text' && !clickedOnStage) {
        const id = e.target.id();
        const node = nodes.find(n => n.id === id);
        if (node?.type === 'text') {
            handleTextDblClick(node);
            return;
        }
    }
    if (clickedOnStage || isActiveDrawingTool || tool === 'pen' || isSelectionTool(tool)) {
      if (isActiveDrawingTool) {
        const { x, y } = getPointerPosition();
        const parentId = findInnermostFrame(x, y);
        let finalX = x;
        let finalY = y;
        
        if (parentId) {
            const parentPos = getGlobalPosition(parentId);
            finalX -= parentPos.x;
            finalY -= parentPos.y;
        }

        const node = createDefaultNode(tool as DrawingToolType, finalX, finalY);
        node.parentId = parentId;
        node.width = 0;
        node.height = 0;
        setNewNode(node);
        setIsDrawing(true);
        setSelectedIds([]);
        
        // Also start selection marquee in case they drag
        setSelectionRect({ x, y, width: 0, height: 0 });
      } else if (tool === 'pen') {
        const { x, y } = getPointerPosition();
        
        // If clicking near first point, close it
        if (penPoints.length > 2) {
            const first = penPoints[0];
            const dist = Math.sqrt(Math.pow(x - first.x, 2) + Math.pow(y - first.y, 2));
            if (dist < 10 / viewport.zoom) {
                finalizePenPath(true);
                return;
            }
        }
        
        setIsPenDragging(true);
        setPenPoints([...penPoints, { x, y, cp1: {x, y}, cp2: {x, y} }]);
      } else if (isSelectionTool(tool)) {
        const id = e.target.id();
        const clickedFrame = nodes.find(n => n.id === id && (n.type === 'frame' || n.type === 'section'));
        
        if (clickedOnStage) {
            const { x, y } = getPointerPosition();
            setSelectionRect({ x, y, width: 0, height: 0 });
            setSelectedIds([]);
          directSelectCycleRef.current = null;
          setSelectedPathAnchor(null);
        } else if (clickedFrame) {
            if (e.evt.shiftKey) setSelectedIds(Array.from(new Set([...selectedIds, clickedFrame.id])));
            else setSelectedIds([clickedFrame.id]);
          directSelectCycleRef.current = null;
          setSelectedPathAnchor(null);
        }
      }
      return;
    }
  };

  const handleMouseMove = (e: CanvasMouseEvent) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (isPanning) {
        if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
        const dx = e.evt.movementX;
        const dy = e.evt.movementY;
        setViewport({
            ...viewport,
            x: viewport.x + dx,
            y: viewport.y + dy
        });
        return;
    }

    if (tool === 'pen' && isPenDragging) {
      if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
        const { x, y } = getPointerPosition();
        const newPoints = [...penPoints];
        const last = newPoints[newPoints.length - 1];
        // Mirror the control points around the anchor point
        const dx = x - last.x;
        const dy = y - last.y;
        last.cp1 = { x: last.x - dx, y: last.y - dy };
        last.cp2 = { x: last.x + dx, y: last.y + dy };
        setPenPoints(newPoints);
        return;
    }

    if (isDrawing && newNode) {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scale = stage.scaleX();
      const x = (pointer.x - stage.x()) / scale;
      const y = (pointer.y - stage.y()) / scale;

      let localX = x;
      let localY = y;

      if (newNode.parentId) {
          const parentPos = getGlobalPosition(newNode.parentId);
          localX -= parentPos.x;
          localY -= parentPos.y;
      }

        if (newNode.type === 'ellipse') {
          setNewNode({
            ...newNode,
            width: localX - newNode.x,
            height: localY - newNode.y
          });
      } else if (newNode.type === 'text') {
          const w = localX - newNode.x;
          const h = localY - newNode.y;
          setNewNode({
              ...newNode,
              width: w,
              height: h,
              fontSize: Math.max(12, Math.abs(Math.floor(h / 1.2))) // Heuristic: font size is ~80% of box height
          });
      } else {
          setNewNode({
            ...newNode,
            width: localX - newNode.x,
            height: localY - newNode.y
          });
      }
    } else if (selectionRect) {
      const { x, y } = getPointerPosition();
      setSelectionRect({
        ...selectionRect,
        width: x - selectionRect.x,
        height: y - selectionRect.y
      });
    } else if (zoomRect) {
      const { x, y } = getPointerPosition();
      setZoomRect({
        ...zoomRect,
        width: x - zoomRect.x,
        height: y - zoomRect.y,
      });
    } else if (tool === 'direct-select') {
      const point = getPointerPosition();
      const hits = getSelectableHitStack(nodes, point).map((node) => node.id);
      setDirectSelectHoverIds((current) => {
        if (current.length === hits.length && current.every((id, index) => id === hits[index])) {
          return current;
        }
        return hits;
      });
    } else if (directSelectHoverIds.length > 0) {
      setDirectSelectHoverIds([]);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
        setIsPanning(false);
        const stage = stageRef.current;
        if (stage) {
        stage.container().style.cursor = canvasCursor;
        }
    }
    if (isPenDragging) {
        setIsPenDragging(false);
    }

    if (zoomRect) {
      const normalizedZoomRect = normalizeCanvasRect(zoomRect);
      const clickThreshold = 8 / viewport.zoom;
      const stage = stageRef.current;

      if (normalizedZoomRect.width < clickThreshold || normalizedZoomRect.height < clickThreshold) {
        const pointer = stage?.getPointerPosition();
        if (pointer) {
          zoomAtPointer(pointer, !altHeld);
        }
      } else {
        setViewport(computeViewportForZoomBox(normalizedZoomRect, dimensions, viewport));
      }

      setZoomRect(null);
      return;
    }

    if (isDrawing && newNode) {
      const isDrag = Math.abs(newNode.width) > 5 || Math.abs(newNode.height) > 5;
      
      if (isDrag || newNode.type === 'text' || newNode.type === 'image') {
        const finalNode = { ...newNode };
        if (finalNode.width < 0) { finalNode.x += finalNode.width; finalNode.width = Math.abs(finalNode.width); }
        if (finalNode.height < 0) { finalNode.y += finalNode.height; finalNode.height = Math.abs(finalNode.height); }
        
        if (finalNode.type === 'text' || finalNode.type === 'image') {
            if (isDrag) {
              finalNode.horizontalResizing = 'fixed';
              finalNode.verticalResizing = finalNode.type === 'text' ? 'hug' : 'fixed';
            } else {
              finalNode.width = 100; // Default min width for click
              finalNode.height = finalNode.type === 'image' ? 100 : 24;
              if (finalNode.type === 'text') finalNode.fontSize = 20; // Default for point text click
              finalNode.horizontalResizing = 'hug';
              finalNode.verticalResizing = 'hug';
            }
            if (finalNode.type === 'image') {
              finalNode.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60';
              finalNode.imageScaleMode = 'fill';
            }
        } else {
            finalNode.width = Math.max(finalNode.width, 20);
            finalNode.height = Math.max(finalNode.height, 20);
        }
        
        addNode(finalNode);
        pushHistory();
      }
      setIsDrawing(false);
      setNewNode(null);
      setSelectionRect(null);
    } else if (selectionRect) {
      // Perform marquee selection
      const box = {
        x: selectionRect.width < 0 ? selectionRect.x + selectionRect.width : selectionRect.x,
        y: selectionRect.height < 0 ? selectionRect.y + selectionRect.height : selectionRect.y,
        width: Math.abs(selectionRect.width),
        height: Math.abs(selectionRect.height)
      };

      const hits = nodes.filter(node => {
        const globalPos = getGlobalPosition(node.id);
        const nodeX = globalPos.x;
        const nodeY = globalPos.y;
        const nodeRight = nodeX + node.width;
        const nodeBottom = nodeY + node.height;
        const boxRight = box.x + box.width;
        const boxBottom = box.y + box.height;
        
        // Classic AABB intersection in global coordinates
        return (
            nodeX < boxRight &&
            nodeRight > box.x &&
            nodeY < boxBottom &&
            nodeBottom > box.y
        );
      }).map(n => n.id);

      setSelectedIds(hits);
      setSelectionRect(null);
    }
  };

  const handleCanvasContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const pointer = getPointerPosition();
    const targetId = e.target?.id?.();

    const isTargetSelected = targetId && selectedIds.includes(targetId);
    const hasMultiSelection = selectedIds.length > 1;

    if (targetId && nodes.some((node) => node.id === targetId) && !isTargetSelected && !hasMultiSelection) {
      setSelectedIds([targetId]);
    }

    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      canvasX: pointer.x,
      canvasY: pointer.y,
    });
  };

  const runContextAction = (action: 'copy' | 'paste' | 'duplicate' | 'group' | 'frame' | 'delete') => {
    if (action === 'copy') {
      copySelected();
      setContextMenu(null);
      return;
    }

    if (action === 'paste') {
      if (!contextMenu) return;
      pasteCopied(contextMenu.canvasX, contextMenu.canvasY);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'duplicate') {
      if (!contextMenu) return;
      copySelected();
      pasteCopied(contextMenu.canvasX + 24, contextMenu.canvasY + 24);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'group') {
      if (selectedIds.length < 2) return;
      groupSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'frame') {
      if (selectedIds.length === 0) return;
      frameSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'delete') {
      if (selectedIds.length === 0) return;
      deleteNodes(selectedIds);
      pushHistory();
      setContextMenu(null);
    }
  };

  const handleTextDblClick = (node: SceneNode) => {
    if (node.type === 'text') {
      setEditingId(node.id);
      setEditingText(node.text);
      setEditingHeight(node.height);
      setSelectedIds([]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditingText(newText);
    
    if (editingId) {
        const node = nodes.find(n => n.id === editingId);
        if (node && node.type === 'text') {
            const textNode = node as TextNode;
            const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
            const metrics = measureText(newText, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);
            setEditingHeight(metrics.height);
        }
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      updateNode(editingId!, { text: editingText });
      pushHistory();
      setEditingId(null);
      setEditingHeight(null);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditingHeight(null);
    }
  };

  const handleWheel = (e: CanvasWheelEvent) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = viewport.zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.min(Math.max(newScale, 0.05), 20); // Limit zoom

    setViewport({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleNodeDragStart = (e: CanvasMouseEvent) => {
    if (mode === 'prototype') return;
    const id = e.target.id();
    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  const handleNodeDragMove = (e: CanvasMouseEvent) => {
    if (mode === 'prototype') return;
    const node = e.target;
    const stage = stageRef.current;
    if (!stage) return;

    const nodeId = node.id();
    const draggedModel = nodes.find(n => n.id === nodeId);
    if (!draggedModel) return;
    const isCenterAnchored = draggedModel.type === 'circle' || draggedModel.type === 'ellipse';
    const currentWidth = clampSize(Math.abs(node.width() || draggedModel.width), Math.abs(draggedModel.width));
    const currentHeight = clampSize(Math.abs(node.height() || draggedModel.height), Math.abs(draggedModel.height));
    const anchorOffsetX = isCenterAnchored ? currentWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? currentHeight / 2 : 0;

    const parentGlobal = draggedModel.parentId ? getGlobalPosition(draggedModel.parentId) : { x: 0, y: 0 };

    const snapThreshold = 5 / viewport.zoom;
    
    const currentGlobalX = clampCoord(parentGlobal.x + node.x() - anchorOffsetX, draggedModel.x);
    const currentGlobalY = clampCoord(parentGlobal.y + node.y() - anchorOffsetY, draggedModel.y);
    const snapped = snapGlobalPosition(currentGlobalX, currentGlobalY, currentWidth, currentHeight, nodeId, snapThreshold);

    node.x(clampCoord(snapped.x - parentGlobal.x + anchorOffsetX, node.x()));
    node.y(clampCoord(snapped.y - parentGlobal.y + anchorOffsetY, node.y()));
    setSnapLines(snapped.guides);
  };

  const handleNodeUpdate = (e: CanvasMouseEvent) => {
    const konvaNode = e.target;
    const nodeId = konvaNode.id();
    const nodeData = nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    if (mode === 'prototype' && e.type === 'dragend') {
      runNodeInteractions(nodeData, 'onDrag');
      const isCenterAnchored = nodeData.type === 'circle' || nodeData.type === 'ellipse';
      const resetX = isCenterAnchored ? nodeData.x + nodeData.width / 2 : nodeData.x;
      const resetY = isCenterAnchored ? nodeData.y + nodeData.height / 2 : nodeData.y;
      konvaNode.x(resetX);
      konvaNode.y(resetY);
      konvaNode.getLayer()?.batchDraw();
      setSnapLines([]);
      return;
    }

    const isTransformEvent = e.type === 'transformend' || e.type === 'transform';

    const newWidth = clampSize(Math.abs(konvaNode.width() * konvaNode.scaleX()), Math.abs(nodeData.width));
    const newHeight = clampSize(Math.abs(konvaNode.height() * konvaNode.scaleY()), Math.abs(nodeData.height));
  const scaleFactorX = newWidth / Math.max(1, Math.abs(nodeData.width));
  const scaleFactorY = newHeight / Math.max(1, Math.abs(nodeData.height));
    const isCenterAnchored = nodeData.type === 'circle' || nodeData.type === 'ellipse';
    const anchorOffsetX = isCenterAnchored ? newWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? newHeight / 2 : 0;

    // Get stage-relative position and convert to canvas-global
    const absolutePos = konvaNode.getAbsolutePosition();
    const globalX = clampCoord((absolutePos.x - viewport.x) / viewport.zoom - anchorOffsetX, nodeData.x);
    const globalY = clampCoord((absolutePos.y - viewport.y) / viewport.zoom - anchorOffsetY, nodeData.y);
    const snappedTransform = snapGlobalPosition(globalX, globalY, newWidth, newHeight, nodeId, 5 / viewport.zoom);

    // We want to reparent based on where the node is dropped
    // Exclude self and children to avoid circular dependency
    const getDescendants = (id: string): string[] => {
      const children = nodes.filter(n => n.parentId === id);
      return [id, ...children.flatMap(c => getDescendants(c.id))];
    };
    const excluded = getDescendants(nodeId);
    
    // Use center of node for reparenting detection
    const newParentId = isTransformEvent
      ? nodeData.parentId
      : findInnermostFrame(
        globalX + (konvaNode.width() * konvaNode.scaleX()) / 2,
        globalY + (konvaNode.height() * konvaNode.scaleY()) / 2,
        excluded
      );

    let finalX = snappedTransform.x;
    let finalY = snappedTransform.y;

    if (newParentId) {
        const parentPos = getGlobalPosition(newParentId);
        finalX = clampCoord(finalX - parentPos.x, finalX);
        finalY = clampCoord(finalY - parentPos.y, finalY);
    }

    const wasResized = Math.abs(newWidth - nodeData.width) > 0.1 || Math.abs(newHeight - nodeData.height) > 0.1;

    const nextRootPatch: Partial<SceneNode> & { data?: PathNode['data'] } = {
      x: clampCoord(finalX, nodeData.x),
      y: clampCoord(finalY, nodeData.y),
      parentId: newParentId,
      width: newWidth,
      height: newHeight,
      rotation: konvaNode.rotation(),
      scaleX: 1,
      scaleY: 1,
      ...(wasResized ? {
        horizontalResizing: 'fixed',
        verticalResizing: 'fixed'
      } : {})
    };

    if (isTransformEvent && wasResized && nodeData.type === 'path') {
      Object.assign(nextRootPatch, { data: scalePathData(nodeData.data, scaleFactorX, scaleFactorY) });
    }

    if (isTransformEvent && wasResized && tool === 'scale') {
      const scaledRootNode = scaleSceneNode(nodeData, scaleFactorX, scaleFactorY, {
        scalePosition: false,
        scaleText: true,
        scaleStyle: true,
      });
      Object.assign(nextRootPatch, buildScalePatch(nodeData, scaledRootNode, false));
      nextRootPatch.x = clampCoord(finalX, nodeData.x);
      nextRootPatch.y = clampCoord(finalY, nodeData.y);
      nextRootPatch.parentId = newParentId;
      nextRootPatch.rotation = konvaNode.rotation();
      nextRootPatch.scaleX = 1;
      nextRootPatch.scaleY = 1;
    }

    updateNode(nodeId, nextRootPatch);

    if (isTransformEvent && wasResized && tool === 'scale') {
      collectDescendantIds(nodeId).forEach((descendantId) => {
        const descendant = nodes.find((node) => node.id === descendantId);
        if (!descendant) return;
        const scaledDescendant = scaleSceneNode(descendant, scaleFactorX, scaleFactorY, {
          scalePosition: true,
          scaleText: true,
          scaleStyle: true,
        });
        updateNode(descendantId, buildScalePatch(descendant, scaledDescendant, true));
      });
    }

    if (isTransformEvent) {
      konvaNode.scaleX(1);
      konvaNode.scaleY(1);
    }

    setSnapLines(snappedTransform.guides);
    setTimeout(() => setSnapLines([]), 90);
    pushHistory();
  };

  const renderSingleNode = (node: SceneNode) => {
    const isSelected = selectedIds.includes(node.id);
    const resolveVariableBinding = (bindingKey: 'fill' | 'stroke' | 'opacity' | 'text') => {
      const variableId = node.variableBindings?.[bindingKey];
      if (!variableId) return undefined;
      return variables.find((entry) => entry.id === variableId)?.value;
    };

    const boundFillValue = resolveVariableBinding('fill');
    const boundStrokeValue = resolveVariableBinding('stroke');
    const boundOpacityValue = resolveVariableBinding('opacity');
    const boundTextValue = resolveVariableBinding('text');

    const effectiveFill = typeof boundFillValue === 'string' ? boundFillValue : (node.fill || '#D9D9D9');
    const effectiveStroke = typeof boundStrokeValue === 'string' ? boundStrokeValue : (node.stroke || '#000000');
    const numericOpacity = typeof boundOpacityValue === 'number' ? boundOpacityValue : Number(boundOpacityValue);
    const effectiveOpacity = Number.isFinite(numericOpacity)
      ? Math.max(0, Math.min(1, numericOpacity))
      : (node.opacity || 1);
    const effectiveText = node.type === 'text' && typeof boundTextValue !== 'undefined'
      ? String(boundTextValue)
      : (node.type === 'text' ? node.text : undefined);

    const getVisibleFills = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-fill`, type: 'solid', color: fallback, opacity: 1, visible: true }];
    };

    const getVisibleStrokes = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-stroke`, type: 'solid', color: fallback, opacity: 1, visible: true }];
    };

    const getLinearGradientPoints = (paint: Paint) => {
      const angle = Number.isFinite(paint.gradientAngle) ? Number(paint.gradientAngle) : 0;
      const radians = (angle * Math.PI) / 180;
      const cx = node.width / 2;
      const cy = node.height / 2;
      const dx = Math.cos(radians) * (node.width / 2);
      const dy = Math.sin(radians) * (node.height / 2);
      return {
        start: { x: cx - dx, y: cy - dy },
        end: { x: cx + dx, y: cy + dy },
      };
    };

    const getGradientStops = (paint: Paint): (number | string)[] => {
      const rawStops = (paint.gradientStops || []).map((stop) => ({
        offset: Math.min(1, Math.max(0, Number.isFinite(stop.offset) ? stop.offset : 0)),
        color: stop.color,
      }));
      const stops = rawStops.length > 0 ? rawStops : [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }];
      const sorted = [...stops].sort((a, b) => a.offset - b.offset);
      const result: (number | string)[] = [];
      sorted.forEach((stop) => {
        result.push(stop.offset, stop.color);
      });
      return result;
    };

    const getPaintFillProps = (paint: Paint | undefined, fallback: string) => {
      const safePaint = paint || { id: `${node.id}-safe`, type: 'solid' as const, color: fallback, opacity: 1, visible: true };
      const opacity = effectiveOpacity * (safePaint.opacity || 1);

      if (safePaint.type === 'solid') {
        return { fill: safePaint.color || fallback, opacity };
      }

      if (safePaint.type === 'gradient-radial') {
        const center = safePaint.gradientCenter || { x: 0.5, y: 0.5 };
        const radius = Math.max(0.05, Math.min(1, safePaint.gradientRadius ?? 0.5));
        const baseRadius = Math.min(Math.abs(node.width), Math.abs(node.height)) * radius;
        return {
          fillRadialGradientStartPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientEndRadius: baseRadius,
          fillRadialGradientColorStops: getGradientStops(safePaint),
          opacity,
        };
      }

      const { start, end } = getLinearGradientPoints(safePaint);
      return {
        fillLinearGradientStartPoint: start,
        fillLinearGradientEndPoint: end,
        fillLinearGradientColorStops: getGradientStops(safePaint),
        opacity,
      };
    };

    const fillPaints = getVisibleFills(node.fills, effectiveFill);
    const topFillPaint = fillPaints[fillPaints.length - 1];
    const underFillPaints = fillPaints.slice(0, -1);
    let fillProps = getPaintFillProps(topFillPaint, effectiveFill);

    const strokePaints = getVisibleStrokes(node.strokes, effectiveStroke);
    const topStrokePaint = strokePaints[strokePaints.length - 1];
    const strokeColor = topStrokePaint?.type === 'solid' ? (topStrokePaint.color || effectiveStroke) : effectiveStroke;
    const strokeOpacity = effectiveOpacity * (topStrokePaint?.opacity || 1);

    // Keep mask visuals readable and non-destructive on canvas.
    if (node.isMask) {
      fillProps = { fill: 'rgba(59, 130, 246, 0.18)', opacity: 1 };
      underFillPaints.length = 0;
    }
    const cornerData = getSanitizedCornerData(node);
    const cornerRadiusArray = cornerData.cornerRadiusArray;
    const smoothCornerRadius = cornerData.uniform;
    const smoothCornerSmoothing = cornerData.smoothing;

    // Effects
    const effects: Effect[] = node.effects || [];
    const dropShadow = effects.find((effect) => effect.visible !== false && effect.type === 'drop-shadow');
    const shadowProps = dropShadow ? {
        shadowColor: dropShadow.color,
        shadowBlur: dropShadow.radius,
        shadowOffset: dropShadow.offset,
        shadowOpacity: 1,
    } : {};

    const layerBlur = effects.find((effect) => effect.visible !== false && effect.type === 'layer-blur');
    const backgroundBlur = effects.find((effect) => effect.visible !== false && effect.type === 'background-blur');
    const innerShadow = effects.find((effect) => effect.visible !== false && effect.type === 'inner-shadow');
    const blurProps = layerBlur ? {
        filters: [Konva.Filters.Blur],
        blurRadius: layerBlur.radius,
    } : {};

    const innerShadowColor = innerShadow?.color || 'rgba(0, 0, 0, 0.65)';
    const innerShadowOffset = innerShadow?.offset || { x: 0, y: 0 };
    const innerShadowBlur = Math.max(0, innerShadow?.radius || 0);

    const backgroundBlurOverlayProps = backgroundBlur
      ? {
          filters: [Konva.Filters.Blur],
          blurRadius: Math.max(0, backgroundBlur.radius || 0),
          opacity: 0.16,
          fill: 'rgba(255,255,255,0.32)',
        }
      : null;

    const blendModeMap: Record<string, GlobalCompositeOperation> = {
      'pass-through': 'source-over',
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
    };

    const { key: _key, ...konvaProps } = {
      id: node.id,
      key: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
      globalCompositeOperation: blendModeMap[node.blendMode || 'normal'] || 'source-over',
      draggable:
        node.draggable &&
        !node.locked &&
        !isPanning &&
        (mode === 'prototype'
          ? (node.interactions || []).some((interaction) => interaction.trigger === 'onDrag')
          : isSelectionTool(tool)),
      listening: node.visible,
      dash: node.isMask ? [8 / viewport.zoom, 4 / viewport.zoom] : undefined,
      cornerRadius: cornerRadiusArray,
      ...shadowProps,
      ...blurProps,
      onDragMove: handleNodeDragMove,
      onDragStart: handleNodeDragStart,
      onDragEnd: handleNodeUpdate,
      onTransformEnd: handleNodeUpdate,
        onTransform: (e: CanvasMouseEvent) => {
          const nodeTarget = e.target;
          if (isFrameLikeNode(node)) {
            return;
          }
          const scaleX = nodeTarget.scaleX();
          const scaleY = nodeTarget.scaleY();
          
          const isShift = e.evt.shiftKey;
          const isAlt = e.evt.altKey;

          const newWidth = clampSize(nodeTarget.width() * scaleX, node.width);
          const newHeight = clampSize(nodeTarget.height() * scaleY, node.height);

          // Constraints: if text node with hug, we might want to restrict height
          // but Konva Transformer generally changes width/height directly here.
          
          nodeTarget.setAttrs({
            width: newWidth,
            height: newHeight,
            scaleX: 1,
            scaleY: 1
          });

          if (isAlt) {
              // Center scaling is natively handled by Transformer if centeredScaling=true,
              // but we can manually adjust if needed or just rely on Konva.
              // For now we improve the min-size behavior.
          }
      },
      onClick: (e: CanvasMouseEvent) => {
        if (node.locked) return;
        if (typeof e.evt.button === 'number' && e.evt.button !== 0) return;

        if (mode === 'prototype') {
          e.cancelBubble = true;
          runNodeInteractions(node, 'onClick');
          return;
        }

        e.cancelBubble = true;
        if (tool === 'direct-select') {
          const point = getPointerPosition();
          const cycle = resolveDirectSelectCycle(nodes, point, directSelectCycleRef.current);
          directSelectCycleRef.current = cycle.cycle;
          if (cycle.node) {
            if (e.evt.shiftKey) {
              setSelectedIds(Array.from(new Set([...selectedIds, cycle.node.id])));
            } else {
              setSelectedIds([cycle.node.id]);
            }
            setSelectedPathAnchor(null);
            return;
          }
        }
        directSelectCycleRef.current = null;
        if (e.evt.shiftKey) {
          setSelectedIds(Array.from(new Set([...selectedIds, node.id])));
        } else {
          setSelectedIds([node.id]);
        }
        setSelectedPathAnchor(null);
      },
      onDblClick: () => handleTextDblClick(node),
      onMouseEnter: () => {
        useStore.getState().setHoveredId(node.id);
        runNodeInteractions(node, 'onHover');
      },
      onMouseLeave: () => useStore.getState().setHoveredId(null),
    };

    const isComponentRelated = node.type === 'component' || node.type === 'instance';
    const selectionColor = isComponentRelated ? '#A855F7' : '#6366F1';
    
    const selectionProps = isSelected ? {
        stroke: selectionColor,
        strokeWidth: 2 / viewport.zoom,
        dash: node.type === 'instance' ? [4 / viewport.zoom, 2 / viewport.zoom] : undefined,
        listening: false,
    } : null;

    const isHovered = useStore.getState().hoveredId === node.id && !isSelected;
    const hoverProps = isHovered ? {
        stroke: selectionColor,
        strokeWidth: 1 / viewport.zoom,
        listening: false,
        opacity: 0.5
    } : null;

    if (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
        const hasSmoothing = smoothCornerSmoothing > 0;
        const isTopLevel = !node.parentId;
        
        return (
            <Group key={node.id}>
                {isTopLevel && (
                    <Text 
                        x={node.x}
                        y={node.y - (14 / viewport.zoom)}
                        text={node.name}
                        fontSize={11 / viewport.zoom}
                        fontFamily="Inter"
                        fill={isSelected ? selectionColor : "#A1A1A1"}
                        fontStyle="600"
                    />
                )}
                <Group 
                    {...konvaProps} 
                    name="frame"
                    clipFunc={node.clipsContent ? (ctx) => {
                      const r = cornerData.corners;
                        const w = node.width;
                        const h = node.height;
                        ctx.beginPath();
                        ctx.moveTo(r.topLeft, 0);
                        ctx.lineTo(w - r.topRight, 0);
                        ctx.quadraticCurveTo(w, 0, w, r.topRight);
                        ctx.lineTo(w, h - r.bottomRight);
                        ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                        ctx.lineTo(r.bottomLeft, h);
                        ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                        ctx.lineTo(0, r.topLeft);
                        ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
                        ctx.closePath();
                    } : undefined}
                >
                  {underFillPaints.map((paint) => {
                    const layerProps = getPaintFillProps(paint, effectiveFill);
                    if (hasSmoothing) {
                      return (
                        <Path
                          key={`${node.id}-under-${paint.id}`}
                          data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                          {...layerProps}
                          listening={false}
                        />
                      );
                    }
                    return (
                      <Rect
                        key={`${node.id}-under-${paint.id}`}
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        {...layerProps}
                        lineJoin="round"
                        listening={false}
                      />
                    );
                  })}
                    {hasSmoothing ? (
                        <Path 
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                            {...fillProps}
                        />
                    ) : (
                        <Rect 
                            width={node.width} 
                            height={node.height} 
                            cornerRadius={cornerRadiusArray}
                            {...fillProps}
                            lineJoin="round"
                        />
                    )}
                  {node.strokeWidth > 0 && (
                    hasSmoothing ? (
                      <Path
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                        fillEnabled={false}
                        stroke={strokeColor}
                        strokeWidth={node.strokeWidth}
                        opacity={strokeOpacity}
                        listening={false}
                      />
                    ) : (
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        fillEnabled={false}
                        stroke={strokeColor}
                        strokeWidth={node.strokeWidth}
                        opacity={strokeOpacity}
                        lineJoin="round"
                        listening={false}
                      />
                    )
                  )}
                  {backgroundBlurOverlayProps && (
                    hasSmoothing ? (
                      <Path
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                        {...backgroundBlurOverlayProps}
                        listening={false}
                      />
                    ) : (
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        {...backgroundBlurOverlayProps}
                        listening={false}
                      />
                    )
                  )}
                  {innerShadow && (
                    hasSmoothing ? (
                      <Path
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                        fill={innerShadowColor}
                        opacity={0.12}
                        shadowColor={innerShadowColor}
                        shadowBlur={innerShadowBlur}
                        shadowOffset={innerShadowOffset}
                        globalCompositeOperation="source-atop"
                        listening={false}
                      />
                    ) : (
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        fill={innerShadowColor}
                        opacity={0.12}
                        shadowColor={innerShadowColor}
                        shadowBlur={innerShadowBlur}
                        shadowOffset={innerShadowOffset}
                        globalCompositeOperation="source-atop"
                        listening={false}
                      />
                    )
                  )}
                    {selectionProps && (
                        <Rect 
                            width={node.width}
                            height={node.height}
                            cornerRadius={cornerRadiusArray}
                            {...selectionProps}
                        />
                    )}
                    {hoverProps && (
                         <Rect 
                            width={node.width}
                            height={node.height}
                            cornerRadius={cornerRadiusArray}
                            {...hoverProps}
                        />
                    )}
                    {isHovered && (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') && node.layoutMode !== 'none' && (
                        <Group listening={false}>
                            {node.padding.top > 0 && <Rect x={0} y={0} width={node.width} height={node.padding.top} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.bottom > 0 && <Rect x={0} y={node.height - node.padding.bottom} width={node.width} height={node.padding.bottom} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.left > 0 && <Rect x={0} y={0} width={node.padding.left} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.right > 0 && <Rect x={node.width - node.padding.right} y={0} width={node.padding.right} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.gap > 0 && nodes.filter(c => c.parentId === node.id).slice(1).map((child, idx) => {
                                if (node.layoutMode === 'horizontal') {
                                    return <Rect key={idx} x={child.x - node.gap} y={0} width={node.gap} height={node.height} fill="rgba(255, 0, 255, 0.2)" />;
                                } else {
                                    return <Rect key={idx} x={0} y={child.y - node.gap} width={node.width} height={node.gap} fill="rgba(255, 0, 255, 0.2)" />;
                                }
                            })}
                        </Group>
                    )}
                    {renderNodeHierarchy(node.id)}
                </Group>
            </Group>
        );
    }

    if (node.type === 'rect') {
      const hasSmoothing = smoothCornerSmoothing > 0;
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            if (hasSmoothing) {
              return (
                <Path
                  key={`${node.id}-under-${paint.id}`}
                  x={node.x}
                  y={node.y}
                  rotation={node.rotation}
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  {...layerProps}
                  listening={false}
                  lineJoin="round"
                />
              );
            }
            return (
              <Rect
                key={`${node.id}-under-${paint.id}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                {...layerProps}
                lineJoin="round"
                listening={false}
              />
            );
          })}
                {hasSmoothing ? (
                    <Path 
                        {...konvaProps} 
              {...fillProps}
              data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)} 
                        lineJoin="round"
                    />
                ) : (
            <Rect {...konvaProps} {...fillProps} cornerRadius={cornerRadiusArray} lineJoin="round" />
                )}
          {node.strokeWidth > 0 && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            )
          )}
          {backgroundBlurOverlayProps && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                {...backgroundBlurOverlayProps}
                listening={false}
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                {...backgroundBlurOverlayProps}
                listening={false}
              />
            )
          )}
          {innerShadow && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                fill={innerShadowColor}
                opacity={0.12}
                shadowColor={innerShadowColor}
                shadowBlur={innerShadowBlur}
                shadowOffset={innerShadowOffset}
                globalCompositeOperation="source-atop"
                listening={false}
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                fill={innerShadowColor}
                opacity={0.12}
                shadowColor={innerShadowColor}
                shadowBlur={innerShadowBlur}
                shadowOffset={innerShadowOffset}
                globalCompositeOperation="source-atop"
                listening={false}
              />
            )
          )}
                {selectionProps && (
                    <Rect 
                        x={node.x} y={node.y} width={node.width} height={node.height}
                        rotation={node.rotation}
                        cornerRadius={cornerRadiusArray}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Rect 
                        x={node.x} y={node.y} width={node.width} height={node.height}
                        rotation={node.rotation}
                        cornerRadius={cornerRadiusArray}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }

    if (node.type === 'image') {
        return (
            <KonvaImage 
                key={node.id}
                node={node}
                konvaProps={konvaProps}
                selectionProps={selectionProps}
                hoverProps={hoverProps}
            />
        );
    }

    if (node.type === 'circle') {
        const radius = Math.abs(node.width / 2);
        const circleProps = {
            ...konvaProps,
            x: node.x + radius,
            y: node.y + radius,
        radius: radius,
        ...fillProps,
        };
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            return (
              <Circle
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radius}
                y={node.y + radius}
                radius={radius}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
                <Circle {...circleProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
          {backgroundBlurOverlayProps && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
                {selectionProps && (
                    <Circle 
                        x={node.x + radius} y={node.y + radius} radius={radius}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Circle 
                        x={node.x + radius} y={node.y + radius} radius={radius}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'ellipse') {
        const radiusX = Math.abs(node.width / 2);
        const radiusY = Math.abs(node.height / 2);
        const ellipseProps = {
            ...konvaProps,
            x: node.x + radiusX,
            y: node.y + radiusY,
            radiusX: radiusX,
        radiusY: radiusY,
        ...fillProps,
        };
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            return (
              <Ellipse
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radiusX}
                y={node.y + radiusY}
                radiusX={radiusX}
                radiusY={radiusY}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
                <Ellipse {...ellipseProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
          {backgroundBlurOverlayProps && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
                {selectionProps && (
                    <Ellipse 
                        x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Ellipse 
                        x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'path') {
        const pathComp = (
            <Group key={node.id}>
          {underFillPaints.map((paint) => (
            <Path
              key={`${node.id}-under-${paint.id}`}
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              {...getPaintFillProps(paint, effectiveFill)}
              lineJoin="round"
              listening={false}
            />
          ))}
          <Path {...konvaProps} {...fillProps} data={node.data} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              lineJoin="round"
              listening={false}
            />
          )}
          {backgroundBlurOverlayProps && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
                {hoverProps && <Path data={node.data} rotation={node.rotation} {...hoverProps} x={node.x} y={node.y} />}
            </Group>
        );
        if (tool === 'direct-select' && isSelected) {
          const parsed = parsePathData(node.data);
            const handles = [];
          for (let idx = 0; idx < parsed.anchors.length; idx++) {
            const anchor = parsed.anchors[idx];
                const anchorX = node.x + anchor.x;
                const anchorY = node.y + anchor.y;

                if (anchor.cpIn) {
                  handles.push(
                    <Line
                      key={`${node.id}-line-in-${idx}`}
                      points={[anchorX, anchorY, node.x + anchor.cpIn.x, node.y + anchor.cpIn.y]}
                      stroke="#6366F1"
                      strokeWidth={1 / viewport.zoom}
                      opacity={0.5}
                      listening={false}
                    />
                  );
                  handles.push(
                    <Circle
                      key={`${node.id}-cp-in-${idx}`}
                      x={node.x + anchor.cpIn.x}
                      y={node.y + anchor.cpIn.y}
                      radius={3.5 / viewport.zoom}
                      fill="#1D4ED8"
                      stroke="#DBEAFE"
                      strokeWidth={1 / viewport.zoom}
                      draggable
                      onMouseDown={(evt) => {
                        evt.cancelBubble = true;
                      }}
                      onDragMove={(evt) => handleControlPointDragMove(node.id, idx, 'in', evt)}
                      onDragEnd={() => pushHistory()}
                    />
                  );
                }

                if (anchor.cpOut) {
                  handles.push(
                    <Line
                      key={`${node.id}-line-out-${idx}`}
                      points={[anchorX, anchorY, node.x + anchor.cpOut.x, node.y + anchor.cpOut.y]}
                      stroke="#6366F1"
                      strokeWidth={1 / viewport.zoom}
                      opacity={0.5}
                      listening={false}
                    />
                  );
                  handles.push(
                    <Circle
                      key={`${node.id}-cp-out-${idx}`}
                      x={node.x + anchor.cpOut.x}
                      y={node.y + anchor.cpOut.y}
                      radius={3.5 / viewport.zoom}
                      fill="#1D4ED8"
                      stroke="#DBEAFE"
                      strokeWidth={1 / viewport.zoom}
                      draggable
                      onMouseDown={(evt) => {
                        evt.cancelBubble = true;
                      }}
                      onDragMove={(evt) => handleControlPointDragMove(node.id, idx, 'out', evt)}
                      onDragEnd={() => pushHistory()}
                    />
                  );
                }

                handles.push(
                    <Circle
                        key={`${node.id}-point-${idx}`}
                x={anchorX}
                y={anchorY}
                        radius={4 / viewport.zoom}
                        fill={selectedPathAnchor?.nodeId === node.id && selectedPathAnchor.index === idx ? '#6366F1' : '#FFFFFF'}
                        stroke="#6366F1"
                        strokeWidth={1 / viewport.zoom}
                        draggable
                        onMouseDown={(evt) => {
                          evt.cancelBubble = true;
                          setSelectedPathAnchor({ nodeId: node.id, index: idx });
                        }}
                        onDblClick={(evt) => {
                          evt.cancelBubble = true;
                          togglePathAnchorMode(node.id, idx);
                        }}
                        onDragMove={() => handlePointDragMove(node.id, idx)}
                        onDragEnd={() => pushHistory()}
                    />
                );
            }
            return (
              <Group
                key={node.id}
                onDblClick={(evt) => {
                  evt.cancelBubble = true;
                  insertPathAnchorAtPointer(node.id);
                }}
              >
                {pathComp}
                {handles}
              </Group>
            );
        }
        return pathComp;
    }
    if (node.type === 'text') {
      const lineHeight = node.lineHeight ? node.lineHeight / node.fontSize : 1.2;
      const isVerticalWriting = node.writingMode === 'vertical-rl' || node.writingMode === 'vertical-lr';
      const resolvedRotation = node.rotation || (isVerticalWriting ? 90 : 0);
      const topTextPaintProps = getPaintFillProps(topFillPaint, effectiveFill);
      const baseTextOpacity = Number.isFinite((topTextPaintProps as { opacity?: number }).opacity)
        ? Number((topTextPaintProps as { opacity?: number }).opacity)
        : effectiveOpacity;
      const textBaseProps = {
        text: effectiveText || node.text,
        fontSize: node.fontSize,
        fontFamily: node.fontFamily,
        align: node.align,
        verticalAlign: 'top' as const,
        width: node.width,
        height: node.height,
        visible: editingId !== node.id,
        lineHeight,
        wrap: 'word' as const,
        padding: 1,
        lineJoin: 'round' as const,
      };
      return (
        <Group key={node.id}>
            {underFillPaints.map((paint) => {
              const layerPaintProps = getPaintFillProps(paint, effectiveFill);
              const layerOpacity = Number.isFinite((layerPaintProps as { opacity?: number }).opacity)
                ? Number((layerPaintProps as { opacity?: number }).opacity)
                : effectiveOpacity;
              return (
                <Text
                  key={`${node.id}-under-${paint.id}`}
                  x={node.x}
                  y={node.y}
                  rotation={resolvedRotation}
                  {...textBaseProps}
                  {...layerPaintProps}
                  opacity={isVerticalWriting ? layerOpacity * 0.9 : layerOpacity}
                  listening={false}
                />
              );
            })}
            <Text
            {...konvaProps}
            {...textBaseProps}
            {...topTextPaintProps}
            opacity={isVerticalWriting ? baseTextOpacity * 0.9 : baseTextOpacity}
            rotation={resolvedRotation}
            />
            {selectionProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    {...selectionProps}
                />
            )}
            {hoverProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    {...hoverProps}
                />
            )}
        </Group>
      );
    }
    return null;
  };

  // Recursive renderer for nodes with Mask support
  const renderNodeHierarchy = (parentNodeId?: string) => {
    const parentNodes = nodes.filter(n => n.parentId === parentNodeId);
    if (parentNodes.length === 0) return null;

    return buildMaskingRuns(parentNodes).map((run) => {
      if (run.type === 'normal') {
        return renderSingleNode(run.node);
      }

      const mask = run.mask;
      const contents = [...run.maskedNodes];

      return (
        <Group key={`mask-group-${mask.id}`}>
          {renderSingleNode(mask)}
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();

              ctx.save();
              ctx.translate(mask.x + mask.width / 2, mask.y + mask.height / 2);
              ctx.rotate((mask.rotation || 0) * Math.PI / 180);
              ctx.translate(-mask.width / 2, -mask.height / 2);

              if (mask.type === 'rect' || mask.type === 'frame' || mask.type === 'section' || mask.type === 'image') {
                const r = getSanitizedCornerData(mask).corners;
                const w = mask.width;
                const h = mask.height;

                ctx.moveTo(r.topLeft, 0);
                ctx.lineTo(w - r.topRight, 0);
                ctx.quadraticCurveTo(w, 0, w, r.topRight);
                ctx.lineTo(w, h - r.bottomRight);
                ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                ctx.lineTo(r.bottomLeft, h);
                ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                ctx.lineTo(0, r.topLeft);
                ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
              } else if (mask.type === 'circle') {
                ctx.arc(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), 0, Math.PI * 2);
              } else if (mask.type === 'ellipse') {
                ctx.ellipse(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), Math.abs(mask.height / 2), 0, 0, Math.PI * 2);
              } else if (mask.type === 'text') {
                ctx.rect(0, 0, mask.width, mask.height);
              } else if (mask.type === 'path') {
                const parsed = parsePathData(mask.data || '');
                if (parsed.anchors.length > 0) {
                  ctx.moveTo(parsed.anchors[0].x, parsed.anchors[0].y);
                  for (let index = 1; index < parsed.anchors.length; index += 1) {
                    const prev = parsed.anchors[index - 1];
                    const current = parsed.anchors[index];
                    if (prev.cpOut || current.cpIn) {
                      const c1 = prev.cpOut || { x: prev.x, y: prev.y };
                      const c2 = current.cpIn || { x: current.x, y: current.y };
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, current.x, current.y);
                    } else {
                      ctx.lineTo(current.x, current.y);
                    }
                  }
                  if (parsed.closed) ctx.closePath();
                } else {
                  ctx.rect(0, 0, Math.max(1, mask.width), Math.max(1, mask.height));
                }
              }

              ctx.restore();
            }}
          >
            {contents.map((node) => renderSingleNode(node))}
          </Group>
        </Group>
      );
    });
  };

  const renderDirectSelectHoverOutlines = () => {
    if (tool !== 'direct-select' || directSelectHoverIds.length === 0) return null;

    const cycleIds = directSelectCycleRef.current?.candidateIds || [];
    const cycleMatchesHover = cycleIds.length === directSelectHoverIds.length && cycleIds.every((id, index) => id === directSelectHoverIds[index]);
    const activeCycleId = cycleMatchesHover && directSelectCycleRef.current
      ? directSelectHoverIds[directSelectCycleRef.current.index] || directSelectHoverIds[0]
      : directSelectHoverIds[0];

    return directSelectHoverIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is SceneNode => Boolean(node))
      .map((node) => {
        const global = getGlobalPosition(node.id);
        const cornerData = getSanitizedCornerData(node);
        const highlightColor = node.type === 'component' || node.type === 'instance' ? '#A855F7' : '#14B8A6';
        const isActiveCycle = node.id === activeCycleId;
        const strokeWidth = (isActiveCycle ? 2 : 1) / viewport.zoom;
        const opacity = isActiveCycle ? 1 : 0.65;
        const commonProps = {
          key: `direct-select-hover-${node.id}`,
          stroke: highlightColor,
          strokeWidth,
          opacity,
          listening: false,
          dash: isActiveCycle ? undefined : [4 / viewport.zoom, 3 / viewport.zoom],
        };

        if (node.type === 'circle') {
          return (
            <Circle
              {...commonProps}
              x={global.x + Math.abs(node.width / 2)}
              y={global.y + Math.abs(node.width / 2)}
              radius={Math.abs(node.width / 2)}
              fillEnabled={false}
            />
          );
        }

        if (node.type === 'ellipse') {
          return (
            <Ellipse
              {...commonProps}
              x={global.x + Math.abs(node.width / 2)}
              y={global.y + Math.abs(node.height / 2)}
              radiusX={Math.abs(node.width / 2)}
              radiusY={Math.abs(node.height / 2)}
              fillEnabled={false}
            />
          );
        }

        if (node.type === 'path') {
          return (
            <Path
              {...commonProps}
              x={global.x}
              y={global.y}
              rotation={node.rotation}
              data={node.data}
              fillEnabled={false}
            />
          );
        }

        if (cornerData.smoothing > 0) {
          return (
            <Path
              {...commonProps}
              x={global.x}
              y={global.y}
              rotation={node.rotation}
              data={getSuperellipsePath(node.width, node.height, cornerData.uniform, cornerData.smoothing)}
              fillEnabled={false}
            />
          );
        }

        return (
          <Rect
            {...commonProps}
            x={global.x}
            y={global.y}
            width={node.width}
            height={node.height}
            rotation={node.rotation}
            cornerRadius={cornerData.cornerRadiusArray}
            fillEnabled={false}
          />
        );
      });
  };

  return (
    <div
      id="canvas-container"
      className="flex-1 bg-[#1A1A1A] relative overflow-hidden h-full"
      style={{ cursor: canvasCursor }}
      onClick={() => setContextMenu(null)}
    >
       {/* Rulers */}
       <FigmaRulers />

       {/* Grid Overlay */}
       <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
            backgroundImage: `radial-gradient(#FFF 0.5px, transparent 0.5px)`,
            backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
       />

      <div 
        ref={containerRef}
        className="absolute top-5 left-5 right-0 bottom-0 overflow-hidden"
      >
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          ref={stageRef}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          x={viewport.x}
          y={viewport.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleCanvasContextMenu}
          onMouseLeave={() => setDirectSelectHoverIds([])}
          onDblClick={(e) => tool === 'pen' && finalizePenPath()}
          draggable={false}
        >
          <Layer>
            {renderNodeHierarchy()}
            {renderDirectSelectHoverOutlines()}

            {/* Creation Preview */}
            {newNode && (
              <Group 
                x={newNode.parentId ? getGlobalPosition(newNode.parentId).x : 0} 
                y={newNode.parentId ? getGlobalPosition(newNode.parentId).y : 0}
              >
                {(newNode.type === 'rect' || newNode.type === 'frame' || newNode.type === 'section') && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'circle' && (
                  <Circle
                    x={newNode.x + newNode.width / 2}
                    y={newNode.y + newNode.width / 2}
                    radius={Math.abs(newNode.width / 2)}
                    fill="#6366F1"
                    opacity={0.2}
                    stroke="#6366F1"
                    strokeWidth={1}
                    lineJoin="round"
                  />
                )}
                {newNode.type === 'image' && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'ellipse' && (
                  <Ellipse
                    x={newNode.x + newNode.width / 2}
                    y={newNode.y + newNode.height / 2}
                    radiusX={Math.abs(newNode.width / 2)}
                    radiusY={Math.abs(newNode.height / 2)}
                    fill="#6366F1"
                    opacity={0.2}
                    stroke="#6366F1"
                    strokeWidth={1}
                    lineJoin="round"
                  />
                )}
                {newNode.type === 'text' && (
                  <Group>
                      <Rect 
                          x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x} 
                          y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y} 
                          width={Math.abs(newNode.width)} 
                          height={Math.abs(newNode.height)} 
                          stroke="#6366F1" 
                          strokeWidth={1 / viewport.zoom} 
                          dash={[4, 2]} 
                      />
                      <Text 
                          x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x} 
                          y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y}
                          text={newNode.text}
                          fontSize={newNode.fontSize}
                          fontFamily={newNode.fontFamily}
                          fill="#6366F1"
                          opacity={0.5}
                          width={Math.abs(newNode.width)}
                          height={Math.abs(newNode.height)}
                          wrap="word"
                          lineJoin="round"
                      />
                  </Group>
                )}
              </Group>
            )}

            {/* Pen Tool Preview */}
            {penPoints.length > 0 && (
              <Line
                  points={penPoints.flatMap(p => [p.x, p.y])}
                  stroke="#6366F1"
                  strokeWidth={2 / viewport.zoom}
                  lineCap="round"
                  lineJoin="round"
              />
            )}
            {/* Live Pen Drawing */}
            {penPoints.length > 0 && (
                <Group>
                    <Path 
                        data={`M ${penPoints[0].x} ${penPoints[0].y} ` + penPoints.slice(1).map((p, i) => {
                            const prev = penPoints[i];
                            if (prev.cp2 && p.cp1) {
                                return `C ${prev.cp2.x} ${prev.cp2.y}, ${p.cp1.x} ${p.cp1.y}, ${p.x} ${p.y}`;
                            }
                            return `L ${p.x} ${p.y}`;
                        }).join(' ')}
                        stroke="#6366F1"
                        strokeWidth={2 / viewport.zoom}
                    />
                    {penPoints.map((p, i) => (
                        <Group key={i}>
                            <Circle x={p.x} y={p.y} radius={4 / viewport.zoom} fill="white" stroke="#6366F1" strokeWidth={1 / viewport.zoom} />
                            {p.cp1 && p.cp1.x !== p.x && (
                                <>
                                    <Line points={[p.x, p.y, p.cp1.x, p.cp1.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                                    <Circle x={p.cp1.x} y={p.cp1.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                                </>
                            )}
                            {p.cp2 && p.cp2.x !== p.x && (
                                <>
                                    <Line points={[p.x, p.y, p.cp2.x, p.cp2.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                                    <Circle x={p.cp2.x} y={p.cp2.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                                </>
                            )}
                        </Group>
                    ))}
                    {/* Dash to mouse cursor */}
                    {(() => {
                        const { x, y } = getPointerPosition();
                        return (
                          <Line
                              points={[penPoints[penPoints.length - 1].x, penPoints[penPoints.length - 1].y, x, y]}
                              stroke="#6366F1"
                              strokeWidth={1 / viewport.zoom}
                              dash={[5, 5]}
                          />
                        );
                    })()}
                </Group>
            )}

            {/* Marquee Preview */}
            {selectionRect && (
              <Rect 
                x={selectionRect.x} y={selectionRect.y} 
                width={selectionRect.width} height={selectionRect.height} 
                fill="rgba(99, 102, 241, 0.1)" stroke="#6366F1" strokeWidth={1 / viewport.zoom} 
                dash={[5, 5]}
              />
            )}

            {zoomRect && (
              <Rect
                x={zoomRect.x}
                y={zoomRect.y}
                width={zoomRect.width}
                height={zoomRect.height}
                fill="rgba(16, 185, 129, 0.12)"
                stroke="#10B981"
                strokeWidth={1 / viewport.zoom}
                dash={[6, 4]}
              />
            )}

            {/* Selection Transformer */}
            {(tool === 'select' || tool === 'scale') && (
              <Transformer
                ref={transformerRef}
                keepRatio={tool === 'scale'}
                centeredScaling={altHeld}
                rotateEnabled={tool !== 'scale'}
                enabledAnchors={tool === 'scale' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
                shiftBehavior="inverted"
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 1 || Math.abs(newBox.height) < 1) return oldBox;
                  return newBox;
                }}
                anchorStroke="#6366F1" anchorFill="#FFFFFF" anchorSize={6} borderStroke="#6366F1" borderDash={[1, 1]}
              />
            )}

            {/* Persistent Guides */}
            {persistentGuides.map((g) => (
              <Line
                  key={`persistent-guide-${g.id}`}
                  points={g.type === 'vertical'
                      ? [g.position, -10000, g.position, 10000]
                      : [-10000, g.position, 10000, g.position]}
                  stroke="#3B82F6"
                  strokeWidth={1 / viewport.zoom}
                  draggable
                  hitStrokeWidth={10 / viewport.zoom}
                  onDragMove={(e) => {
                    const guideNode = e.target;
                    const nextPos = g.type === 'vertical'
                      ? g.position + guideNode.x()
                      : g.position + guideNode.y();
                    updateGuide(g.id, nextPos);
                    guideNode.x(0);
                    guideNode.y(0);
                  }}
                  onDragEnd={() => pushHistory()}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    removeGuide(g.id);
                    pushHistory();
                  }}
              />
            ))}

            {/* Smart Guides */}
            {snapLines.map((g, i) => (
              <Line
                  key={`guide-${i}`}
                  points={g.x !== undefined 
                      ? [g.x, -10000, g.x, 10000] 
                      : [-10000, g.y!, 10000, g.y!]}
                  stroke="#FF4D4D"
                  strokeWidth={1 / viewport.zoom}
                  dash={[2, 2]}
              />
            ))}

            {/* Redlines (Measurement) */}
            {altHeld && selectedIds.length > 0 && hoveredId && selectedIds[0] !== hoveredId && (() => {
                const from = nodes.find(n => n.id === selectedIds[0]);
                const to = nodes.find(n => n.id === hoveredId);
                if (!from || !to) return null;

                const fromPos = getGlobalPosition(from.id);
                const toPos = getGlobalPosition(to.id);

                const fromRect = { x: fromPos.x, y: fromPos.y, width: from.width, height: from.height };
                const toRect = { x: toPos.x, y: toPos.y, width: to.width, height: to.height };

                // Simple vertical distance
                const dists = [];
                
                // Helper to draw line + text
                const drawLine = (p1: [number, number], p2: [number, number], label: string) => (
                    <Group key={`${p1}-${p2}`}>
                        <Line points={[...p1, ...p2]} stroke="#FF4D4D" strokeWidth={1/viewport.zoom} />
                        <Group x={(p1[0] + p2[0]) / 2} y={(p1[1] + p2[1]) / 2}>
                          <Rect 
                              x={-10/viewport.zoom} y={-7/viewport.zoom} 
                              width={20/viewport.zoom} height={14/viewport.zoom} 
                              fill="#FF4D4D" cornerRadius={2/viewport.zoom} 
                          />
                          <Text 
                              x={-10/viewport.zoom} y={-5/viewport.zoom}
                              width={20/viewport.zoom}
                              text={label} fontSize={10/viewport.zoom} fill="white" align="center" 
                          />
                        </Group>
                    </Group>
                );

                // 1. TOP to TOP
                if (toRect.y + toRect.height < fromRect.y) {
                    const dist = Math.round(fromRect.y - (toRect.y + toRect.height));
                    dists.push(drawLine([fromRect.x + fromRect.width/2, toRect.y + toRect.height], [fromRect.x + fromRect.width/2, fromRect.y], dist.toString()));
                } else if (toRect.y > fromRect.y + fromRect.height) {
                    const dist = Math.round(toRect.y - (fromRect.y + fromRect.height));
                     dists.push(drawLine([fromRect.x + fromRect.width/2, fromRect.y + fromRect.height], [fromRect.x + fromRect.width/2, toRect.y], dist.toString()));
                }

                // 2. LEFT to LEFT
                if (toRect.x + toRect.width < fromRect.x) {
                  const dist = Math.round(fromRect.x - (toRect.x + toRect.width));
                  dists.push(drawLine([toRect.x + toRect.width, fromRect.y + fromRect.height/2], [fromRect.x, fromRect.y + fromRect.height/2], dist.toString()));
                } else if (toRect.x > fromRect.x + fromRect.width) {
                    const dist = Math.round(toRect.x - (fromRect.x + fromRect.width));
                    dists.push(drawLine([fromRect.x + fromRect.width, fromRect.y + fromRect.height/2], [toRect.x, fromRect.y + fromRect.height/2], dist.toString()));
                }

                return dists;
            })()}
          </Layer>
        </Stage>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[120] w-48 rounded-xl border border-[#2A2A2A] bg-[#0B0B0B] p-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => runContextAction('copy')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Copy Selection
          </button>
          <button
            onClick={() => runContextAction('paste')}
            disabled={!canPaste()}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Paste Here
          </button>
          <button
            onClick={() => runContextAction('duplicate')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Duplicate
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('group')}
            disabled={selectedIds.length < 2}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Group Selection
          </button>
          <button
            onClick={() => runContextAction('frame')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Frame Selection
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('delete')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-red-300 transition-colors hover:bg-red-600/20 hover:text-red-200 disabled:opacity-35"
          >
            Delete
          </button>
        </div>
      )}

      {/* Text Editing Overlay */}
      {editingId && nodes.find(n => n.id === editingId && n.type === 'text') && (() => {
        const node = nodes.find((n): n is TextNode => n.id === editingId && n.type === 'text');
        if (!node) return null;
        const globalPos = getGlobalPosition(node.id);
        const visibleTextFill = (node.fills || []).filter((p) => p.visible !== false && p.type === 'solid').slice(-1)[0];
        const textColor = visibleTextFill?.color || node.fill;
        return (
          <textarea
            autoFocus
            value={editingText}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            style={{
              position: 'absolute',
              top: (globalPos.y * viewport.zoom) + viewport.y,
              left: (globalPos.x * viewport.zoom) + viewport.x,
              width: (node.width || 200) * viewport.zoom,
              height: (editingHeight || node.height || 40) * viewport.zoom,
              fontSize: node.fontSize * viewport.zoom,
              fontFamily: node.fontFamily,
              color: textColor,
              textAlign: node.align || 'left',
              WebkitTextStroke: node.strokeWidth ? `${node.strokeWidth * viewport.zoom}px ${node.stroke}` : 'none',
              background: 'transparent',
              border: `1px solid #6366F1`,
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              padding: 0,
              margin: 0,
              lineHeight: node.lineHeight ? (node.lineHeight / node.fontSize) : 1.2,
              transform: `rotate(${node.rotation}deg)`,
              transformOrigin: 'top left',
              zIndex: 100,
            }}
          />
        );
      })()}
    </div>
  );
};
