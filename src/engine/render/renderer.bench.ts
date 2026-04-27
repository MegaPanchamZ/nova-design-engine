import { afterAll, beforeAll, bench, describe } from 'vitest';

import type { RenderBackendKind, RendererFrameInput } from './types';

import { createDefaultNode, type SceneNode } from '../../types';
import { createRendererAdapter } from './renderer';

type RenderContextStub = {
  canvas: { width: number; height: number };
  clearRect: (x: number, y: number, width: number, height: number) => void;
  strokeRect: (x: number, y: number, width: number, height: number) => void;
  beginPath: () => void;
  arc: (x: number, y: number, radius: number, start: number, end: number) => void;
  ellipse: (x: number, y: number, radiusX: number, radiusY: number, rotation: number, start: number, end: number) => void;
  rect: (x: number, y: number, width: number, height: number) => void;
  save: () => void;
  restore: () => void;
  translate: (x: number, y: number) => void;
  fill: (path?: unknown) => void;
  stroke: (path?: unknown) => void;
  fillText: (text: string, x: number, y: number) => void;
  clip: (path?: unknown) => void;
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  globalAlpha: number;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
};

class MockPath2D {
  constructor(_value?: string) {}
}

class MockOffscreenCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(type: string): RenderContextStub | null {
    if (type !== '2d') return null;

    return {
      canvas: { width: this.width, height: this.height },
      clearRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      clip: () => {},
      setTransform: () => {},
      globalAlpha: 1,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '14px sans-serif',
    };
  }
}

const RENDER_BACKENDS: RenderBackendKind[] = ['react-konva', 'canvas', 'pixi-webgl', 'webgpu', 'skia', 'canvaskit'];

const makeSceneNode = (type: 'rect' | 'circle' | 'text', x: number, y: number): SceneNode => {
  const node = createDefaultNode(type, x, y);
  if (type === 'rect') {
    node.width = 120;
    node.height = 80;
    node.fill = '#22C55E';
  }
  if (type === 'circle') {
    node.width = 90;
    node.height = 90;
    node.fill = '#2563EB';
  }
  if (type === 'text') {
    node.width = 220;
    node.height = 48;
    node.text = 'Nova benchmark text';
    node.fill = '#111827';
  }
  return node;
};

const BENCH_NODES: SceneNode[] = [
  makeSceneNode('rect', 40, 60),
  makeSceneNode('circle', 260, 100),
  makeSceneNode('text', 120, 240),
  makeSceneNode('rect', 420, 180),
  makeSceneNode('circle', 540, 260),
  makeSceneNode('text', 640, 140),
];

const FRAME_INPUT: RendererFrameInput = {
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
  dirtyRegions: [
    { x: 0, y: 0, width: 640, height: 360 },
    { x: 640, y: 0, width: 640, height: 360 },
    { x: 0, y: 360, width: 640, height: 360 },
    { x: 640, y: 360, width: 640, height: 360 },
  ],
  nodeIds: BENCH_NODES.map((node) => node.id),
  sceneNodes: BENCH_NODES.map((node) => ({
    id: node.id,
    node,
    globalX: node.x,
    globalY: node.y,
  })),
  camera: { x: 0, y: 0, zoom: 1, pixelRatio: 1 },
  canvasSize: { width: 1280, height: 720 },
};

const originalOffscreenCanvas = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
const originalPath2D = (globalThis as { Path2D?: unknown }).Path2D;
const adapters = new Map<RenderBackendKind, ReturnType<typeof createRendererAdapter>>();

beforeAll(async () => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = MockOffscreenCanvas as unknown;
  (globalThis as { Path2D?: unknown }).Path2D = MockPath2D as unknown;

  await Promise.all(RENDER_BACKENDS.map(async (backend) => {
    const adapter = createRendererAdapter({ preferredBackend: backend });
    await adapter.initialize(new MockOffscreenCanvas(1280, 720) as unknown as OffscreenCanvas);
    adapters.set(backend, adapter);
  }));
});

afterAll(() => {
  adapters.forEach((adapter) => {
    adapter.dispose();
  });
  adapters.clear();

  if (typeof originalOffscreenCanvas === 'undefined') {
    delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  } else {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = originalOffscreenCanvas;
  }

  if (typeof originalPath2D === 'undefined') {
    delete (globalThis as { Path2D?: unknown }).Path2D;
  } else {
    (globalThis as { Path2D?: unknown }).Path2D = originalPath2D;
  }
});

describe('renderer backend comparison', () => {
  RENDER_BACKENDS.forEach((backend) => {
    bench(`${backend} renderFrame`, async () => {
      const adapter = adapters.get(backend);
      if (!adapter) throw new Error(`Missing adapter for ${backend}`);
      await adapter.renderFrame(FRAME_INPUT);
    });
  });
});