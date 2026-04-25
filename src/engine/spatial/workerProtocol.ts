import { SpatialBounds, SpatialPoint, SpatialQuery } from './types';

export type SpatialWorkerCommand =
  | { type: 'load'; payload: { items: SpatialBounds[] } }
  | { type: 'insert'; payload: { item: SpatialBounds } }
  | { type: 'remove'; payload: { id: string } }
  | { type: 'search'; payload: { query: SpatialQuery }; requestId: string }
  | { type: 'hitTest'; payload: { point: SpatialPoint }; requestId: string }
  | { type: 'clear' };

export type SpatialWorkerResponse =
  | { type: 'searchResult'; requestId: string; payload: { items: SpatialBounds[] } }
  | { type: 'hitTestResult'; requestId: string; payload: { items: SpatialBounds[] } }
  | { type: 'ack'; command: SpatialWorkerCommand['type'] }
  | { type: 'error'; requestId?: string; error: string };
