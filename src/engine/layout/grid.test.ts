import { describe, expect, it } from 'vitest';
import { resolveGridCell } from './grid';

describe('resolveGridCell', () => {
  it('maps grid coordinates into concrete bounds', () => {
    const result = resolveGridCell(
      { x: 0, y: 0, width: 300, height: 300 },
      { columns: 3, rows: 3, gapX: 0, gapY: 0 },
      { column: 1, row: 1 }
    );

    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });
});
