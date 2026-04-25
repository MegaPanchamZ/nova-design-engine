import { computeSnap, SnapGuide } from '../engine/snapping/snapEngine';
import { SpatialIndex } from '../engine/spatial/spatialIndex';
import { SpatialBounds } from '../engine/spatial/types';
import { Guide, SceneNode, SnapLine } from '../types';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialRuntimeState {
  positionsById: Map<string, CanvasPoint>;
  boundsById: Map<string, SpatialBounds>;
  bounds: SpatialBounds[];
  index: SpatialIndex;
}

const buildGlobalPositionMap = (nodes: SceneNode[]): Map<string, CanvasPoint> => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, CanvasPoint>();

  const resolve = (nodeId: string, active: Set<string>): CanvasPoint => {
    const cached = cache.get(nodeId);
    if (cached) return cached;

    const node = nodeById.get(nodeId);
    if (!node) return { x: 0, y: 0 };

    if (active.has(nodeId)) {
      const fallback = { x: node.x, y: node.y };
      cache.set(nodeId, fallback);
      return fallback;
    }

    if (!node.parentId) {
      const root = { x: node.x, y: node.y };
      cache.set(nodeId, root);
      return root;
    }

    const nextActive = new Set(active);
    nextActive.add(nodeId);
    const parent = resolve(node.parentId, nextActive);
    const position = { x: parent.x + node.x, y: parent.y + node.y };
    cache.set(nodeId, position);
    return position;
  };

  nodes.forEach((node) => {
    resolve(node.id, new Set());
  });

  return cache;
};

const toSnapLines = (guides: SnapGuide[], threshold: number): SnapLine[] => {
  const dedupeThreshold = Math.max(0.25, threshold * 0.35);
  const lines: SnapLine[] = [];

  guides.forEach((guide) => {
    const line = guide.axis === 'x' ? ({ x: guide.value } as SnapLine) : ({ y: guide.value } as SnapLine);
    if (!Number.isFinite(guide.value)) return;

    const alreadyExists = lines.some((existing) => {
      if (guide.axis === 'x' && typeof existing.x === 'number') {
        return Math.abs(existing.x - guide.value) <= dedupeThreshold;
      }
      if (guide.axis === 'y' && typeof existing.y === 'number') {
        return Math.abs(existing.y - guide.value) <= dedupeThreshold;
      }
      return false;
    });

    if (!alreadyExists) lines.push(line);
  });

  return lines;
};

const applyPersistentGuideSnap = (
  x: number,
  y: number,
  width: number,
  height: number,
  guides: Guide[],
  snapThreshold: number
): { x: number; y: number; guides: SnapGuide[] } => {
  let snappedX = x;
  let snappedY = y;
  const emitted: SnapGuide[] = [];

  guides.forEach((guide) => {
    if (guide.type === 'vertical') {
      if (Math.abs(snappedX - guide.position) < snapThreshold) {
        snappedX = guide.position;
        emitted.push({ axis: 'x', value: guide.position, type: 'edge', sourceId: guide.id });
      }
      if (Math.abs(snappedX + width / 2 - guide.position) < snapThreshold) {
        snappedX = guide.position - width / 2;
        emitted.push({ axis: 'x', value: guide.position, type: 'center', sourceId: guide.id });
      }
      if (Math.abs(snappedX + width - guide.position) < snapThreshold) {
        snappedX = guide.position - width;
        emitted.push({ axis: 'x', value: guide.position, type: 'edge', sourceId: guide.id });
      }
      return;
    }

    if (Math.abs(snappedY - guide.position) < snapThreshold) {
      snappedY = guide.position;
      emitted.push({ axis: 'y', value: guide.position, type: 'edge', sourceId: guide.id });
    }
    if (Math.abs(snappedY + height / 2 - guide.position) < snapThreshold) {
      snappedY = guide.position - height / 2;
      emitted.push({ axis: 'y', value: guide.position, type: 'center', sourceId: guide.id });
    }
    if (Math.abs(snappedY + height - guide.position) < snapThreshold) {
      snappedY = guide.position - height;
      emitted.push({ axis: 'y', value: guide.position, type: 'edge', sourceId: guide.id });
    }
  });

  return { x: snappedX, y: snappedY, guides: emitted };
};

export const createSpatialRuntimeState = (nodes: SceneNode[]): SpatialRuntimeState => {
  const positionsById = buildGlobalPositionMap(nodes);
  const bounds = nodes.map((node) => {
    const global = positionsById.get(node.id) || { x: node.x, y: node.y };
    return {
      id: node.id,
      minX: global.x,
      minY: global.y,
      maxX: global.x + node.width,
      maxY: global.y + node.height,
      metadata: { type: node.type },
    } as SpatialBounds;
  });

  const index = new SpatialIndex();
  index.load(bounds);

  return {
    positionsById,
    boundsById: new Map(bounds.map((bound) => [bound.id, bound])),
    bounds,
    index,
  };
};

export const findBoundsIdsInRect = (state: SpatialRuntimeState, rect: CanvasRect): string[] => {
  const query = {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };

  return state.index.search(query).map((entry) => entry.id);
};

export const findSmallestContainingNodeId = (
  state: SpatialRuntimeState,
  point: CanvasPoint,
  predicate?: (nodeId: string) => boolean,
  excludeId?: string
): string | undefined => {
  const hits = state.index.hitTest(point)
    .filter((entry) => entry.id !== excludeId)
    .filter((entry) => (predicate ? predicate(entry.id) : true))
    .sort((left, right) => {
      const leftArea = Math.max(0, left.maxX - left.minX) * Math.max(0, left.maxY - left.minY);
      const rightArea = Math.max(0, right.maxX - right.minX) * Math.max(0, right.maxY - right.minY);
      return leftArea - rightArea;
    });

  return hits[0]?.id;
};

export interface SpatialSnapInput {
  state: SpatialRuntimeState;
  nodeId: string;
  globalX: number;
  globalY: number;
  width: number;
  height: number;
  snapThreshold: number;
  persistentGuides: Guide[];
  excludedIds?: string[];
}

export interface SpatialSnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
}

export const snapNodeToSpatial = ({
  state,
  nodeId,
  globalX,
  globalY,
  width,
  height,
  snapThreshold,
  persistentGuides,
  excludedIds = [],
}: SpatialSnapInput): SpatialSnapResult => {
  const excluded = new Set(excludedIds);
  excluded.add(nodeId);

  const queryPadding = snapThreshold + Math.max(width, height) * 0.5;
  const query = {
    minX: globalX - queryPadding,
    minY: globalY - queryPadding,
    maxX: globalX + width + queryPadding,
    maxY: globalY + height + queryPadding,
  };

  const candidates = state.index
    .search(query)
    .filter((entry) => !excluded.has(entry.id));

  const fallbackCandidates = state.bounds.filter((entry) => !excluded.has(entry.id));
  const snapCandidates = candidates.length > 0 ? candidates : fallbackCandidates;

  const moving = {
    id: nodeId,
    minX: globalX,
    minY: globalY,
    maxX: globalX + width,
    maxY: globalY + height,
  };

  const base = computeSnap({
    movingId: nodeId,
    bounds: moving,
    candidates: snapCandidates,
    threshold: snapThreshold,
  });

  const guideSnap = applyPersistentGuideSnap(base.x, base.y, width, height, persistentGuides, snapThreshold);
  const lines = toSnapLines([...base.guides, ...guideSnap.guides], snapThreshold);

  return {
    x: guideSnap.x,
    y: guideSnap.y,
    snapLines: lines,
  };
};
