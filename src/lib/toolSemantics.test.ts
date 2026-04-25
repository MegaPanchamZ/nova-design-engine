import { describe, expect, it } from 'vitest';
import { createDefaultNode, FrameNode } from '../types';
import { computeViewportForZoomBox, findDeepSelectableNode, resolveDirectSelectCycle } from './toolSemantics';

describe('toolSemantics', () => {
  it('finds the deepest descendant hit for direct-select within nested frames', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.width = 300;
    frame.height = 300;

    const innerFrame = createDefaultNode('frame', 40, 40) as FrameNode;
    innerFrame.parentId = frame.id;
    innerFrame.width = 200;
    innerFrame.height = 200;

    const rect = createDefaultNode('rect', 20, 20);
    rect.parentId = innerFrame.id;
    rect.width = 60;
    rect.height = 40;

    const result = findDeepSelectableNode([frame, innerFrame, rect], frame.id, { x: 70, y: 70 });
    expect(result?.id).toBe(rect.id);
  });

  it('computes a centered viewport for a zoom marquee box', () => {
    const viewport = computeViewportForZoomBox(
      { x: 100, y: 200, width: 200, height: 100 },
      { width: 1000, height: 800 },
      { x: 0, y: 0, zoom: 1 }
    );

    expect(viewport.zoom).toBeGreaterThan(3);
    expect(viewport.x).toBeLessThan(0);
    expect(viewport.y).toBeLessThan(0);
  });

  it('cycles through overlapping direct-select candidates on repeated clicks', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.width = 300;
    frame.height = 300;

    const innerFrame = createDefaultNode('frame', 40, 40) as FrameNode;
    innerFrame.parentId = frame.id;
    innerFrame.width = 200;
    innerFrame.height = 200;

    const rect = createDefaultNode('rect', 20, 20);
    rect.parentId = innerFrame.id;
    rect.width = 60;
    rect.height = 40;

    const point = { x: 70, y: 70 };
    const first = resolveDirectSelectCycle([frame, innerFrame, rect], point, null);
    expect(first.node?.id).toBe(rect.id);

    const second = resolveDirectSelectCycle([frame, innerFrame, rect], point, first.cycle);
    expect(second.node?.id).toBe(innerFrame.id);

    const third = resolveDirectSelectCycle([frame, innerFrame, rect], point, second.cycle);
    expect(third.node?.id).toBe(frame.id);

    const fourth = resolveDirectSelectCycle([frame, innerFrame, rect], point, third.cycle);
    expect(fourth.node?.id).toBe(rect.id);
  });
});