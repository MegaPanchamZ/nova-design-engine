import { ToolType } from '../types';

export interface ToolPoint {
  x: number;
  y: number;
}

export type ToolPhase = 'idle' | 'drawing' | 'panning' | 'path-edit';

export interface ToolSessionState {
  tool: ToolType;
  phase: ToolPhase;
  lockId: string | null;
  origin: ToolPoint | null;
  latestPoint: ToolPoint | null;
  pathPointCount: number;
}

export type ToolEvent =
  | { type: 'select-tool'; tool: ToolType }
  | { type: 'pointer-down'; button: number; point: ToolPoint }
  | { type: 'pointer-move'; point: ToolPoint }
  | { type: 'pointer-up'; point: ToolPoint }
  | { type: 'finish-path' }
  | { type: 'cancel' };

const DRAW_TOOLS: ToolType[] = ['rect', 'circle', 'ellipse', 'text', 'frame', 'section', 'image'];

const generateLockId = (): string => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createInitialToolSession = (tool: ToolType = 'select'): ToolSessionState => {
  return {
    tool,
    phase: 'idle',
    lockId: null,
    origin: null,
    latestPoint: null,
    pathPointCount: 0,
  };
};

export const isDrawingTool = (tool: ToolType): boolean => {
  return DRAW_TOOLS.includes(tool);
};

export const reduceToolSession = (
  current: ToolSessionState,
  event: ToolEvent
): ToolSessionState => {
  if (event.type === 'select-tool') {
    return {
      tool: event.tool,
      phase: 'idle',
      lockId: null,
      origin: null,
      latestPoint: null,
      pathPointCount: 0,
    };
  }

  if (event.type === 'cancel') {
    return {
      ...current,
      phase: 'idle',
      lockId: null,
      origin: null,
      latestPoint: null,
      pathPointCount: 0,
    };
  }

  if (event.type === 'finish-path') {
    if (current.tool !== 'pen') return current;
    return {
      ...current,
      phase: 'idle',
      lockId: null,
      origin: null,
      latestPoint: null,
      pathPointCount: 0,
    };
  }

  if (event.type === 'pointer-down') {
    if (event.button === 1 || current.tool === 'hand') {
      return {
        ...current,
        phase: 'panning',
        lockId: generateLockId(),
        origin: event.point,
        latestPoint: event.point,
      };
    }

    if (current.tool === 'pen') {
      const nextCount = current.pathPointCount + 1;
      return {
        ...current,
        phase: 'drawing',
        lockId: current.lockId || generateLockId(),
        origin: current.origin || event.point,
        latestPoint: event.point,
        pathPointCount: nextCount,
      };
    }

    if (isDrawingTool(current.tool)) {
      return {
        ...current,
        phase: 'drawing',
        lockId: generateLockId(),
        origin: event.point,
        latestPoint: event.point,
      };
    }

    return {
      ...current,
      phase: 'idle',
      lockId: null,
      origin: null,
      latestPoint: event.point,
    };
  }

  if (event.type === 'pointer-move') {
    if (current.phase === 'idle') {
      return {
        ...current,
        latestPoint: event.point,
      };
    }

    return {
      ...current,
      latestPoint: event.point,
    };
  }

  if (event.type === 'pointer-up') {
    if (current.phase === 'panning') {
      return {
        ...current,
        phase: 'idle',
        lockId: null,
        origin: null,
        latestPoint: event.point,
      };
    }

    if (current.tool === 'pen') {
      return {
        ...current,
        phase: 'drawing',
        latestPoint: event.point,
      };
    }

    if (current.phase === 'drawing') {
      return {
        ...current,
        phase: 'idle',
        lockId: null,
        origin: null,
        latestPoint: event.point,
      };
    }

    return {
      ...current,
      latestPoint: event.point,
    };
  }

  return current;
};