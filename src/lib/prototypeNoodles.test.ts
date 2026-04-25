import { describe, expect, it } from 'vitest';

import { buildPrototypeNoodlePoints, collectPrototypeConnections, upsertPrototypeNavigation } from './prototypeNoodles';
import { createDefaultNode, FrameNode, Interaction } from '../types';

describe('prototype noodles helpers', () => {
  it('upserts a navigate interaction for a frame target', () => {
    const interactions = upsertPrototypeNavigation([], 'target-frame');

    expect(interactions).toHaveLength(1);
    expect(interactions[0].trigger).toBe('onClick');
    expect(interactions[0].actions[0]).toMatchObject({
      type: 'navigate',
      targetId: 'target-frame',
      animation: 'slide-in',
    });
  });

  it('updates an existing navigate interaction instead of duplicating it', () => {
    const existing: Interaction[] = [{
      id: 'interaction-1',
      trigger: 'onClick',
      actions: [{ type: 'navigate', targetId: 'old-frame', animation: 'instant', value: 'old-frame' }],
    }];

    const interactions = upsertPrototypeNavigation(existing, 'new-frame', 'dissolve');

    expect(interactions).toHaveLength(1);
    expect(interactions[0].actions[0]).toMatchObject({
      targetId: 'new-frame',
      animation: 'dissolve',
      value: 'new-frame',
    });
  });

  it('collects frame-to-frame prototype connections from nodes', () => {
    const source = createDefaultNode('frame', 0, 0) as FrameNode;
    const target = createDefaultNode('frame', 320, 0) as FrameNode;
    source.interactions = [{
      id: 'interaction-1',
      trigger: 'onClick',
      actions: [{ type: 'navigate', targetId: target.id, animation: 'slide-in', value: target.id }],
    }];

    const connections = collectPrototypeConnections([source, target]);

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ sourceId: source.id, targetId: target.id, trigger: 'onClick' });
  });

  it('builds a multi-point curve between source and target frames', () => {
    const points = buildPrototypeNoodlePoints(
      { x: 0, y: 0, width: 200, height: 120 },
      { x: 420, y: 80, width: 240, height: 160 }
    );

    expect(points).toHaveLength(8);
    expect(points[0]).toBe(200);
    expect(points[7]).toBe(160);
  });
});