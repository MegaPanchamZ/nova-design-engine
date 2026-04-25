import { describe, expect, it } from 'vitest';

import { performBooleanOperation } from './boolean';
import { createDefaultNode, RectNode } from '../types';

const createRect = (x: number, y: number, width: number, height: number): RectNode => {
  const node = createDefaultNode('rect', x, y) as RectNode;
  node.width = width;
  node.height = height;
  return node;
};

describe('performBooleanOperation', () => {
  it('returns a non-empty combined path for overlapping rectangles', () => {
    const left = createRect(0, 0, 100, 100);
    const right = createRect(50, 0, 100, 100);

    const result = performBooleanOperation([left, right], 'union');

    expect(result).toContain('M');
    expect(result.length).toBeGreaterThan(10);
  });

  it('produces distinct subtract and intersect outputs for overlapping rectangles', () => {
    const left = createRect(0, 0, 100, 100);
    const right = createRect(50, 0, 100, 100);

    const subtract = performBooleanOperation([left, right], 'subtract');
    const intersect = performBooleanOperation([left, right], 'intersect');

    expect(subtract).toContain('M');
    expect(intersect).toContain('M');
    expect(subtract).not.toEqual(intersect);
  });
});