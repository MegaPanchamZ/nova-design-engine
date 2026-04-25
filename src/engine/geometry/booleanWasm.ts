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

interface ClipperLikeModule {
  init?: () => Promise<void>;
  union?: (paths: string[]) => string;
  difference?: (left: string, right: string) => string;
  intersect?: (paths: string[]) => string;
  xor?: (paths: string[]) => string;
}

const dynamicImport = async <T = unknown>(moduleName: string): Promise<T> => {
  const importer = new Function('m', 'return import(m)') as (name: string) => Promise<T>;
  return importer(moduleName);
};

export const createClipperWasmAdapter = async (): Promise<BooleanWasmAdapter> => {
  let module: ClipperLikeModule | null = null;

  try {
    const loaded = await dynamicImport<{ default?: ClipperLikeModule } & ClipperLikeModule>('clipper2-wasm');
    module = loaded.default || loaded;
    await module.init?.();
  } catch {
    return createFallbackBooleanAdapter();
  }

  return {
    async ready() {
      return;
    },
    combine(paths, operation) {
      if (!module || paths.length === 0) return '';

      if (operation === 'union') {
        return module.union?.(paths) || paths.join(' ');
      }
      if (operation === 'subtract') {
        if (paths.length < 2) return paths[0] || '';
        return module.difference?.(paths[0], paths.slice(1).join(' ')) || (paths[0] || '');
      }
      if (operation === 'intersect') {
        return module.intersect?.(paths) || (paths[0] || '');
      }

      return module.xor?.(paths) || paths.join(' ');
    },
  };
};
