import { describe, expect, it } from 'vitest';
import { calculateLayout } from './layoutUtils';
import { createDefaultNode, FrameNode, SceneNode } from '../types';

describe('calculateLayout', () => {
  it('wraps horizontal auto-layout items into multiple lines', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.layoutMode = 'horizontal';
    frame.layoutWrap = 'wrap';
    frame.width = 220;
    frame.height = 300;
    frame.gap = 10;
    frame.padding = { top: 0, right: 0, bottom: 0, left: 0 };

    const a = createDefaultNode('rect', 0, 0);
    const b = createDefaultNode('rect', 0, 0);
    const c = createDefaultNode('rect', 0, 0);

    a.width = 100;
    a.height = 40;
    b.width = 100;
    b.height = 40;
    c.width = 100;
    c.height = 40;

    const children: SceneNode[] = [a, b, c];
    const result = calculateLayout(frame, children);

    const [na, nb, nc] = result.children;
    expect(na.x).toBe(0);
    expect(nb.x).toBe(110);
    expect(na.y).toBe(0);
    expect(nb.y).toBe(0);
    expect(nc.x).toBe(0);
    expect(nc.y).toBe(50);
  });

  it('supports grid track sizing with mixed fixed and fr tracks', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.layoutMode = 'grid';
    frame.width = 360;
    frame.height = 200;
    frame.gridColumns = '100 1fr';
    frame.gridRows = '1fr 1fr';
    frame.gap = 10;
    frame.padding = { top: 0, right: 0, bottom: 0, left: 0 };

    const a = createDefaultNode('rect', 0, 0);
    const b = createDefaultNode('rect', 0, 0);
    const c = createDefaultNode('rect', 0, 0);
    b.horizontalResizing = 'fill';

    const result = calculateLayout(frame, [a, b, c]);
    const [na, nb, nc] = result.children;

    expect(na.x).toBe(0);
    expect(nb.x).toBeGreaterThan(100);
    expect(nb.width).toBeGreaterThan(200);
    expect(nc.y).toBeGreaterThan(0);
  });
});