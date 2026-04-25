import { describe, expect, it } from 'vitest';
import { createInitialToolSession, reduceToolSession } from './toolStateMachine';

describe('toolStateMachine', () => {
  it('starts and finalizes draw tools through pointer lifecycle', () => {
    let state = createInitialToolSession('rect');
    state = reduceToolSession(state, { type: 'pointer-down', button: 0, point: { x: 10, y: 10 } });
    expect(state.phase).toBe('drawing');

    state = reduceToolSession(state, { type: 'pointer-up', point: { x: 100, y: 80 } });
    expect(state.phase).toBe('idle');
    expect(state.lockId).toBeNull();
  });

  it('keeps pen tool in drawing phase until finish event', () => {
    let state = createInitialToolSession('pen');
    state = reduceToolSession(state, { type: 'pointer-down', button: 0, point: { x: 0, y: 0 } });
    state = reduceToolSession(state, { type: 'pointer-up', point: { x: 0, y: 0 } });

    expect(state.phase).toBe('drawing');
    expect(state.pathPointCount).toBe(1);

    state = reduceToolSession(state, { type: 'finish-path' });
    expect(state.phase).toBe('idle');
    expect(state.pathPointCount).toBe(0);
  });

  it('enters panning on middle mouse regardless of active tool', () => {
    let state = createInitialToolSession('select');
    state = reduceToolSession(state, { type: 'pointer-down', button: 1, point: { x: 5, y: 5 } });
    expect(state.phase).toBe('panning');
  });
});