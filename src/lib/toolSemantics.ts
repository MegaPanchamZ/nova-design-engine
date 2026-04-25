import type { SceneNode, Viewport } from '../types';

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

export interface CanvasSize {
  width: number;
  height: number;
}

export interface DirectSelectCycleState {
  point: CanvasPoint;
  candidateIds: string[];
  index: number;
}

const isVisibleNode = (node: SceneNode): boolean => node.visible !== false && !node.locked;

export const getGlobalNodePosition = (nodes: SceneNode[], nodeId: string | undefined): CanvasPoint => {
  if (!nodeId) return { x: 0, y: 0 };

  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  if (!node.parentId) return { x: node.x, y: node.y };

  const parent = getGlobalNodePosition(nodes, node.parentId);
  return { x: parent.x + node.x, y: parent.y + node.y };
};

const isDescendantOf = (nodes: SceneNode[], nodeId: string, ancestorId: string): boolean => {
  let cursor = nodes.find((entry) => entry.id === nodeId)?.parentId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = nodes.find((entry) => entry.id === cursor)?.parentId;
  }
  return false;
};

const getNodeDepth = (nodes: SceneNode[], nodeId: string): number => {
  let depth = 0;
  let cursor = nodes.find((entry) => entry.id === nodeId)?.parentId;
  while (cursor) {
    depth += 1;
    cursor = nodes.find((entry) => entry.id === cursor)?.parentId;
  }
  return depth;
};

const pointInNodeBounds = (nodes: SceneNode[], node: SceneNode, point: CanvasPoint): boolean => {
  const global = getGlobalNodePosition(nodes, node.id);
  return (
    point.x >= global.x &&
    point.x <= global.x + node.width &&
    point.y >= global.y &&
    point.y <= global.y + node.height
  );
};

export const getSelectableHitStack = (
  nodes: SceneNode[],
  point: CanvasPoint,
  ancestorId?: string
): SceneNode[] => {
  const candidates = nodes.filter((node) => {
    if (!isVisibleNode(node)) return false;
    if (ancestorId && node.id !== ancestorId && !isDescendantOf(nodes, node.id, ancestorId)) return false;
    return pointInNodeBounds(nodes, node, point);
  });

  candidates.sort((left, right) => {
    const depthDelta = getNodeDepth(nodes, right.id) - getNodeDepth(nodes, left.id);
    if (depthDelta !== 0) return depthDelta;

    const leftIndex = nodes.findIndex((entry) => entry.id === left.id);
    const rightIndex = nodes.findIndex((entry) => entry.id === right.id);
    return rightIndex - leftIndex;
  });

  return candidates;
};

export const resolveDirectSelectCycle = (
  nodes: SceneNode[],
  point: CanvasPoint,
  previous: DirectSelectCycleState | null,
  options?: {
    ancestorId?: string;
    tolerance?: number;
  }
): { node: SceneNode | null; cycle: DirectSelectCycleState | null } => {
  const tolerance = options?.tolerance ?? 4;
  const hits = getSelectableHitStack(nodes, point, options?.ancestorId);
  if (hits.length === 0) return { node: null, cycle: null };

  const candidateIds = hits.map((node) => node.id);
  const sameCandidates = previous && previous.candidateIds.length === candidateIds.length && previous.candidateIds.every((id, index) => id === candidateIds[index]);
  const dx = previous ? point.x - previous.point.x : Number.POSITIVE_INFINITY;
  const dy = previous ? point.y - previous.point.y : Number.POSITIVE_INFINITY;
  const samePoint = previous ? Math.hypot(dx, dy) <= tolerance : false;

  const index = sameCandidates && samePoint && previous
    ? (previous.index + 1) % hits.length
    : 0;

  return {
    node: hits[index] || null,
    cycle: {
      point,
      candidateIds,
      index,
    },
  };
};

export const findDeepSelectableNode = (
  nodes: SceneNode[],
  ancestorId: string,
  point: CanvasPoint
): SceneNode | null => {
  const hits = getSelectableHitStack(nodes, point, ancestorId).filter((node) => node.id !== ancestorId);
  if (hits.length === 0) return null;

  return hits[0] || null;
};

export const normalizeCanvasRect = (rect: CanvasRect): CanvasRect => {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
};

export const computeViewportForZoomBox = (
  rect: CanvasRect,
  size: CanvasSize,
  currentViewport: Viewport,
  padding = 32
): Viewport => {
  const normalized = normalizeCanvasRect(rect);
  if (normalized.width <= 0 || normalized.height <= 0) return currentViewport;

  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const nextZoom = Math.min(Math.max(Math.min(availableWidth / normalized.width, availableHeight / normalized.height), 0.05), 20);

  return {
    zoom: nextZoom,
    x: padding + (availableWidth - normalized.width * nextZoom) / 2 - normalized.x * nextZoom,
    y: padding + (availableHeight - normalized.height * nextZoom) / 2 - normalized.y * nextZoom,
  };
};