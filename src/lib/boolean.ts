import paper from 'paper/dist/paper-core';

import { SceneNode } from '../types';

type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';
interface BooleanPathItem {
  pathData: string;
  remove(): void;
  unite(other: BooleanPathItem, options?: { insert?: boolean }): BooleanPathItem;
  subtract(other: BooleanPathItem, options?: { insert?: boolean }): BooleanPathItem;
  intersect(other: BooleanPathItem, options?: { insert?: boolean }): BooleanPathItem;
  exclude(other: BooleanPathItem, options?: { insert?: boolean }): BooleanPathItem;
}

let paperScopeReady = false;

const getPaperScope = () => {
  if (!paperScopeReady) {
    paper.setup(new paper.Size(2048, 2048));
    paperScopeReady = true;
  }

  return paper;
};

const toRectPath = (node: SceneNode): string => {
  const x = node.x;
  const y = node.y;
  const w = node.width;
  const h = node.height;
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
};

const toEllipsePath = (node: SceneNode): string => {
  const rx = node.width / 2;
  const ry = node.height / 2;
  const cx = node.x + rx;
  const cy = node.y + ry;
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
};

const toCirclePath = (node: SceneNode): string => {
  const r = node.width / 2;
  const cx = node.x + r;
  const cy = node.y + r;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
};

const nodeToPath = (node: SceneNode): string => {
  if (node.type === 'path' && node.data) return node.data;
  if (node.type === 'rect') return toRectPath(node);
  if (node.type === 'ellipse') return toEllipsePath(node);
  if (node.type === 'circle') return toCirclePath(node);
  return '';
};

const createBooleanPathItem = (scope: typeof paper, pathData: string): BooleanPathItem | null => {
  if (!pathData.trim()) return null;

  try {
    return new scope.CompoundPath({ insert: false, pathData });
  } catch {
    try {
      const fallbackPath = new scope.Path({ insert: false });
      fallbackPath.pathData = pathData;
      return fallbackPath;
    } catch {
      return null;
    }
  }
};

const applyBooleanOperation = (
  left: BooleanPathItem,
  right: BooleanPathItem,
  operation: BooleanOperation
): BooleanPathItem => {
  switch (operation) {
    case 'union':
      return left.unite(right, { insert: false });
    case 'subtract':
      return left.subtract(right, { insert: false });
    case 'intersect':
      return left.intersect(right, { insert: false });
    case 'exclude':
      return left.exclude(right, { insert: false });
  }
};

export const performBooleanOperation = (
  nodes: SceneNode[],
  operation: BooleanOperation
): string => {
  const scope = getPaperScope();
  const pathItems = nodes
    .map(nodeToPath)
    .filter(Boolean)
    .map((pathData) => createBooleanPathItem(scope, pathData))
    .filter((item): item is BooleanPathItem => Boolean(item));

  if (pathItems.length < 2) return '';

  let result = pathItems[0];

  for (let index = 1; index < pathItems.length; index += 1) {
    const nextPath = pathItems[index];
    const nextResult = applyBooleanOperation(result, nextPath, operation);
    result.remove();
    nextPath.remove();
    result = nextResult;
  }

  const pathData = result.pathData || '';
  result.remove();
  return pathData;
};
