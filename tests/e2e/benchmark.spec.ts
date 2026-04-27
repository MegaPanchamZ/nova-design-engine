import { expect, test, type Page } from '@playwright/test';

type BackendOption = 'react-konva' | 'canvas' | 'skia' | 'canvaskit';

interface BenchMetrics {
  fps: number;
  avgFps: number;
  backend: BackendOption;
  nodeCount: number;
  samples: number;
  timestamp: number;
  scenePreset?: 'seed' | 'stress';
}

declare global {
  interface Window {
    __novaBench?: {
      loadStress?: (count?: number) => Promise<void>;
      setBackend?: (backend: BackendOption) => void;
      getMetrics?: () => BenchMetrics | null;
      runViewportSweep?: (steps?: number) => Promise<void>;
    };
    __novaBenchMetrics?: BenchMetrics;
  }
}

const BACKENDS: BackendOption[] = ['react-konva', 'canvas', 'skia', 'canvaskit'];
const AUTOMATED_STRESS_NODE_COUNT = 2500;
const VIEWPORT_SWEEP_STEPS = 4;

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

const waitForBackendMetrics = async (page: Page, backend: BackendOption, previousTimestamp: number) => {
  return page.waitForFunction(
    ([expectedBackend, minTimestamp, expectedNodeCount]) => {
      const metrics = window.__novaBench?.getMetrics?.() || window.__novaBenchMetrics || null;
      return Boolean(
        metrics &&
        metrics.backend === expectedBackend &&
        metrics.nodeCount >= expectedNodeCount &&
        metrics.timestamp > minTimestamp &&
        metrics.avgFps > 0 &&
        metrics.scenePreset === 'stress'
      );
    },
    [backend, previousTimestamp, AUTOMATED_STRESS_NODE_COUNT],
    { timeout: 10_000 }
  );
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
      canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      })),
    };
  });
};

test.describe('renderer e2e benchmark', () => {
  test('collects fps metrics across renderer backends with stress scene', async ({ page }) => {
    test.setTimeout(180_000);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const panel = page.getByTestId('benchmark-panel');
    try {
      await expect(panel).toBeVisible({ timeout: 60_000 });
    } catch {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      await test.info().attach('startup-console-errors.txt', {
        body: consoleErrors.join('\n') || 'No console errors captured.',
        contentType: 'text/plain',
      });
      await test.info().attach('startup-page-errors.txt', {
        body: pageErrors.join('\n') || 'No page errors captured.',
        contentType: 'text/plain',
      });
      await test.info().attach('startup-body.txt', {
        body: bodyText || 'No body text captured.',
        contentType: 'text/plain',
      });
      throw new Error('Benchmark panel did not render within 60s. Check attached startup diagnostics.');
    }

    await page.waitForFunction(() => Boolean(window.__novaBench?.loadStress));
    await page.evaluate(async () => {
      await window.__novaBench?.loadStress?.(2500);
    });
    await expect(page.getByTestId('benchmark-node-count')).toContainText('2,500');

    const canvas = page.locator('#canvas-container');
    await expect(canvas).toBeVisible();

    const initialCanvasHealth = await readCanvasHealth(page);
    expect(initialCanvasHealth.layout).not.toBeNull();
    expect(initialCanvasHealth.layout?.position).toBe('absolute');
    expect(initialCanvasHealth.layout?.overflow).toBe('hidden');

    const metricsByBackend: BenchMetrics[] = [];
    let previousTimestamp = 0;

    for (const backend of BACKENDS) {
      console.log(`Benchmarking backend: ${backend}`);
      await page.evaluate(async (selectedBackend) => {
        if (!window.__novaBench?.setBackend || !window.__novaBench?.runViewportSweep) {
          throw new Error('Missing __novaBench.runViewportSweep benchmark hook');
        }
        window.__novaBench.setBackend(selectedBackend);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await window.__novaBench.runViewportSweep(4);
      }, backend);

      await waitForBackendMetrics(page, backend, previousTimestamp);

      const metrics = await page.evaluate(() => {
        return window.__novaBench?.getMetrics?.() || window.__novaBenchMetrics || null;
      });

      expect(metrics).not.toBeNull();
      if (!metrics) continue;

      const canvasHealth = await readCanvasHealth(page);
      expect(canvasHealth.container).not.toBeNull();
      expect(canvasHealth.canvases.length).toBeGreaterThan(0);
      canvasHealth.canvases.forEach((entry) => {
        expect(entry.width).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.width || 0) + 2));
        expect(entry.height).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.height || 0) + 2));
        expect(entry.clientWidth).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.width || 0) + 2));
        expect(entry.clientHeight).toBeLessThanOrEqual(Math.ceil((canvasHealth.container?.height || 0) + 2));
      });

      metricsByBackend.push(metrics as BenchMetrics);
      expect(metrics.nodeCount).toBeGreaterThanOrEqual(AUTOMATED_STRESS_NODE_COUNT);
      expect(metrics.avgFps).toBeGreaterThan(0);
      previousTimestamp = metrics.timestamp;
    }

    const summary = metricsByBackend
      .map((entry) => `${entry.backend}: fps=${entry.fps.toFixed(2)} avg=${entry.avgFps.toFixed(2)} nodes=${entry.nodeCount}`)
      .join('\n');

    await test.info().attach('renderer-benchmark-summary.txt', {
      body: summary,
      contentType: 'text/plain',
    });

    await test.info().attach('renderer-benchmark-metrics.json', {
      body: JSON.stringify(metricsByBackend, null, 2),
      contentType: 'application/json',
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(metricsByBackend).toHaveLength(BACKENDS.length);
  });
});
