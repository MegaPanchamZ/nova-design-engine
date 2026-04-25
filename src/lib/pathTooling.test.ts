import { describe, expect, it } from 'vitest';
import {
  buildPathDataFromPenPoints,
  insertAnchorAtPoint,
  moveControlHandle,
  parsePathData,
  serializePathData,
  toggleAnchorCurve,
} from './pathTooling';

describe('pathTooling', () => {
  it('round-trips cubic path data parse/serialize', () => {
    const input = 'M 0 0 C 25 10, 75 10, 100 0';
    const parsed = parsePathData(input);
    const output = serializePathData(parsed.anchors, parsed.closed);
    expect(output).toContain('C 25 10, 75 10, 100 0');
  });

  it('inserts an anchor on nearest segment', () => {
    const parsed = parsePathData('M 0 0 L 100 0 L 100 100');
    const inserted = insertAnchorAtPoint(parsed, { x: 50, y: 5 });
    expect(inserted).not.toBeNull();
    expect(inserted?.anchors.length).toBe(4);
  });

  it('toggles corner anchor to curve and mirrors handle updates', () => {
    const parsed = parsePathData('M 0 0 L 100 0 L 100 100');
    const curved = toggleAnchorCurve(parsed.anchors, 1);
    expect(curved[1].cpIn).toBeDefined();
    expect(curved[1].cpOut).toBeDefined();

    const moved = moveControlHandle(curved, 1, 'out', { x: 130, y: 20 }, true);
    expect(moved[1].cpOut?.x).toBe(130);
    expect(moved[1].cpIn).toBeDefined();
    expect(Math.round((moved[1].cpIn?.x || 0) + 30)).toBe(Math.round(moved[1].x));
  });

  it('builds normalized path data from pen points', () => {
    const built = buildPathDataFromPenPoints([
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 80 },
    ]);

    expect(built).not.toBeNull();
    expect(built?.bounds.minX).toBe(20);
    expect(built?.bounds.width).toBe(100);
    expect(built?.data.startsWith('M 0 0')).toBe(true);
  });
});