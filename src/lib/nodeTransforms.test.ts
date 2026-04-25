import { describe, expect, it } from 'vitest';
import { createDefaultNode, PathNode, TextNode } from '../types';
import { scaleSceneNode } from './nodeTransforms';

describe('scaleSceneNode', () => {
  it('scales vector path geometry data along with size', () => {
    const path = createDefaultNode('path', 10, 20) as PathNode;
    path.width = 100;
    path.height = 50;
    path.data = 'M 0 0 L 100 0 L 100 50 Z';

    const scaled = scaleSceneNode(path, 2, 3) as PathNode;

    expect(scaled.width).toBe(200);
    expect(scaled.height).toBe(150);
    expect(scaled.data).toContain('L 200 0');
    expect(scaled.data).toContain('L 200 150');
  });

  it('scales text metrics and local position', () => {
    const text = createDefaultNode('text', 12, 18) as TextNode;
    text.fontSize = 20;
    text.lineHeight = 24;
    text.width = 80;
    text.height = 30;

    const scaled = scaleSceneNode(text, 1.5, 1.5) as TextNode;

    expect(scaled.x).toBe(18);
    expect(scaled.y).toBe(27);
    expect(scaled.fontSize).toBe(30);
    expect(scaled.lineHeight).toBe(36);
  });
});