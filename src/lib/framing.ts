import { createDefaultNode, FrameNode, SceneNode } from '../types';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isFrameLike = (node: SceneNode): node is FrameNode => {
  return node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance';
};

const getNodeById = (nodes: SceneNode[], id: string | undefined): SceneNode | undefined => {
  if (!id) return undefined;
  return nodes.find((node) => node.id === id);
};

export const getGlobalPosition = (nodes: SceneNode[], nodeId: string | undefined): Point => {
  const node = getNodeById(nodes, nodeId);
  if (!node) return { x: 0, y: 0 };

  const parent = getGlobalPosition(nodes, node.parentId);
  return { x: parent.x + node.x, y: parent.y + node.y };
};

export const findInnermostFrameAtPoint = (
  nodes: SceneNode[],
  point: Point,
  excludedIds: string[] = []
): string | undefined => {
  const excluded = new Set(excludedIds);
  const frames = nodes.filter((node) => {
    if (!isFrameLike(node) || excluded.has(node.id)) return false;
    const global = getGlobalPosition(nodes, node.id);
    return (
      point.x >= global.x &&
      point.x <= global.x + node.width &&
      point.y >= global.y &&
      point.y <= global.y + node.height
    );
  });

  if (frames.length === 0) return undefined;
  frames.sort((a, b) => a.width * a.height - b.width * b.height);
  return frames[0].id;
};

export const getSelectionBounds = (nodes: SceneNode[], selectedIds: string[]): Bounds | null => {
  if (selectedIds.length === 0) return null;

  const selected = selectedIds
    .map((id) => {
      const node = getNodeById(nodes, id);
      if (!node) return null;
      const global = getGlobalPosition(nodes, node.id);
      return {
        left: global.x,
        top: global.y,
        right: global.x + node.width,
        bottom: global.y + node.height,
      };
    })
    .filter((item): item is { left: number; top: number; right: number; bottom: number } => item !== null);

  if (selected.length === 0) return null;

  const left = Math.min(...selected.map((item) => item.left));
  const top = Math.min(...selected.map((item) => item.top));
  const right = Math.max(...selected.map((item) => item.right));
  const bottom = Math.max(...selected.map((item) => item.bottom));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

export const wrapSelectionInFrame = (
  nodes: SceneNode[],
  selectedIds: string[],
  frameName = 'Frame'
): { frame: FrameNode; nodes: SceneNode[] } | null => {
  const bounds = getSelectionBounds(nodes, selectedIds);
  if (!bounds) return null;

  const frame = createDefaultNode('frame', bounds.x, bounds.y) as FrameNode;
  frame.width = bounds.width;
  frame.height = bounds.height;
  frame.name = frameName;
  frame.fill = 'transparent';
  frame.fills = [];
  frame.stroke = '#6366F1';
  frame.strokeWidth = 1;
  frame.clipsContent = false;

  const selected = new Set(selectedIds);
  const remapped = nodes.map((node) => {
    if (!selected.has(node.id)) return node;

    const global = getGlobalPosition(nodes, node.id);
    return {
      ...node,
      parentId: frame.id,
      x: global.x - frame.x,
      y: global.y - frame.y,
    };
  });

  return {
    frame,
    nodes: [...remapped, frame],
  };
};