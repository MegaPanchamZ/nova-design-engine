export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BooleanWasmAdapter {
  ready: () => Promise<void>;
  combine: (paths: string[], operation: BooleanOperation) => string;
}

export class DeterministicBooleanEngine {
  private adapter: BooleanWasmAdapter;

  constructor(adapter: BooleanWasmAdapter) {
    this.adapter = adapter;
  }

  async combine(paths: string[], operation: BooleanOperation): Promise<string> {
    await this.adapter.ready();
    return this.adapter.combine(paths, operation);
  }
}

export const createFallbackBooleanAdapter = (): BooleanWasmAdapter => {
  return {
    async ready() {
      return;
    },
    combine(paths, operation) {
      if (paths.length === 0) return '';
      if (operation === 'subtract' || operation === 'intersect') {
        return paths[0] || '';
      }
      return paths.join(' ');
    },
  };
};
