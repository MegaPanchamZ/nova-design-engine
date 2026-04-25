import { describe, expect, it } from 'vitest';
import { SpatialIndex } from './spatialIndex';

describe('SpatialIndex', () => {
  it('returns only intersecting bounds for query', () => {
    const index = new SpatialIndex();
    index.load([
      { id: 'a', minX: 0, minY: 0, maxX: 100, maxY: 100 },
      { id: 'b', minX: 200, minY: 200, maxX: 260, maxY: 260 },
    ]);

    const matches = index.search({ minX: 50, minY: 50, maxX: 130, maxY: 130 });
    expect(matches.map((item) => item.id)).toEqual(['a']);
  });

  it('hit tests point containment', () => {
    const index = new SpatialIndex();
    index.load([{ id: 'target', minX: 20, minY: 20, maxX: 40, maxY: 40 }]);

    const hits = index.hitTest({ x: 25, y: 25 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe('target');
  });
});
