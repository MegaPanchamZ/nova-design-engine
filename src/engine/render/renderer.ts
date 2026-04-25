import type { SceneNode } from '../../types';
import { buildMaskRuns } from './maskStack';
import { createCanvasKitAdapter } from './canvasKitAdapter';
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

const drawNode2D = (ctx: Render2DContext, entry: NonNullable<RendererFrameInput['sceneNodes']>[number]): number => {
  const { node, globalX, globalY } = entry;
  if (!shouldRenderNode(node)) return 0;

  if (node.type === 'text') {
    const fill = resolveNodeFillColor(node) || '#E5E7EB';
    ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity));
    ctx.fillStyle = fill;
    ctx.font = `${Math.max(1, node.fontSize || 14)}px ${node.fontFamily || 'sans-serif'}`;
    ctx.fillText(node.text || '', globalX, globalY + Math.max(node.fontSize || 14, 14));
    return 1;
  }

  const fill = resolveNodeFillColor(node);
  const stroke = resolveNodeStrokeColor(node);
  ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity));

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
    return fill && stroke && node.strokeWidth > 0 ? 2 : 1;
  }

  ctx.beginPath();
  if (node.type === 'circle') {
    const radius = Math.abs(node.width / 2);
    ctx.arc(globalX + radius, globalY + radius, radius, 0, Math.PI * 2);
  } else if (node.type === 'ellipse') {
    ctx.ellipse(globalX + node.width / 2, globalY + node.height / 2, Math.abs(node.width / 2), Math.abs(node.height / 2), 0, 0, Math.PI * 2);
  } else {
    ctx.rect(globalX, globalY, node.width, node.height);
  }

  let calls = 0;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
    calls += 1;
  }
  if (stroke && node.strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.5, node.strokeWidth);
    ctx.stroke();
    calls += 1;
  }

  return Math.max(1, calls);
};

const drawScene2D = (ctx: Render2DContext | null, input: RendererFrameInput): RenderStats => {
  const start = performance.now();

  if (!ctx) {
    return drawDirtyRegions2D(ctx, input);
  }

  const camera = input.camera || { x: 0, y: 0, zoom: 1, pixelRatio: 1 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

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
    if (!run.rootMask) {
      run.nodeIds.forEach((id) => {
        const entry = entriesById.get(id);
        if (!entry) return;
        drawCalls += drawNode2D(ctx, entry);
      });
      return;
    }

    const maskEntry = entriesById.get(run.rootMask.id);
    if (!maskEntry) return;

    const maskNode = maskEntry.node;
    ctx.save();
    ctx.beginPath();

    if (maskNode.type === 'path' && maskNode.data) {
      ctx.translate(maskEntry.globalX, maskEntry.globalY);
      const maskPath = new Path2D(maskNode.data);
      ctx.clip(maskPath);
      ctx.translate(-maskEntry.globalX, -maskEntry.globalY);
    } else if (maskNode.type === 'circle') {
      const radius = Math.abs(maskNode.width / 2);
      ctx.arc(maskEntry.globalX + radius, maskEntry.globalY + radius, radius, 0, Math.PI * 2);
      ctx.clip();
    } else if (maskNode.type === 'ellipse') {
      ctx.ellipse(maskEntry.globalX + maskNode.width / 2, maskEntry.globalY + maskNode.height / 2, Math.abs(maskNode.width / 2), Math.abs(maskNode.height / 2), 0, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.rect(maskEntry.globalX, maskEntry.globalY, maskNode.width, maskNode.height);
      ctx.clip();
    }

    run.nodeIds.forEach((id) => {
      const entry = entriesById.get(id);
      if (!entry) return;
      drawCalls += drawNode2D(ctx, entry);
    });
    ctx.restore();
  });

  ctx.restore();

  return {
    frameTimeMs: performance.now() - start,
    drawCalls: Math.max(1, drawCalls),
    visibleNodes: sceneNodes.length || input.nodeIds.length,
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
      if (kind === 'canvas' && input.sceneNodes) {
        return drawScene2D(context, input);
      }
      return drawDirtyRegions2D(context, input);
    },
    dispose() {
      context = null;
    },
  };
};

const createCanvasRenderer = (): RendererAdapter => {
  let context: Render2DContext | null = null;

  return {
    kind: 'canvas',
    async initialize(canvas) {
      context = createOffscreenContext(canvas) || (canvas as HTMLCanvasElement).getContext?.('2d') || null;
    },
    async renderFrame(input) {
      return drawScene2D(context, input);
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

export interface RendererCreationOptions {
  preferredBackend?: RenderBackendKind;
}

export const createRendererAdapter = (options: RendererCreationOptions = {}): RendererAdapter => {
  const preferred = options.preferredBackend || 'react-konva';

  if (preferred === 'skia' || preferred === 'canvaskit') {
    return createCanvasKitAdapter({ kind: preferred });
  }
  if (preferred === 'canvas') {
    return createCanvasRenderer();
  }
  if (preferred === 'pixi-webgl') {
    return createPixiRenderer();
  }
  if (preferred === 'webgpu') {
    return createFallbackRenderer('webgpu');
  }

  return createFallbackRenderer('react-konva');
};
