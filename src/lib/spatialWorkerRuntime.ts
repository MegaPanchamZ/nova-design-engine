import { SpatialWorkerClient } from '../engine/spatial/client';
import { SpatialBounds, SpatialPoint, SpatialQuery } from '../engine/spatial/types';

export class SpatialWorkerRuntime {
  private client: SpatialWorkerClient | null = null;
  private initializing: Promise<boolean> | null = null;

  async initialize(): Promise<boolean> {
    if (this.client) return true;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      if (typeof Worker === 'undefined') return false;

      try {
        const worker = new Worker(new URL('../engine/spatial/worker.ts', import.meta.url), { type: 'module' });
        this.client = new SpatialWorkerClient(worker);
        return true;
      } catch {
        this.client = null;
        return false;
      }
    })();

    const ready = await this.initializing;
    this.initializing = null;
    return ready;
  }

  isReady(): boolean {
    return this.client !== null;
  }

  dispose(): void {
    this.client?.terminate();
    this.client = null;
    this.initializing = null;
  }

  load(items: SpatialBounds[]): void {
    this.client?.load(items);
  }

  async search(query: SpatialQuery): Promise<SpatialBounds[]> {
    if (!this.client) return [];
    return this.client.search(query);
  }

  async hitTest(point: SpatialPoint): Promise<SpatialBounds[]> {
    if (!this.client) return [];
    return this.client.hitTest(point);
  }
}
