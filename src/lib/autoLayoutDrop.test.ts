import { describe, expect, it } from 'vitest';
import { getAutoLayoutDropPreview } from './autoLayoutDrop';
import { createDefaultNode, FrameNode, SceneNode } from '../types';

describe('autoLayoutDrop', () => {
  it('returns an inside box marker for empty auto-layout frames', () => {
    const frame = createDefaultNode('frame', 20, 30) as FrameNode;
    frame.layoutMode = 'horizontal';
    frame.width = 200;
    frame.height = 120;
    frame.padding = { top: 10, right: 12, bottom: 14, left: 16 };

    const preview = getAutoLayoutDropPreview(frame, [], { x: 80, y: 90 }, (id) => ({ x: id === frame.id ? frame.x : 0, y: id === frame.id ? frame.y : 0 }));

    expect(preview?.position).toBe('inside');
    expect(preview?.marker.kind).toBe('box');
    if (preview?.marker.kind === 'box') {
      expect(preview.marker.x).toBe(36);
      expect(preview.marker.y).toBe(40);
      expect(preview.marker.width).toBe(172);
      expect(preview.marker.height).toBe(96);
    }
  });

  it('finds the closest insertion line in a horizontal auto-layout row', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.layoutMode = 'horizontal';

    const a = createDefaultNode('rect', 10, 12);
    a.parentId = frame.id;
    a.width = 40;
    a.height = 20;

    const b = createDefaultNode('rect', 70, 12);
    b.parentId = frame.id;
    b.width = 40;
    b.height = 20;

    const nodes: SceneNode[] = [a, b];
    const preview = getAutoLayoutDropPreview(frame, nodes, { x: 58, y: 18 }, (id) => {
      if (id === frame.id) return { x: 0, y: 0 };
      const node = nodes.find((entry) => entry.id === id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });

    expect(preview?.targetId).toBe(b.id);
    expect(preview?.position).toBe('before');
    expect(preview?.marker.kind).toBe('line');
    if (preview?.marker.kind === 'line') {
      expect(preview.marker.orientation).toBe('vertical');
      expect(preview.marker.x).toBe(60);
    }
  });

  it('treats wrapped row boundaries as a before-next-line insertion slot', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.layoutMode = 'horizontal';
    frame.layoutWrap = 'wrap';

    const a = createDefaultNode('rect', 10, 10);
    a.parentId = frame.id;
    a.width = 30;
    a.height = 20;

    const b = createDefaultNode('rect', 50, 10);
    b.parentId = frame.id;
    b.width = 30;
    b.height = 20;

    const c = createDefaultNode('rect', 10, 44);
    c.parentId = frame.id;
    c.width = 30;
    c.height = 20;

    const nodes: SceneNode[] = [a, b, c];
    const preview = getAutoLayoutDropPreview(frame, nodes, { x: 12, y: 48 }, (id) => {
      if (id === frame.id) return { x: 0, y: 0 };
      const node = nodes.find((entry) => entry.id === id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });

    expect(preview?.targetId).toBe(c.id);
    expect(preview?.position).toBe('before');
    expect(preview?.marker.kind).toBe('line');
    if (preview?.marker.kind === 'line') {
      expect(preview.marker.orientation).toBe('vertical');
      expect(preview.marker.x).toBe(c.x);
      expect(preview.marker.y).toBe(c.y);
    }
  });
});