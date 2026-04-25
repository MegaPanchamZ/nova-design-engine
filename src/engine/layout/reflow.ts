import { FrameNode, SceneNode } from '../../types';
import { calculateLayout } from './autoLayout';

export interface LayoutReflowHelpers {
  getNodeById: (nodes: SceneNode[], id: string | undefined) => SceneNode | undefined;
  isFrameLike: (node: SceneNode | undefined) => node is FrameNode;
  sanitizeCoordinate: (value: number, fallback?: number) => number;
  sanitizeSize: (value: number, fallback?: number) => number;
}

export interface LayoutReflowEngines {
  calculateLayout: (frame: FrameNode, children: SceneNode[]) => { frame: FrameNode; children: SceneNode[] };
  applyFrameSizingWithoutAutoLayout: (
    frame: FrameNode,
    children: SceneNode[],
    allNodes: SceneNode[],
    helpers: LayoutReflowHelpers
  ) => { frame: FrameNode; children: SceneNode[] };
}

export const applyFrameSizingWithoutAutoLayout = (
  frame: FrameNode,
  children: SceneNode[],
  allNodes: SceneNode[],
  helpers: LayoutReflowHelpers
): { frame: FrameNode; children: SceneNode[] } => {
  const updatedFrame: FrameNode = {
    ...frame,
    x: helpers.sanitizeCoordinate(frame.x, 0),
    y: helpers.sanitizeCoordinate(frame.y, 0),
    width: helpers.sanitizeSize(frame.width, 100),
    height: helpers.sanitizeSize(frame.height, 100),
  };
  const updatedChildren: SceneNode[] = children.map((child) => ({
    ...child,
    x: helpers.sanitizeCoordinate(child.x, 0),
    y: helpers.sanitizeCoordinate(child.y, 0),
    width: helpers.sanitizeSize(child.width, 1),
    height: helpers.sanitizeSize(child.height, 1),
  }));

  const parentCandidate = helpers.getNodeById(allNodes, frame.parentId);
  if (parentCandidate && helpers.isFrameLike(parentCandidate) && !updatedFrame.isAbsolute) {
    const parentInnerWidth = helpers.sanitizeSize(
      parentCandidate.width - parentCandidate.padding.left - parentCandidate.padding.right,
      updatedFrame.width
    );
    const parentInnerHeight = helpers.sanitizeSize(
      parentCandidate.height - parentCandidate.padding.top - parentCandidate.padding.bottom,
      updatedFrame.height
    );

    if (updatedFrame.horizontalResizing === 'fill') {
      updatedFrame.width = parentInnerWidth;
      updatedFrame.x = parentCandidate.padding.left;
    }
    if (updatedFrame.verticalResizing === 'fill') {
      updatedFrame.height = parentInnerHeight;
      updatedFrame.y = parentCandidate.padding.top;
    }
  }

  const getInnerWidth = () =>
    helpers.sanitizeSize(updatedFrame.width - updatedFrame.padding.left - updatedFrame.padding.right, updatedFrame.width);
  const getInnerHeight = () =>
    helpers.sanitizeSize(updatedFrame.height - updatedFrame.padding.top - updatedFrame.padding.bottom, updatedFrame.height);

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
    const minX = Math.min(...updatedChildren.map((child) => helpers.sanitizeCoordinate(child.x, 0)));
    const shiftX = minX - targetMinX;

    if (Number.isFinite(shiftX) && Math.abs(shiftX) > 0.001) {
      updatedFrame.x = helpers.sanitizeCoordinate(updatedFrame.x + shiftX, updatedFrame.x);
      updatedChildren.forEach((child) => {
        child.x = helpers.sanitizeCoordinate(child.x - shiftX, child.x);
      });
    }

    const maxX = Math.max(
      targetMinX,
      ...updatedChildren.map((child) => helpers.sanitizeCoordinate(child.x, 0) + helpers.sanitizeSize(child.width, 1))
    );
    updatedFrame.width = helpers.sanitizeSize(maxX + updatedFrame.padding.right, updatedFrame.width);
  }

  if (updatedChildren.length > 0 && updatedFrame.verticalResizing === 'hug') {
    const targetMinY = updatedFrame.padding.top;
    const minY = Math.min(...updatedChildren.map((child) => helpers.sanitizeCoordinate(child.y, 0)));
    const shiftY = minY - targetMinY;

    if (Number.isFinite(shiftY) && Math.abs(shiftY) > 0.001) {
      updatedFrame.y = helpers.sanitizeCoordinate(updatedFrame.y + shiftY, updatedFrame.y);
      updatedChildren.forEach((child) => {
        child.y = helpers.sanitizeCoordinate(child.y - shiftY, child.y);
      });
    }

    const maxY = Math.max(
      targetMinY,
      ...updatedChildren.map((child) => helpers.sanitizeCoordinate(child.y, 0) + helpers.sanitizeSize(child.height, 1))
    );
    updatedFrame.height = helpers.sanitizeSize(maxY + updatedFrame.padding.bottom, updatedFrame.height);
  }

  return {
    frame: updatedFrame,
    children: updatedChildren,
  };
};

const defaultEngines: LayoutReflowEngines = {
  calculateLayout,
  applyFrameSizingWithoutAutoLayout,
};

export const reflowFrameBranch = (
  nodes: SceneNode[],
  frameId: string,
  helpers: LayoutReflowHelpers,
  engines: LayoutReflowEngines = defaultEngines
): SceneNode[] => {
  const frameCandidate = helpers.getNodeById(nodes, frameId);
  if (!frameCandidate || !helpers.isFrameLike(frameCandidate)) return nodes;

  const children = nodes.filter((node) => node.parentId === frameId);
  const { frame: updatedFrame, children: updatedChildren } = frameCandidate.layoutMode !== 'none'
    ? engines.calculateLayout(frameCandidate, children)
    : engines.applyFrameSizingWithoutAutoLayout(frameCandidate, children, nodes, helpers);

  const updatedChildrenMap = new Map(updatedChildren.map((child) => [child.id, child]));
  const nextNodes = nodes.map((node) => {
    if (node.id === updatedFrame.id) return updatedFrame;
    return updatedChildrenMap.get(node.id) || node;
  });

  return updatedFrame.parentId ? reflowFrameBranch(nextNodes, updatedFrame.parentId, helpers, engines) : nextNodes;
};

export const reflowNodeBranch = (
  nodes: SceneNode[],
  targetId: string,
  helpers: LayoutReflowHelpers,
  engines: LayoutReflowEngines = defaultEngines
): SceneNode[] => {
  const node = helpers.getNodeById(nodes, targetId);
  if (!node) return nodes;

  const frameId = helpers.isFrameLike(node) ? node.id : node.parentId;
  if (!frameId) return nodes;

  return reflowFrameBranch(nodes, frameId, helpers, engines);
};

export const reflowNodeBranches = (
  nodes: SceneNode[],
  targetIds: Array<string | undefined>,
  helpers: LayoutReflowHelpers,
  engines: LayoutReflowEngines = defaultEngines
): SceneNode[] => {
  return Array.from(new Set(targetIds.filter((id): id is string => Boolean(id)))).reduce(
    (currentNodes, targetId) => reflowNodeBranch(currentNodes, targetId, helpers, engines),
    nodes
  );
};
