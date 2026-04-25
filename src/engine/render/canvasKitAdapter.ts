import type { SceneNode } from '../../types';
import { buildMaskRuns } from './maskStack';
import type { RenderBackendKind, RenderCamera, RendererAdapter, RendererFrameInput, RenderSceneNode, RenderStats } from './types';

type DynamicImport = <T = unknown>(moduleName: string) => Promise<T>;

const dynamicImport: DynamicImport = async <T = unknown>(moduleName: string): Promise<T> => {
  const importer = new Function('m', 'return import(m)') as (name: string) => Promise<T>;
  return importer(moduleName);
};

const DEFAULT_CANVASKIT_CDN = 'https://unpkg.com/canvaskit-wasm@0.39.1/bin/full';

const parseHexColor = (value: string): { r: number; g: number; b: number } | null => {
  const normalized = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;

  if (short.test(normalized)) {
    const [, hex] = normalized.match(short) || [];
    if (!hex) return null;
    return {
      r: parseInt(`${hex[0]}${hex[0]}`, 16),
      g: parseInt(`${hex[1]}${hex[1]}`, 16),
      b: parseInt(`${hex[2]}${hex[2]}`, 16),
    };
  }

  if (full.test(normalized)) {
    const [, hex] = normalized.match(full) || [];
    if (!hex) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
};

const resolveNodeFillColor = (node: SceneNode): string | null => {
  const visibleSolid = [...(node.fills || [])]
    .reverse()
    .find((paint) => paint.visible !== false && paint.type === 'solid' && typeof paint.color === 'string');
  if (visibleSolid?.color) return visibleSolid.color;
  if (typeof node.fill === 'string' && node.fill !== 'transparent') return node.fill;
  return null;
};

const resolveNodeStrokeColor = (node: SceneNode): string | null => {
  const visibleSolid = [...(node.strokes || [])]
    .reverse()
    .find((paint) => paint.visible !== false && paint.type === 'solid' && typeof paint.color === 'string');
  if (visibleSolid?.color) return visibleSolid.color;
  if (typeof node.stroke === 'string' && node.stroke !== 'transparent') return node.stroke;
  return null;
};

const shouldRenderNode = (node: SceneNode): boolean => {
  return node.visible !== false && node.opacity > 0;
};

const toCamera = (input: RendererFrameInput): RenderCamera => {
  if (input.camera) return input.camera;
  return { x: 0, y: 0, zoom: 1, pixelRatio: 1 };
};

const getStats = (start: number, input: RendererFrameInput, drawCalls: number): RenderStats => {
  return {
    frameTimeMs: performance.now() - start,
    drawCalls,
    visibleNodes: input.sceneNodes?.length || input.nodeIds.length,
    tilesDrawn: Math.max(1, input.dirtyRegions.length),
  };
};

const makeSkiaPath = (canvasKit: any, entry: RenderSceneNode): any | null => {
  const { node, globalX, globalY } = entry;

  if (node.type === 'rect' || node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance' || node.type === 'image') {
    const path = new canvasKit.Path();
    path.addRect(canvasKit.XYWHRect(globalX, globalY, node.width, node.height));
    return path;
  }

  if (node.type === 'circle') {
    const path = new canvasKit.Path();
    path.addCircle(globalX + node.width / 2, globalY + node.width / 2, Math.abs(node.width / 2));
    return path;
  }

  if (node.type === 'ellipse') {
    const path = new canvasKit.Path();
    path.addOval(canvasKit.XYWHRect(globalX, globalY, node.width, node.height));
    return path;
  }

  if (node.type === 'path' && node.data) {
    return canvasKit.Path.MakeFromSVGString(node.data) || null;
  }

  return null;
};

const withPathTranslation = (canvas: any, entry: RenderSceneNode, callback: () => void) => {
  if (entry.node.type !== 'path') {
    callback();
    return;
  }

  canvas.save();
  canvas.translate(entry.globalX, entry.globalY);
  callback();
  canvas.restore();
};

const drawNodeWithSkia = (canvasKit: any, canvas: any, entry: RenderSceneNode): number => {
  const { node } = entry;
  if (!shouldRenderNode(node)) return 0;

  let calls = 0;
  const alpha = Math.max(0, Math.min(1, node.opacity));

  if (node.type === 'text') {
    const fillColorHex = resolveNodeFillColor(node) || '#E5E7EB';
    const fillColor = parseHexColor(fillColorHex);
    if (!fillColor) return 0;

    const paint = new canvasKit.Paint();
    paint.setColor(canvasKit.Color4f(fillColor.r / 255, fillColor.g / 255, fillColor.b / 255, alpha));
    paint.setStyle(canvasKit.PaintStyle.Fill);
    paint.setAntiAlias(true);

    const font = new canvasKit.Font(null, Math.max(1, node.fontSize || 14));
    canvas.drawSimpleText(node.text || '', entry.globalX, entry.globalY + Math.max(node.fontSize || 14, 14), font, paint);
    font.delete?.();
    paint.delete?.();
    return 1;
  }

  const path = makeSkiaPath(canvasKit, entry);
  if (!path) return 0;

  const fillColorHex = resolveNodeFillColor(node);
  const strokeColorHex = resolveNodeStrokeColor(node);
  const fillColor = fillColorHex ? parseHexColor(fillColorHex) : null;
  const strokeColor = strokeColorHex ? parseHexColor(strokeColorHex) : null;

  if (fillColor) {
    const paint = new canvasKit.Paint();
    paint.setColor(canvasKit.Color4f(fillColor.r / 255, fillColor.g / 255, fillColor.b / 255, alpha));
    paint.setStyle(canvasKit.PaintStyle.Fill);
    paint.setAntiAlias(true);

    withPathTranslation(canvas, entry, () => {
      canvas.drawPath(path, paint);
    });

    paint.delete?.();
    calls += 1;
  }

  if (strokeColor && node.strokeWidth > 0) {
    const paint = new canvasKit.Paint();
    paint.setColor(canvasKit.Color4f(strokeColor.r / 255, strokeColor.g / 255, strokeColor.b / 255, alpha));
    paint.setStyle(canvasKit.PaintStyle.Stroke);
    paint.setStrokeWidth(Math.max(0.5, node.strokeWidth));
    paint.setAntiAlias(true);

    withPathTranslation(canvas, entry, () => {
      canvas.drawPath(path, paint);
    });

    paint.delete?.();
    calls += 1;
  }

  path.delete?.();
  return calls;
};

const drawMaskRunWithSkia = (canvasKit: any, canvas: any, run: ReturnType<typeof buildMaskRuns>[number], entriesById: Map<string, RenderSceneNode>): number => {
  let drawCalls = 0;

  if (!run.rootMask) {
    run.nodeIds.forEach((id) => {
      const entry = entriesById.get(id);
      if (!entry) return;
      drawCalls += drawNodeWithSkia(canvasKit, canvas, entry);
    });
    return drawCalls;
  }

  const maskEntry = entriesById.get(run.rootMask.id);
  if (!maskEntry) return drawCalls;

  const maskPath = makeSkiaPath(canvasKit, maskEntry);
  if (!maskPath) return drawCalls;

  canvas.save();
  withPathTranslation(canvas, maskEntry, () => {
    canvas.clipPath(maskPath, true);
  });

  run.nodeIds.forEach((id) => {
    const entry = entriesById.get(id);
    if (!entry) return;
    drawCalls += drawNodeWithSkia(canvasKit, canvas, entry);
  });

  canvas.restore();
  maskPath.delete?.();

  return drawCalls;
};

const drawFallback2D = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null, input: RendererFrameInput): RenderStats => {
  const start = performance.now();

  if (ctx) {
    const camera = toCamera(input);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

    (input.sceneNodes || []).forEach((entry) => {
      const { node, globalX, globalY } = entry;
      if (!shouldRenderNode(node)) return;

      if (node.type === 'text') {
        const fill = resolveNodeFillColor(node) || '#E5E7EB';
        ctx.fillStyle = fill;
        ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity));
        ctx.font = `${Math.max(1, node.fontSize || 14)}px ${node.fontFamily || 'sans-serif'}`;
        ctx.fillText(node.text || '', globalX, globalY + Math.max(node.fontSize || 14, 14));
        return;
      }

      const fill = resolveNodeFillColor(node);
      const stroke = resolveNodeStrokeColor(node);
      ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity));

      const drawPrimitive = () => {
        if (node.type === 'circle') {
          const radius = Math.abs(node.width / 2);
          ctx.beginPath();
          ctx.arc(globalX + radius, globalY + radius, radius, 0, Math.PI * 2);
          return;
        }

        if (node.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(globalX + node.width / 2, globalY + node.height / 2, Math.abs(node.width / 2), Math.abs(node.height / 2), 0, 0, Math.PI * 2);
          return;
        }

        if (node.type === 'path' && node.data) {
          const path = new Path2D(node.data);
          ctx.save();
          ctx.translate(globalX, globalY);
          if (fill) {
            ctx.fillStyle = fill;
            ctx.fill(path);
          }
          if (stroke && node.strokeWidth > 0) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = Math.max(0.5, node.strokeWidth);
            ctx.stroke(path);
          }
          ctx.restore();
          return;
        }

        ctx.beginPath();
        ctx.rect(globalX, globalY, node.width, node.height);
      };

      drawPrimitive();

      if (fill && node.type !== 'path') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke && node.strokeWidth > 0 && node.type !== 'path') {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(0.5, node.strokeWidth);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  return getStats(start, input, Math.max(1, input.sceneNodes?.length || input.dirtyRegions.length));
};

export interface CanvasKitAdapterOptions {
  cdnBaseUrl?: string;
  kind?: RenderBackendKind;
}

export const createCanvasKitAdapter = (options: CanvasKitAdapterOptions = {}): RendererAdapter => {
  const cdnBaseUrl = options.cdnBaseUrl || DEFAULT_CANVASKIT_CDN;
  const kind = options.kind || 'skia';

  let fallbackContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  let surface: any = null;
  let canvasKit: any = null;

  return {
    kind,
    async initialize(canvas) {
      if ('getContext' in canvas) {
        fallbackContext = canvas.getContext('2d');
      }

      try {
        const localModule = await dynamicImport<Record<string, unknown>>('canvaskit-wasm');
        const init = (localModule.default || localModule.CanvasKitInit) as ((config?: { locateFile?: (file: string) => string }) => Promise<any>) | undefined;
        if (!init) throw new Error('CanvasKitInit not found');

        canvasKit = await init({ locateFile: (file: string) => `${cdnBaseUrl}/${file}` });
      } catch {
        try {
          const remoteModule = await dynamicImport<Record<string, unknown>>(`${cdnBaseUrl}/canvaskit.js`);
          const init = (remoteModule.default || remoteModule.CanvasKitInit) as ((config?: { locateFile?: (file: string) => string }) => Promise<any>) | undefined;
          if (!init) throw new Error('CanvasKitInit remote not found');
          canvasKit = await init({ locateFile: (file: string) => `${cdnBaseUrl}/${file}` });
        } catch {
          canvasKit = null;
          surface = null;
          return;
        }
      }

      surface =
        canvasKit?.MakeCanvasSurface?.(canvas as HTMLCanvasElement) ||
        canvasKit?.MakeSWCanvasSurface?.(canvas as HTMLCanvasElement) ||
        canvasKit?.MakeSurface?.(canvas as HTMLCanvasElement) ||
        null;
    },
    async renderFrame(input) {
      const start = performance.now();

      if (!surface || !canvasKit) {
        return drawFallback2D(fallbackContext, input);
      }

      try {
        const camera = toCamera(input);
        const canvas = surface.getCanvas?.();
        if (!canvas) {
          return drawFallback2D(fallbackContext, input);
        }

        canvas.clear(canvasKit.TRANSPARENT || canvasKit.Color4f(0, 0, 0, 0));
        canvas.save();
        canvas.translate(camera.x, camera.y);
        canvas.scale(camera.zoom, camera.zoom);

        const sceneNodes = input.sceneNodes || [];
        const entriesById = new Map(sceneNodes.map((entry) => [entry.id, entry]));
        const runs = buildMaskRuns(sceneNodes.map((entry) => ({
          id: entry.id,
          isMask: entry.node.isMask,
          opacity: entry.node.opacity,
          blendMode: 'source-over' as GlobalCompositeOperation,
        })));

        let drawCalls = 0;
        runs.forEach((run) => {
          drawCalls += drawMaskRunWithSkia(canvasKit, canvas, run, entriesById);
        });

        canvas.restore();
        surface.flush?.();

        return getStats(start, input, Math.max(1, drawCalls));
      } catch {
        return drawFallback2D(fallbackContext, input);
      }
    },
    dispose() {
      surface?.dispose?.();
      surface?.delete?.();
      surface = null;
      canvasKit = null;
      fallbackContext = null;
    },
  };
};
