import { expect, test, type Page } from '@playwright/test';

type BackendOption = 'react-konva' | 'canvas' | 'skia' | 'canvaskit';

interface BenchBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface BenchNodeSnapshot {
  id: string;
  parentId: string | null;
  type: string;
  visible: boolean;
  bounds: BenchBounds;
}

interface BenchFontFace {
  family: string;
  weight: string;
  style: string;
  status: string;
}

interface BenchFontStatus {
  ready: boolean;
  check400: boolean;
  check600: boolean;
  check700: boolean;
  loadedFaces: BenchFontFace[];
}

interface BenchSceneSnapshot {
  currentPageId: string;
  selectedIds: string[];
  viewport: { x: number; y: number; zoom: number };
  bounds: BenchBounds | null;
  visibleNodeCount: number;
  nodes: BenchNodeSnapshot[];
}

interface CanvasHealthSnapshot {
  container: { width: number; height: number } | null;
  layout: { position: string; overflow: string; top: string; left: string } | null;
  canvases: Array<{
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  }>;
}

interface CanvasPixelSnapshot {
  nonTransparent: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __novaBench?: {
      loadSeed?: () => void;
      setBackend?: (backend: BackendOption) => void;
      setSelection?: (ids: string[]) => void;
      waitForFonts?: () => Promise<BenchFontStatus>;
      getFontStatus?: () => BenchFontStatus;
      getSceneSnapshot?: () => BenchSceneSnapshot;
    };
  }
}

const BACKENDS: BackendOption[] = ['react-konva', 'canvas', 'skia', 'canvaskit'];

const waitForBenchmarkHooks = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('benchmark-panel')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => Boolean(
    window.__novaBench?.loadSeed &&
    window.__novaBench?.setBackend &&
    window.__novaBench?.setSelection &&
    window.__novaBench?.waitForFonts &&
    window.__novaBench?.getSceneSnapshot
  ));
};

const waitForCanvas = async (page: Page) => {
  await page.waitForFunction(() => document.querySelectorAll('#canvas-container canvas').length > 0, undefined, { timeout: 15_000 });
};

const settleFrames = async (page: Page, frameCount = 4) => {
  await page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, frameCount);
};

const settleRenderer = async (page: Page, backend: BackendOption) => {
  await page.evaluate(async (selectedBackend) => {
    window.__novaBench?.setBackend?.(selectedBackend);
    window.__novaBench?.loadSeed?.();
    window.__novaBench?.setSelection?.([]);
  }, backend);
  await settleFrames(page, 6);
  await waitForCanvas(page);
};

const readCanvasHealth = async (page: Page): Promise<CanvasHealthSnapshot> => {
  return page.evaluate(() => {
    const container = document.getElementById('canvas-container');
    const layout = Array.from(document.querySelectorAll('#canvas-container > div'))
      .find((el) => el.className === 'absolute top-5 left-5 right-0 bottom-0 overflow-hidden');
    const containerRect = container?.getBoundingClientRect();
    const layoutStyle = layout ? getComputedStyle(layout) : null;

    return {
      container: containerRect
        ? { width: containerRect.width, height: containerRect.height }
        : null,
      layout: layoutStyle
        ? {
            position: layoutStyle.position,
            overflow: layoutStyle.overflow,
            top: layoutStyle.top,
            left: layoutStyle.left,
          }
        : null,
      canvases: Array.from(document.querySelectorAll('#canvas-container canvas')).map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      })),
    };
  });
};

const readCanvasPixels = async (page: Page): Promise<CanvasPixelSnapshot | null> => {
  return page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    for (let index = 3; index < imageData.length; index += 4) {
      if (imageData[index] > 0) {
        nonTransparent += 1;
        if (nonTransparent > 500) break;
      }
    }

    return {
      nonTransparent,
      width: canvas.width,
      height: canvas.height,
    };
  });
};

const expectClose = (actual: number, expected: number, tolerance = 1) => {
  expect(actual).toBeGreaterThanOrEqual(expected - tolerance);
  expect(actual).toBeLessThanOrEqual(expected + tolerance);
};

const normalizeSceneSnapshot = (snapshot: BenchSceneSnapshot) => {
  const nodeIndexById = new Map(snapshot.nodes.map((node, index) => [node.id, index]));

  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      type: node.type,
      visible: node.visible,
      bounds: node.bounds,
      parentIndex: node.parentId ? nodeIndexById.get(node.parentId) ?? null : null,
    })),
  };
};

test.describe('renderer consistency', () => {
  test('loads Inter font faces before renderer comparisons', async ({ page }) => {
    await waitForBenchmarkHooks(page);

    const fontStatus = await page.evaluate(async () => {
      return window.__novaBench?.waitForFonts?.() || null;
    });

    expect(fontStatus).not.toBeNull();
    if (!fontStatus) return;

    expect(fontStatus.ready).toBe(true);
    expect(fontStatus.check400).toBe(true);
    expect(fontStatus.check600).toBe(true);
    expect(fontStatus.check700).toBe(true);
    expect(fontStatus.loadedFaces.some((face) => face.family.includes('Inter') && face.weight === '400' && face.status === 'loaded')).toBe(true);
    expect(fontStatus.loadedFaces.some((face) => face.family.includes('Inter') && face.weight === '600' && face.status === 'loaded')).toBe(true);
    expect(fontStatus.loadedFaces.some((face) => face.family.includes('Inter') && face.weight === '700' && face.status === 'loaded')).toBe(true);
  });

  test('keeps scene geometry and canvas sizing stable when switching renderers', async ({ page }) => {
    test.setTimeout(120_000);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await waitForBenchmarkHooks(page);
    await page.evaluate(async () => {
      await window.__novaBench?.waitForFonts?.();
    });

    let baselineScene: BenchSceneSnapshot | null = null;
    let baselineCanvas: CanvasHealthSnapshot | null = null;

    for (const backend of BACKENDS) {
      await settleRenderer(page, backend);

      const sceneSnapshot = await page.evaluate(() => window.__novaBench?.getSceneSnapshot?.() || null);
      const canvasHealth = await readCanvasHealth(page);

      expect(sceneSnapshot).not.toBeNull();
      expect(canvasHealth.container).not.toBeNull();
      expect(canvasHealth.layout).not.toBeNull();
      expect(canvasHealth.layout?.position).toBe('absolute');
      expect(canvasHealth.layout?.overflow).toBe('hidden');
      expect(canvasHealth.canvases.length).toBeGreaterThan(0);

      canvasHealth.canvases.forEach((entry) => {
        expect(entry.width).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.width || 0) + 2));
        expect(entry.height).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.height || 0) + 2));
        expect(entry.clientWidth).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.width || 0) + 2));
        expect(entry.clientHeight).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.height || 0) + 2));
      });

      if (!sceneSnapshot) continue;

      expect(sceneSnapshot.selectedIds).toEqual([]);
      expect(sceneSnapshot.visibleNodeCount).toBe(5);
      expect(sceneSnapshot.bounds).not.toBeNull();
      expect(sceneSnapshot.nodes).toHaveLength(6);

      if (backend === 'canvas') {
        const canvasPixels = await readCanvasPixels(page);
        expect(canvasPixels).not.toBeNull();
        expect(canvasPixels?.width).toBeGreaterThan(0);
        expect(canvasPixels?.height).toBeGreaterThan(0);
        expect(canvasPixels?.nonTransparent).toBeGreaterThan(0);
      }

      if (!baselineScene || !baselineCanvas) {
        baselineScene = sceneSnapshot;
        baselineCanvas = canvasHealth;
        continue;
      }

      expect(normalizeSceneSnapshot(sceneSnapshot)).toEqual(normalizeSceneSnapshot(baselineScene));
      expectClose(canvasHealth.container?.width || 0, baselineCanvas.container?.width || 0, 1);
      expectClose(canvasHealth.container?.height || 0, baselineCanvas.container?.height || 0, 1);
      expect(canvasHealth.layout).toEqual(baselineCanvas.layout);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});