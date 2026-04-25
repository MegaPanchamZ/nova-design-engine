import { SceneNode } from '../types';

export type LayerDropPosition = 'before' | 'inside' | 'after';
export type FlowReorderDirection = 'first' | 'backward' | 'forward' | 'last';

export const isHierarchyContainerNode = (node: SceneNode): boolean => {
  return node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance';
};

export const getLayerDropPosition = (
  targetNode: SceneNode,
  overTop: number,
  overHeight: number,
  activeCenterY: number
): LayerDropPosition => {
  const safeHeight = Math.max(1, overHeight);
  const edgeThreshold = Math.min(18, safeHeight * 0.28);
  const middleTop = overTop + edgeThreshold;
  const middleBottom = overTop + safeHeight - edgeThreshold;

  if (isHierarchyContainerNode(targetNode) && activeCenterY >= middleTop && activeCenterY <= middleBottom) {
    return 'inside';
  }

  const midpoint = overTop + safeHeight / 2;
  return activeCenterY < midpoint ? 'before' : 'after';
};

export const getAutoLayoutReorderInstruction = (
  siblings: SceneNode[],
  nodeId: string,
  direction: FlowReorderDirection
): { targetId: string; position: Exclude<LayerDropPosition, 'inside'> } | null => {
  const currentIndex = siblings.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0 || siblings.length < 2) return null;

  if (direction === 'first') {
    if (currentIndex === 0) return null;
    return { targetId: siblings[0].id, position: 'before' };
  }

  if (direction === 'last') {
    if (currentIndex === siblings.length - 1) return null;
    return { targetId: siblings[siblings.length - 1].id, position: 'after' };
  }

  if (direction === 'backward') {
    if (currentIndex === 0) return null;
    return { targetId: siblings[currentIndex - 1].id, position: 'before' };
  }

  if (currentIndex === siblings.length - 1) return null;
  return { targetId: siblings[currentIndex + 1].id, position: 'after' };
};