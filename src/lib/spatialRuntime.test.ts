import { describe, expect, it } from 'vitest';
import { createDefaultNode, Guide, SceneNode } from '../types';
import {
  createSpatialRuntimeState,
  findBoundsIdsInRect,
  findSmallestContainingNodeId,
  snapNodeToSpatial,
} from './spatialRuntime';

const makeRect = (id: string, x: number, y: number, width: number, height: number, parentId?: string): SceneNode => {
  const node = createDefaultNode('rect', x, y, id);
  return { ...node, width, height, parentId };
};

describe('spatialRuntime', () => {
  it('resolves global positions through parent hierarchy', () => {
    const parent = makeRect('parent', 100, 80, 400, 300);
    const child = makeRect('child', 20, 30, 100, 60, parent.id);
    const runtime = createSpatialRuntimeState([parent, child]);

    expect(runtime.positionsById.get('child')).toEqual({ x: 120, y: 110 });
  });

  it('returns bounds ids inside query rectangle', () => {
    const a = makeRect('a', 0, 0, 40, 40);
    const b = makeRect('b', 200, 200, 40, 40);
    const runtime = createSpatialRuntimeState([a, b]);

    const ids = findBoundsIdsInRect(runtime, { x: 10, y: 10, width: 50, height: 50 });
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });

  it('selects smallest containing node for a point', () => {
    const outer = makeRect('outer', 0, 0, 200, 200);
    const inner = makeRect('inner', 30, 30, 40, 40);
    const runtime = createSpatialRuntimeState([outer, inner]);

    const hit = findSmallestContainingNodeId(runtime, { x: 35, y: 35 });
    expect(hit).toBe('inner');
  });

  it('snaps node to nearby bounds and persistent guides', () => {
    const moving = makeRect('moving', 12, 20, 50, 40);
    const anchor = makeRect('anchor', 80, 20, 50, 40);
    const runtime = createSpatialRuntimeState([moving, anchor]);
    const guides: Guide[] = [{ id: 'g1', type: 'vertical', position: 80 }];

    const snapped = snapNodeToSpatial({
      state: runtime,
      nodeId: moving.id,
      globalX: 76,
      globalY: 20,
      width: 50,
      height: 40,
      snapThreshold: 6,
      persistentGuides: guides,
    });

    expect(snapped.x).toBe(80);
    expect(snapped.snapLines.some((line) => line.x === 80)).toBe(true);
  });
});
