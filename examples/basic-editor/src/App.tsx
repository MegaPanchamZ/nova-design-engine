import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { createDefaultNode, type RenderBackendKind, type SceneNode, type TextNode } from 'nova-design-engine';
import { NovaEditorShell, Viewer, useStore } from 'nova-design-engine/react';

const STRESS_NODE_COUNT = 10_000;

const BACKENDS: Array<{ value: RenderBackendKind; label: string }> = [
  { value: 'react-konva', label: 'React Konva' },
  { value: 'canvas', label: 'Canvas 2D' },
  { value: 'skia', label: 'Skia' },
  { value: 'canvaskit', label: 'CanvasKit' },
];

type BenchMetrics = {
  fps: number;
  avgFps: number;
  backend: RenderBackendKind;
  nodeCount: number;
  samples: number;
  timestamp: number;
  scenePreset: 'seed' | 'stress';
};

type BenchBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type BenchNodeSnapshot = {
  id: string;
  parentId: string | null;
  type: SceneNode['type'];
  visible: boolean;
  bounds: BenchBounds;
};

type BenchFontFace = {
  family: string;
  weight: string;
  style: string;
  status: string;
};

type BenchFontStatus = {
  ready: boolean;
  check400: boolean;
  check600: boolean;
  check700: boolean;
  loadedFaces: BenchFontFace[];
};

type BenchSceneSnapshot = {
  currentPageId: string;
  selectedIds: string[];
  viewport: { x: number; y: number; zoom: number };
  bounds: BenchBounds | null;
  visibleNodeCount: number;
  nodes: BenchNodeSnapshot[];
};

declare global {
  interface Window {
    __novaBench?: {
      loadStress: (count?: number) => Promise<void>;
      loadSeed: () => void;
      setBackend: (backend: RenderBackendKind) => void;
      setSelection: (ids: string[]) => void;
      setPreview: (enabled: boolean) => void;
      runViewportSweep: (steps?: number) => Promise<void>;
      getMetrics: () => BenchMetrics | null;
      waitForFonts: () => Promise<BenchFontStatus>;
      getFontStatus: () => BenchFontStatus;
      getSceneSnapshot: () => BenchSceneSnapshot;
    };
    __novaBenchMetrics?: BenchMetrics;
  }
}

const collectFontFaces = (): BenchFontFace[] => {
  if (typeof document === 'undefined' || !('fonts' in document)) return [];

  const faces: BenchFontFace[] = [];
  document.fonts.forEach((fontFace) => {
    if (!fontFace.family.includes('Inter')) return;
    faces.push({
      family: fontFace.family,
      weight: fontFace.weight,
      style: fontFace.style,
      status: fontFace.status,
    });
  });
  return faces;
};

const readFontStatus = (): BenchFontStatus => {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return {
      ready: false,
      check400: false,
      check600: false,
      check700: false,
      loadedFaces: [],
    };
  }

  return {
    ready: document.fonts.status === 'loaded',
    check400: document.fonts.check('400 16px "Inter"', 'Nova Prototype'),
    check600: document.fonts.check('600 16px "Inter"', 'Nova Prototype'),
    check700: document.fonts.check('700 16px "Inter"', 'Nova Prototype'),
    loadedFaces: collectFontFaces(),
  };
};

const computeSceneBounds = (nodes: SceneNode[]): BenchBounds | null => {
  const visibleNodes = nodes.filter((node) => node.visible !== false);
  if (visibleNodes.length === 0) return null;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const getGlobalPosition = (node: SceneNode) => {
    let x = node.x;
    let y = node.y;
    let parentId = node.parentId;

    while (parentId) {
      const parent = nodesById.get(parentId);
      if (!parent) break;
      x += parent.x;
      y += parent.y;
      parentId = parent.parentId;
    }

    return { x, y };
  };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  visibleNodes.forEach((node) => {
    const global = getGlobalPosition(node);
    minX = Math.min(minX, global.x);
    minY = Math.min(minY, global.y);
    maxX = Math.max(maxX, global.x + node.width);
    maxY = Math.max(maxY, global.y + node.height);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const readSceneSnapshot = (): BenchSceneSnapshot => {
  const state = useStore.getState();
  const currentPage = state.pages.find((page) => page.id === state.currentPageId);
  const nodes = currentPage?.nodes || [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const getGlobalPosition = (node: SceneNode) => {
    let x = node.x;
    let y = node.y;
    let parentId = node.parentId;

    while (parentId) {
      const parent = nodesById.get(parentId);
      if (!parent) break;
      x += parent.x;
      y += parent.y;
      parentId = parent.parentId;
    }

    return { x, y };
  };
  const bounds = computeSceneBounds(nodes);

  return {
    currentPageId: state.currentPageId,
    selectedIds: [...state.selectedIds],
    viewport: { ...state.viewport },
    bounds,
    visibleNodeCount: nodes.filter((node) => node.visible !== false).length,
    nodes: nodes.map((node) => {
      const global = getGlobalPosition(node);
      return {
        id: node.id,
        parentId: node.parentId ?? null,
        type: node.type,
        visible: node.visible !== false,
        bounds: {
          minX: global.x,
          minY: global.y,
          maxX: global.x + node.width,
          maxY: global.y + node.height,
          width: node.width,
          height: node.height,
        },
      };
    }),
  };
};

const replaceCurrentPageNodes = (
  nodes: SceneNode[],
  historyLabel: string,
  selectedIds: string[],
  options?: { recordHistory?: boolean }
) => {
  const state = useStore.getState();
  const pages = state.pages.map((page) => (
    page.id === state.currentPageId
      ? { ...page, nodes }
      : page
  ));

  useStore.setState({ pages, selectedIds });
  if (options?.recordHistory !== false) {
    useStore.getState().pushHistory(historyLabel);
  }
};

const createSeedNodes = (): SceneNode[] => {
  const frame = createDefaultNode('frame', 120, 80);
  frame.name = 'Landing Card';
  frame.width = 520;
  frame.height = 360;
  frame.fill = '#0B1220';
  frame.fills = [{ id: 'frame-fill', type: 'solid', color: '#0B1220', opacity: 1, visible: true }];
  frame.cornerRadius = 28;

  const eyebrow = createDefaultNode('text', 36, 32) as TextNode;
  eyebrow.parentId = frame.id;
  eyebrow.text = 'Nova Prototype';
  eyebrow.fontSize = 18;
  eyebrow.fill = '#38BDF8';
  eyebrow.fills = [{ id: 'eyebrow-fill', type: 'solid', color: '#38BDF8', opacity: 1, visible: true }];

  const headline = createDefaultNode('text', 36, 74) as TextNode;
  headline.parentId = frame.id;
  headline.text = 'Design, iterate, and preview from one runtime.';
  headline.width = 360;
  headline.height = 120;
  headline.fontSize = 34;
  headline.lineHeight = 42;
  headline.fill = '#F8FAFC';
  headline.fills = [{ id: 'headline-fill', type: 'solid', color: '#F8FAFC', opacity: 1, visible: true }];

  const cta = createDefaultNode('rect', 36, 230);
  cta.parentId = frame.id;
  cta.name = 'CTA';
  cta.width = 180;
  cta.height = 52;
  cta.cornerRadius = 18;
  cta.fill = '#14B8A6';
  cta.fills = [{ id: 'cta-fill', type: 'solid', color: '#14B8A6', opacity: 1, visible: true }];
  cta.interactions = [
    {
      id: 'toggle-details',
      trigger: 'onClick',
      actions: [{ type: 'toggleVisibility', targetId: 'details-copy', value: true }],
    },
  ];

  const ctaLabel = createDefaultNode('text', 54, 244) as TextNode;
  ctaLabel.parentId = frame.id;
  ctaLabel.text = 'Toggle details';
  ctaLabel.fontSize = 18;
  ctaLabel.fill = '#042F2E';
  ctaLabel.fills = [{ id: 'cta-label-fill', type: 'solid', color: '#042F2E', opacity: 1, visible: true }];

  const details = createDefaultNode('text', 36, 300) as TextNode;
  details.id = 'details-copy';
  details.parentId = frame.id;
  details.text = 'Prototype mode executes node interactions. Click the CTA in Viewer to toggle this copy.';
  details.width = 420;
  details.height = 60;
  details.fontSize = 16;
  details.lineHeight = 24;
  details.fill = '#CBD5E1';
  details.fills = [{ id: 'details-fill', type: 'solid', color: '#CBD5E1', opacity: 1, visible: true }];
  details.visible = false;

  return [frame, eyebrow, headline, cta, ctaLabel, details];
};

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

const createStressNodes = (count: number): SceneNode[] => {
  const rand = seededRandom(20260426);
  const palette = ['#60A5FA', '#34D399', '#F59E0B', '#F472B6', '#A78BFA', '#38BDF8', '#F87171'];
  const textPalette = ['#E2E8F0', '#F8FAFC', '#BFDBFE', '#FDE68A'];

  const nodes: SceneNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const color = palette[index % palette.length];
    const x = Math.floor(rand() * 7800) - 120;
    const y = Math.floor(rand() * 5200) - 120;

    if (index % 6 === 0) {
      const text = createDefaultNode('text', x, y) as TextNode;
      text.text = `Stress ${index}`;
      text.fontSize = 11 + Math.floor(rand() * 14);
      text.width = 100 + Math.floor(rand() * 280);
      text.height = 24 + Math.floor(rand() * 60);
      text.fill = textPalette[index % textPalette.length];
      nodes.push(text);
      continue;
    }

    if (index % 5 === 0) {
      const circle = createDefaultNode('circle', x, y);
      const size = 22 + Math.floor(rand() * 210);
      circle.width = size;
      circle.height = size;
      circle.fill = color;
      circle.opacity = 0.45 + rand() * 0.45;
      nodes.push(circle);
      continue;
    }

    const rect = createDefaultNode('rect', x, y);
    rect.width = 20 + Math.floor(rand() * 260);
    rect.height = 16 + Math.floor(rand() * 220);
    rect.cornerRadius = Math.floor(rand() * 18);
    rect.fill = color;
    rect.opacity = 0.4 + rand() * 0.55;
    nodes.push(rect);
  }

  return nodes;
};

export default function App() {
  const [preview, setPreview] = useState(false);
  const [rendererBackend, setRendererBackend] = useState<RenderBackendKind>('react-konva');
  const [scenePreset, setScenePreset] = useState<'seed' | 'stress'>('seed');
  const [isGeneratingStress, setIsGeneratingStress] = useState(false);
  const [fps, setFps] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [nodeCount, setNodeCount] = useState(0);

  const backendLabel = useMemo(() => {
    return BACKENDS.find((backend) => backend.value === rendererBackend)?.label || rendererBackend;
  }, [rendererBackend]);

  const loadSeedDocument = useCallback((force: boolean) => {
    const state = useStore.getState();
    const currentPage = state.pages.find((page) => page.id === state.currentPageId);
    if (!currentPage) return;

    if (!force && currentPage.nodes.length > 0) {
      setNodeCount(currentPage.nodes.length);
      return;
    }

    const nodes = createSeedNodes();
    replaceCurrentPageNodes(nodes, 'seed', [nodes[0].id]);
    setScenePreset('seed');
    setNodeCount(nodes.length);
  }, []);

  const loadStressDocument = useCallback(async (count = STRESS_NODE_COUNT) => {
    setIsGeneratingStress(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const nodes = createStressNodes(count);
    replaceCurrentPageNodes(nodes, 'stress-seed', nodes[0] ? [nodes[0].id] : [], { recordHistory: false });
    setScenePreset('stress');
    setNodeCount(nodes.length);
    setIsGeneratingStress(false);
  }, []);

  const runViewportSweep = useCallback(async (steps = 18) => {
    const state = useStore.getState();
    const initialViewport = state.viewport;

    for (let step = 0; step < steps; step += 1) {
      const current = useStore.getState().viewport;
      const direction = step % 2 === 0 ? 1 : -1;
      const horizontalDelta = 5 + (step % 4);
      const verticalDelta = (step % 3) - 1;
      const zoomDelta = direction * 0.012;

      useStore.getState().setViewport({
        x: current.x + direction * horizontalDelta,
        y: current.y + verticalDelta * 3,
        zoom: Math.max(0.15, Math.min(4.5, current.zoom + zoomDelta)),
      });

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    useStore.getState().setViewport(initialViewport);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, []);

  useEffect(() => {
    loadSeedDocument(false);
  }, [loadSeedDocument]);

  useEffect(() => {
    let frames = 0;
    let lastSampleTime = performance.now();
    let rafId = 0;
    const samples: number[] = [];

    const step = (now: number) => {
      frames += 1;
      const elapsed = now - lastSampleTime;

      if (elapsed >= 500) {
        const currentFps = (frames * 1000) / elapsed;
        samples.push(currentFps);
        if (samples.length > 32) samples.shift();
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;

        setFps(Number(currentFps.toFixed(1)));
        setAvgFps(Number(average.toFixed(1)));

        window.__novaBenchMetrics = {
          fps: Number(currentFps.toFixed(3)),
          avgFps: Number(average.toFixed(3)),
          backend: rendererBackend,
          nodeCount,
          samples: samples.length,
          timestamp: Date.now(),
          scenePreset,
        };

        frames = 0;
        lastSampleTime = now;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [nodeCount, rendererBackend, scenePreset]);

  useEffect(() => {
    window.__novaBench = {
      loadStress: loadStressDocument,
      loadSeed: () => loadSeedDocument(true),
      setBackend: (backend) => setRendererBackend(backend),
      setSelection: (ids) => useStore.getState().setSelectedIds(ids),
      setPreview: (enabled) => setPreview(enabled),
      runViewportSweep,
      getMetrics: () => window.__novaBenchMetrics || null,
      waitForFonts: async () => {
        if (typeof document !== 'undefined' && 'fonts' in document) {
          await document.fonts.ready;
          await Promise.all([
            document.fonts.load('400 16px "Inter"', 'Nova Prototype'),
            document.fonts.load('600 16px "Inter"', 'Nova Prototype'),
            document.fonts.load('700 16px "Inter"', 'Nova Prototype'),
          ]);
        }
        return readFontStatus();
      },
      getFontStatus: () => readFontStatus(),
      getSceneSnapshot: () => readSceneSnapshot(),
    };

    return () => {
      delete window.__novaBench;
      delete window.__novaBenchMetrics;
    };
  }, [loadSeedDocument, loadStressDocument, runViewportSweep]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050816' }}>
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          display: 'grid',
          gap: 8,
          border: '1px solid #1f2937',
          borderRadius: 14,
          padding: 12,
          background: 'rgba(3, 7, 18, 0.94)',
          minWidth: 320,
          maxWidth: 'min(92vw, 520px)',
          boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)',
        }}
        data-testid="benchmark-panel"
      >
        <label style={{ display: 'grid', gap: 6, color: '#CBD5E1', fontSize: 12, fontWeight: 600 }}>
          Renderer backend
          <select
            data-testid="backend-select"
            value={rendererBackend}
            onChange={(event) => setRendererBackend(event.target.value as RenderBackendKind)}
            style={{
              border: '1px solid #334155',
              background: '#0F172A',
              color: '#E2E8F0',
              borderRadius: 8,
              padding: '8px 10px',
              fontWeight: 600,
            }}
          >
            {BACKENDS.map((backend) => (
              <option key={backend.value} value={backend.value}>{backend.label}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => loadSeedDocument(true)}
            style={{
              border: '1px solid #1f2937',
              background: scenePreset === 'seed' ? '#1D4ED8' : '#0F172A',
              color: '#E2E8F0',
              borderRadius: 999,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            data-testid="load-seed-button"
          >
            Load Demo
          </button>

          <button
            type="button"
            onClick={() => void loadStressDocument()}
            disabled={isGeneratingStress}
            style={{
              border: '1px solid #1f2937',
              background: scenePreset === 'stress' ? '#B45309' : '#111827',
              color: '#F8FAFC',
              borderRadius: 999,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: isGeneratingStress ? 'progress' : 'pointer',
              opacity: isGeneratingStress ? 0.75 : 1,
            }}
            data-testid="load-stress-button"
          >
            {isGeneratingStress ? 'Generating…' : `Load ${STRESS_NODE_COUNT.toLocaleString()} Stress`}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPreview((current) => !current)}
          style={{
            border: '1px solid #1f2937',
            background: preview ? '#14b8a6' : '#111827',
            color: preview ? '#042f2e' : '#e5e7eb',
            borderRadius: 999,
            padding: '10px 14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          data-testid="toggle-preview-button"
        >
          {preview ? 'Back to editor' : 'Open viewer'}
        </button>

        <div style={{ display: 'grid', gap: 4, color: '#CBD5E1', fontSize: 12 }}>
          <div data-testid="benchmark-backend">Backend: {backendLabel}</div>
          <div data-testid="benchmark-node-count">Nodes: {nodeCount.toLocaleString()}</div>
          <div data-testid="benchmark-fps">FPS: {fps.toFixed(1)} (avg {avgFps.toFixed(1)})</div>
        </div>
      </div>

      {preview ? (
        <Viewer
          accentColor="#14b8a6"
          canvasBackgroundColor="#050816"
          canvasRendererBackend={rendererBackend}
          style={{ minHeight: '100vh' }}
        />
      ) : (
        <NovaEditorShell
          showChat={false}
          accentColor="#14b8a6"
          canvasBackgroundColor="#050816"
          canvasRendererBackend={rendererBackend}
        />
      )}
    </div>
  );
}