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
      if (operation === 'subtract') {
        return paths[0] || '';
      }
      if (operation === 'intersect') {
        return paths[paths.length - 1] || '';
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
  clipPaths?: (paths: string[], operation: 'union' | 'difference' | 'intersect' | 'xor') => string;
  combine?: (paths: string[], operation: BooleanOperation) => string;
}

const CLIPPER_WASM_CDN_URL = 'https://esm.sh/clipper2-wasm@latest';

const dynamicImport = async <T = unknown>(moduleName: string): Promise<T> => {
  const importer = new Function('m', 'return import(m)') as (name: string) => Promise<T>;
  return importer(moduleName);
};

const toClipperModule = (loaded: unknown): ClipperLikeModule | null => {
  if (!loaded || typeof loaded !== 'object') return null;
  const moduleRecord = loaded as { default?: unknown } & Record<string, unknown>;
  const maybeDefault = moduleRecord.default;
  const candidate = (maybeDefault && typeof maybeDefault === 'object') ? maybeDefault : moduleRecord;
  return candidate as ClipperLikeModule;
};

const loadClipperModule = async (): Promise<ClipperLikeModule | null> => {
  try {
    const local = await dynamicImport<unknown>('clipper2-wasm');
    const parsed = toClipperModule(local);
    if (parsed) return parsed;
  } catch {
    // Continue to CDN fallback.
  }

  try {
    const remote = await dynamicImport<unknown>(CLIPPER_WASM_CDN_URL);
    return toClipperModule(remote);
  } catch {
    return null;
  }
};

const combineWithClipper = (module: ClipperLikeModule, paths: string[], operation: BooleanOperation): string => {
  if (paths.length === 0) return '';

  if (module.combine) {
    return module.combine(paths, operation);
  }

  if (module.clipPaths) {
    const mapped = operation === 'subtract'
      ? 'difference'
      : operation === 'exclude'
        ? 'xor'
        : operation;
    return module.clipPaths(paths, mapped);
  }

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
};

export const createClipperWasmAdapter = async (): Promise<BooleanWasmAdapter> => {
  const module = await loadClipperModule();
  if (!module) {
    return createFallbackBooleanAdapter();
  }

  try {
    await module.init?.();
  } catch {
    return createFallbackBooleanAdapter();
  }

  return {
    async ready() {
      return;
    },
    combine(paths, operation) {
      return combineWithClipper(module, paths, operation);
    },
  };
};

let activeAdapter: BooleanWasmAdapter = createFallbackBooleanAdapter();
let adapterReadyPromise: Promise<void> | null = null;

const activateBooleanWasmAdapter = async (): Promise<void> => {
  const adapter = await createClipperWasmAdapter();
  activeAdapter = adapter;
  await activeAdapter.ready();
};

export const ensureBooleanWasmReady = (): Promise<void> => {
  if (!adapterReadyPromise) {
    adapterReadyPromise = activateBooleanWasmAdapter().catch(() => {
      activeAdapter = createFallbackBooleanAdapter();
    });
  }

  return adapterReadyPromise;
};

export const getBooleanWasmAdapter = (): BooleanWasmAdapter => {
  void ensureBooleanWasmReady();
  return activeAdapter;
};

export const combineBooleanPaths = (paths: string[], operation: BooleanOperation): string => {
  const adapter = getBooleanWasmAdapter();
  return adapter.combine(paths, operation);
};
