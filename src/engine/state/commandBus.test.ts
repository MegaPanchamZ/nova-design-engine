import { describe, expect, it } from 'vitest';
import { Command, TransactionalCommandBus, TransactionalReducer } from './commandBus';

interface CounterState {
  value: number;
}

type CounterCommand = Command<{ by: number }>;

const reducer: TransactionalReducer<CounterState, CounterCommand> = (state, command) => {
  return {
    nextState: { value: state.value + command.payload.by },
    dirtyKeys: ['value'],
    events: [
      {
        id: `${command.id}:applied`,
        commandId: command.id,
        type: 'counter.applied',
        payload: { next: state.value + command.payload.by },
        timestamp: command.timestamp,
      },
    ],
  };
};

describe('TransactionalCommandBus', () => {
  it('commits commands and records events', () => {
    const bus = new TransactionalCommandBus<CounterState, CounterCommand>({ value: 0 }, reducer);
    const command: CounterCommand = {
      id: 'cmd-1',
      type: 'increment',
      payload: { by: 3 },
      timestamp: Date.now(),
    };

    const result = bus.commit(command);

    expect(bus.getState().value).toBe(3);
    expect(result.dirtyKeys).toEqual(['value']);
    expect(bus.getEvents()).toHaveLength(1);
  });

  it('tracks undo and redo groups', () => {
    const bus = new TransactionalCommandBus<CounterState, CounterCommand>({ value: 0 }, reducer);
    const timestamp = Date.now();

    bus.commit({ id: 'cmd-1', type: 'increment', payload: { by: 1 }, timestamp, groupId: 'g1' });
    bus.commit({ id: 'cmd-2', type: 'increment', payload: { by: 1 }, timestamp, groupId: 'g1' });

    const undone = bus.undo();
    expect(undone?.id).toBe('g1');

    const redone = bus.redo();
    expect(redone?.id).toBe('g1');
  });
});
