import { LayoutBounds } from './bounds';

export interface ConstraintSet {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  centerX?: boolean;
  centerY?: boolean;
}

export const applyConstraints = (
  child: LayoutBounds,
  parent: LayoutBounds,
  constraints: ConstraintSet
): LayoutBounds => {
  const next = { ...child };

  if (typeof constraints.left === 'number') {
    next.x = parent.x + constraints.left;
  }
  if (typeof constraints.right === 'number') {
    next.x = parent.x + parent.width - child.width - constraints.right;
  }
  if (constraints.centerX) {
    next.x = parent.x + (parent.width - child.width) / 2;
  }

  if (typeof constraints.top === 'number') {
    next.y = parent.y + constraints.top;
  }
  if (typeof constraints.bottom === 'number') {
    next.y = parent.y + parent.height - child.height - constraints.bottom;
  }
  if (constraints.centerY) {
    next.y = parent.y + (parent.height - child.height) / 2;
  }

  return next;
};
