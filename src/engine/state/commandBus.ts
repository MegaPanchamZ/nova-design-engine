export interface Command<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  timestamp: number;
  groupId?: string;
}

export interface EventEnvelope<TPayload = unknown> {
  id: string;
  commandId: string;
  type: string;
  payload: TPayload;
  timestamp: number;
}

export interface TransactionalReducer<TState, TCommand extends Command = Command> {
  (state: TState, command: TCommand): { nextState: TState; events: EventEnvelope[]; dirtyKeys: string[] };
}

export interface UndoGroup {
  id: string;
  commandIds: string[];
}

export class TransactionalCommandBus<TState, TCommand extends Command = Command> {
  private state: TState;
  private reducer: TransactionalReducer<TState, TCommand>;
  private eventLog: EventEnvelope[] = [];
  private commandLog: TCommand[] = [];
  private undoGroups: UndoGroup[] = [];
  private redoGroups: UndoGroup[] = [];

  constructor(initialState: TState, reducer: TransactionalReducer<TState, TCommand>) {
    this.state = initialState;
    this.reducer = reducer;
  }

  getState(): TState {
    return this.state;
  }

  getEvents(): EventEnvelope[] {
    return [...this.eventLog];
  }

  commit(command: TCommand): { dirtyKeys: string[]; events: EventEnvelope[] } {
    const result = this.reducer(this.state, command);
    this.state = result.nextState;

    this.commandLog.push(command);
    this.eventLog.push(...result.events);
    this.redoGroups = [];

    const groupId = command.groupId || command.id;
    const activeGroup = this.undoGroups.find((group) => group.id === groupId);
    if (activeGroup) {
      activeGroup.commandIds.push(command.id);
    } else {
      this.undoGroups.push({ id: groupId, commandIds: [command.id] });
    }

    return { dirtyKeys: result.dirtyKeys, events: result.events };
  }

  undo(): UndoGroup | null {
    const group = this.undoGroups.pop() || null;
    if (!group) return null;
    this.redoGroups.push(group);
    return group;
  }

  redo(): UndoGroup | null {
    const group = this.redoGroups.pop() || null;
    if (!group) return null;
    this.undoGroups.push(group);
    return group;
  }
}
