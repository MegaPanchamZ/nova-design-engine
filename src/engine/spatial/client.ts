import { SpatialBounds, SpatialPoint, SpatialQuery } from './types';
import { SpatialWorkerCommand, SpatialWorkerResponse } from './workerProtocol';

type PendingResolver = (message: SpatialWorkerResponse) => void;

export class SpatialWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingResolver>();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<SpatialWorkerResponse>) => {
      const message = event.data;
      if ('requestId' in message && message.requestId) {
        const resolver = this.pending.get(message.requestId);
        if (!resolver) return;
        this.pending.delete(message.requestId);
        resolver(message);
      }
    };
  }

  terminate(): void {
    this.pending.clear();
    this.worker.terminate();
  }

  load(items: SpatialBounds[]): void {
    this.post({ type: 'load', payload: { items } });
  }

  insert(item: SpatialBounds): void {
    this.post({ type: 'insert', payload: { item } });
  }

  remove(id: string): void {
    this.post({ type: 'remove', payload: { id } });
  }

  clear(): void {
    this.post({ type: 'clear' });
  }

  async search(query: SpatialQuery): Promise<SpatialBounds[]> {
    const requestId = crypto.randomUUID();
    const response = await this.request({ type: 'search', payload: { query }, requestId });
    if (response.type !== 'searchResult') return [];
    return response.payload.items;
  }

  async hitTest(point: SpatialPoint): Promise<SpatialBounds[]> {
    const requestId = crypto.randomUUID();
    const response = await this.request({ type: 'hitTest', payload: { point }, requestId });
    if (response.type !== 'hitTestResult') return [];
    return response.payload.items;
  }

  private post(command: SpatialWorkerCommand): void {
    this.worker.postMessage(command);
  }

  private request(command: SpatialWorkerCommand & { requestId: string }): Promise<SpatialWorkerResponse> {
    return new Promise((resolve) => {
      this.pending.set(command.requestId, resolve);
      this.post(command);
    });
  }
}
