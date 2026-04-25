import { RendererAdapter, RenderStats, RendererFrameInput, RenderBackendKind } from './types';

type DynamicImport = <T = unknown>(moduleName: string) => Promise<T>;
type Render2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const dynamicImport: DynamicImport = async <T = unknown>(moduleName: string): Promise<T> => {
  const importer = new Function('m', 'return import(m)') as (name: string) => Promise<T>;
  return importer(moduleName);
};

const createOffscreenContext = (source: HTMLCanvasElement | OffscreenCanvas): Render2DContext | null => {
  const width = 'width' in source ? source.width : 1024;
  const height = 'height' in source ? source.height : 768;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    return canvas.getContext('2d');
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    return canvas.getContext('2d');
  }

  return null;
};

const drawDirtyRegions2D = (ctx: Render2DContext | null, input: RendererFrameInput): RenderStats => {
  const start = performance.now();

  if (ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
    ctx.lineWidth = 1;

    input.dirtyRegions.forEach((region) => {
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    });
  }

  return {
    frameTimeMs: performance.now() - start,
    drawCalls: Math.max(1, input.dirtyRegions.length),
    visibleNodes: input.nodeIds.length,
    tilesDrawn: Math.max(1, input.dirtyRegions.length),
  };
};

const createFallbackRenderer = (kind: RenderBackendKind): RendererAdapter => {
  let context: Render2DContext | null = null;

  return {
    kind,
    async initialize(canvas) {
      context = createOffscreenContext(canvas);
    },
    async renderFrame(input) {
      return drawDirtyRegions2D(context, input);
    },
    dispose() {
      context = null;
    },
  };
};

const createPixiRenderer = (): RendererAdapter => {
  let context: Render2DContext | null = null;
  let app: unknown = null;
  let GraphicsCtor: unknown = null;

  return {
    kind: 'pixi-webgl',
    async initialize(canvas) {
      context = createOffscreenContext(canvas);

      try {
        const pixi = await dynamicImport<Record<string, unknown>>('pixi.js');
        const Application = pixi.Application as unknown as new (...args: unknown[]) => unknown;
        GraphicsCtor = pixi.Graphics;
        if (!Application || !GraphicsCtor) return;

        const maybeCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : undefined;
        app = new Application({
          width: ('width' in canvas ? canvas.width : 1024),
          height: ('height' in canvas ? canvas.height : 768),
          antialias: true,
          backgroundAlpha: 0,
          view: maybeCanvas,
        } as unknown as never);
      } catch {
        app = null;
      }
    },
    async renderFrame(input) {
      const start = performance.now();

      if (app && GraphicsCtor && typeof app === 'object') {
        const stage = (app as { stage?: { removeChildren?: () => void; addChild?: (child: unknown) => void } }).stage;
        const renderer = (app as { renderer?: { render?: (target: unknown) => void } }).renderer;
        if (stage?.removeChildren && stage?.addChild && renderer?.render) {
          stage.removeChildren();
          input.dirtyRegions.forEach((region) => {
            const graphics = new (GraphicsCtor as new () => {
              lineStyle: (width: number, color: number, alpha?: number) => void;
              drawRect: (x: number, y: number, width: number, height: number) => void;
            })();
            graphics.lineStyle(1, 0x14b8a6, 0.8);
            graphics.drawRect(region.x, region.y, region.width, region.height);
            const addChild = stage.addChild;
            if (addChild) addChild.call(stage, graphics);
          });
          renderer.render(stage);
        }
      } else {
        drawDirtyRegions2D(context, input);
      }

      return {
        frameTimeMs: performance.now() - start,
        drawCalls: Math.max(1, input.dirtyRegions.length),
        visibleNodes: input.nodeIds.length,
        tilesDrawn: Math.max(1, input.dirtyRegions.length),
      };
    },
    dispose() {
      if (app && typeof app === 'object') {
        const destroy = (app as { destroy?: (removeView?: boolean) => void }).destroy;
        destroy?.(true);
      }
      app = null;
      GraphicsCtor = null;
      context = null;
    },
  };
};

const createCanvasKitRenderer = (): RendererAdapter => {
  let context: Render2DContext | null = null;
  let surface: unknown = null;
  let canvasKit: unknown = null;

  return {
    kind: 'canvaskit',
    async initialize(canvas) {
      context = createOffscreenContext(canvas);

      try {
        const module = await dynamicImport<Record<string, unknown>>('canvaskit-wasm');
        const init = (module.default || module.CanvasKitInit) as ((config?: { locateFile?: (file: string) => string }) => Promise<unknown>) | undefined;
        if (!init) return;

        canvasKit = await init();
        const ck = canvasKit as {
          MakeSurface?: (target: HTMLCanvasElement | OffscreenCanvas) => unknown;
          MakeSWCanvasSurface?: (target: HTMLCanvasElement | OffscreenCanvas) => unknown;
        };
        surface = ck.MakeSurface?.(canvas) || ck.MakeSWCanvasSurface?.(canvas) || null;
      } catch {
        canvasKit = null;
        surface = null;
      }
    },
    async renderFrame(input) {
      const start = performance.now();

      if (surface && canvasKit) {
        try {
          const skSurface = surface as {
            getCanvas?: () => {
              clear?: (color: unknown) => void;
              drawRect?: (rect: unknown, paint: unknown) => void;
            };
            flush?: () => void;
          };

          const ck = canvasKit as {
            Color4f?: (r: number, g: number, b: number, a: number) => unknown;
            Paint?: new () => { setColor?: (color: unknown) => void; setStrokeWidth?: (value: number) => void; setStyle?: (style: unknown) => void };
            PaintStyle?: { Stroke?: unknown };
            XYWHRect?: (x: number, y: number, width: number, height: number) => unknown;
            TRANSPARENT?: unknown;
          };

          const canvas = skSurface.getCanvas?.();
          const paint = ck.Paint ? new ck.Paint() : null;
          const makeRect = ck.XYWHRect;
          if (canvas && paint && ck.Color4f && makeRect) {
            paint.setColor?.(ck.Color4f(0.08, 0.73, 0.65, 0.8));
            paint.setStrokeWidth?.(1);
            if (ck.PaintStyle?.Stroke) paint.setStyle?.(ck.PaintStyle.Stroke);
            canvas.clear?.(ck.TRANSPARENT);

            input.dirtyRegions.forEach((region) => {
              canvas.drawRect?.(makeRect(region.x, region.y, region.width, region.height), paint);
            });

            skSurface.flush?.();
          }
        } catch {
          drawDirtyRegions2D(context, input);
        }
      } else {
        drawDirtyRegions2D(context, input);
      }

      return {
        frameTimeMs: performance.now() - start,
        drawCalls: Math.max(1, input.dirtyRegions.length),
        visibleNodes: input.nodeIds.length,
        tilesDrawn: Math.max(1, input.dirtyRegions.length),
      };
    },
    dispose() {
      if (surface && typeof surface === 'object') {
        const deleteFn = (surface as { delete?: () => void }).delete;
        deleteFn?.();
      }
      surface = null;
      canvasKit = null;
      context = null;
    },
  };
};

export interface RendererCreationOptions {
  preferredBackend?: RenderBackendKind;
}

export const createRendererAdapter = (options: RendererCreationOptions = {}): RendererAdapter => {
  const preferred = options.preferredBackend || 'react-konva';

  if (preferred === 'canvaskit') {
    return createCanvasKitRenderer();
  }
  if (preferred === 'pixi-webgl') {
    return createPixiRenderer();
  }
  if (preferred === 'webgpu') {
    return createFallbackRenderer('webgpu');
  }

  return createFallbackRenderer('react-konva');
};
