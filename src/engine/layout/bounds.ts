import { SceneNode } from '../../types';

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getNodeBounds = (node: SceneNode): LayoutBounds => {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
};
