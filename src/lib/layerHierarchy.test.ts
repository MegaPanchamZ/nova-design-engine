import { describe, expect, it } from 'vitest';
import { createDefaultNode, FrameNode, SceneNode } from '../types';
import { getAutoLayoutReorderInstruction, getLayerDropPosition } from './layerHierarchy';

describe('layerHierarchy', () => {
  it('prefers nesting when hovering the middle of a container row', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    expect(getLayerDropPosition(frame, 100, 40, 118)).toBe('inside');
  });

  it('keeps non-container rows limited to before or after placement', () => {
    const rect = createDefaultNode('rect', 0, 0);
    expect(getLayerDropPosition(rect, 100, 40, 108)).toBe('before');
    expect(getLayerDropPosition(rect, 100, 40, 132)).toBe('after');
  });

  it('builds sibling reorder instructions for explicit flow controls', () => {
    const a = createDefaultNode('rect', 0, 0);
    const b = createDefaultNode('rect', 0, 0);
    const c = createDefaultNode('rect', 0, 0);
    const siblings: SceneNode[] = [a, b, c];

    expect(getAutoLayoutReorderInstruction(siblings, b.id, 'backward')).toEqual({ targetId: a.id, position: 'before' });
    expect(getAutoLayoutReorderInstruction(siblings, b.id, 'forward')).toEqual({ targetId: c.id, position: 'after' });
    expect(getAutoLayoutReorderInstruction(siblings, c.id, 'first')).toEqual({ targetId: a.id, position: 'before' });
    expect(getAutoLayoutReorderInstruction(siblings, a.id, 'last')).toEqual({ targetId: c.id, position: 'after' });
    expect(getAutoLayoutReorderInstruction(siblings, a.id, 'backward')).toBeNull();
  });
});