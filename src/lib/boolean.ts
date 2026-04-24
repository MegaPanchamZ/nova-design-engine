import { SceneNode } from '../types';

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

export const performBooleanOperation = (
  nodes: SceneNode[],
  operation: 'union' | 'subtract' | 'intersect' | 'exclude'
): string => {
  const paths = nodes.map(nodeToPath).filter(Boolean);

  if (paths.length < 2) return '';

  if (operation === 'union' || operation === 'exclude') {
    return paths.join(' ');
  }

  // Fallback behavior for lightweight browser-safe implementation.
  return paths[0] || '';
};
