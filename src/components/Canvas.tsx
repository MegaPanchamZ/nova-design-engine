import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { createDefaultNode, FrameNode, ImageNode, Interaction, PathNode, SceneNode, TextNode, ToolType } from '../types';
import {
  buildPathDataFromPenPoints,
  insertAnchorAtPoint,
  moveAnchorWithHandles,
  moveControlHandle,
  parsePathData,
  scalePathData,
  serializePathData,
  toggleAnchorCurve,
} from '../lib/pathTooling';
import type { PathAnchor } from '../lib/pathTooling';
import { scaleSceneNode } from '../lib/nodeTransforms';
import { isDrawingTool as isRegisteredDrawingTool, isSelectionTool, matchToolShortcut } from '../lib/toolRegistry';
import type { DrawingToolType } from '../lib/toolRegistry';
import { computeViewportForZoomBox, getSelectableHitStack, normalizeCanvasRect, resolveDirectSelectCycle } from '../lib/toolSemantics';
import type { DirectSelectCycleState } from '../lib/toolSemantics';
import { AutoLayoutDropPreview, findDeepestAutoLayoutContainerFromHits, getAutoLayoutDropPreview } from '../lib/autoLayoutDrop';
import { isPrototypeTargetNode, upsertPrototypeNavigation } from '../lib/prototypeNoodles';
import {
  createSpatialRuntimeState,
  findBoundsIdsInRect,
  findSmallestContainingNodeId,
  snapNodeToSpatialCandidates,
  snapNodeToSpatial,
} from '../lib/spatialRuntime';
import { SpatialWorkerRuntime } from '../lib/spatialWorkerRuntime';
import { createRendererAdapter } from '../engine/render/renderer';
import { buildVisibleTiles } from '../engine/render/tiling';
import type { RenderBackendKind, RendererFrameInput } from '../engine/render/types';
import { createRichTextDocument, toPlainText } from '../engine/text/richText';
import { computeTextLayout } from '../engine/text/textLayout';
import { FigmaRulers } from './Rulers';
import { GuidesOverlay } from './overlays/GuidesOverlay';
import { TransformOverlay } from './overlays/TransformOverlay';

type PenPoint = { x: number; y: number; cp1?: { x: number; y: number }; cp2?: { x: number; y: number } };

type CanvasSceneEvent = {
  target: any;
  evt: any;
  type: string;
  cancelBubble?: boolean;
};

type StageHandle = {
  getPointerPosition: () => { x: number; y: number } | null;
  container: () => HTMLDivElement;
  findOne: (selector: string) => any;
  scaleX: () => number;
  x: () => number;
  y: () => number;
};

type TransformerHandle = {
  nodes: (nodes: any[]) => void;
  getLayer: () => { batchDraw: () => void } | null;
};

interface ContextMenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface PathAnchorSelection {
  nodeId: string;
  index: number;
}

interface PrototypeConnectionDraft {
  sourceId: string;
  pointer: { x: number; y: number };
  targetId: string | null;
}

const isFrameLikeNode = (node: SceneNode): node is FrameNode =>
  node.type === 'frame' ||
  node.type === 'section' ||
  node.type === 'group' ||
  node.type === 'component' ||
  node.type === 'instance';

const LazyKonvaSceneTree = React.lazy(() => import('./renderers/KonvaSceneTree'));

export interface CanvasProps {
  rendererBackend?: RenderBackendKind;
  enableSpatialRuntime?: boolean;
  spatialRuntimeMode?: 'main-thread' | 'worker';
}

export const Canvas = ({
  rendererBackend = 'react-konva',
  enableSpatialRuntime = true,
  spatialRuntimeMode = 'main-thread',
}: CanvasProps) => {
  const { 
    pages, currentPageId, selectedIds, viewport, tool, setTool, setViewport, 
    addNode, updateNode, setSelectedIds, pushHistory, mode, hoveredId, guides: persistentGuides, snapLines, setSnapLines,
    deleteNodes, groupSelected, frameSelected, copySelected, pasteCopied, canPaste, updateGuide, removeGuide, variables, moveNodeHierarchy,
    undo, redo
  } = useStore();
  
  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const spatialRuntime = useMemo(() => createSpatialRuntimeState(nodes), [nodes]);
  
  const stageRef = useRef<StageHandle | null>(null);
  const pureCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<TransformerHandle | null>(null);
  const rendererAdapterRef = useRef<ReturnType<typeof createRendererAdapter> | null>(null);
  const rendererFrameInputRef = useRef<RendererFrameInput | null>(null);
  const spatialWorkerRuntimeRef = useRef<SpatialWorkerRuntime | null>(null);
  const prototypeHitRequestRef = useRef(0);
  const hoverHitRequestRef = useRef(0);
  const dragSpatialRequestRef = useRef(0);
  const directSelectHitRequestRef = useRef(0);
  const hoveredNodeRef = useRef<string | null>(null);
  const purePointerRef = useRef({ x: 0, y: 0, localX: 0, localY: 0, clientX: 0, clientY: 0 });
  const directSelectCycleRef = useRef<DirectSelectCycleState | null>(null);
  const viewportAnimationRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [isDrawing, setIsDrawing] = useState(false);
  const [newNode, setNewNode] = useState<SceneNode | null>(null);
  
  // Selection Marquee
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  
  // Text Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingHeight, setEditingHeight] = useState<number | null>(null);

  // Pen Tool
  const [penPoints, setPenPoints] = useState<PenPoint[]>([]);
  const [isPenDragging, setIsPenDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHandActive, setSpaceHandActive] = useState(false);
  const [zoomRect, setZoomRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [directSelectHoverIds, setDirectSelectHoverIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedPathAnchor, setSelectedPathAnchor] = useState<PathAnchorSelection | null>(null);
  const [selectedPathAnchors, setSelectedPathAnchors] = useState<PathAnchorSelection[]>([]);
  const [autoLayoutDropPreview, setAutoLayoutDropPreview] = useState<AutoLayoutDropPreview | null>(null);
  const [prototypeConnectionDraft, setPrototypeConnectionDraft] = useState<PrototypeConnectionDraft | null>(null);

  const resolvedSpatialRuntimeMode = enableSpatialRuntime ? spatialRuntimeMode : 'main-thread';
  const useWorkerSpatialRuntime = enableSpatialRuntime && resolvedSpatialRuntimeMode === 'worker';
  const isPureRendererMode = rendererBackend === 'canvas' || rendererBackend === 'skia' || rendererBackend === 'canvaskit';

  const renderSceneNodes = useMemo(() => {
    return nodes.map((node) => {
      const global = spatialRuntime.positionsById.get(node.id) || { x: node.x, y: node.y };
      return {
        id: node.id,
        node,
        globalX: global.x,
        globalY: global.y,
      };
    });
  }, [nodes, spatialRuntime.positionsById]);

  const rendererFrameInput = useMemo<RendererFrameInput>(() => {
    const viewportBounds = {
      x: (-viewport.x) / viewport.zoom,
      y: (-viewport.y) / viewport.zoom,
      width: dimensions.width / viewport.zoom,
      height: dimensions.height / viewport.zoom,
    };
    const tiles = buildVisibleTiles(viewportBounds, { tileSize: 1024, overscanTiles: 1 });

    return {
      viewport: viewportBounds,
      dirtyRegions: tiles.map((tile) => tile.bounds),
      nodeIds: nodes.map((node) => node.id),
      sceneNodes: renderSceneNodes,
      camera: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      },
      canvasSize: {
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  }, [dimensions.height, dimensions.width, nodes, renderSceneNodes, viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    hoveredNodeRef.current = hoveredId;
  }, [hoveredId]);

  // Redlines
  const [altHeld, setAltHeld] = useState(false);
  const canvasCursor = isPanning
    ? 'grabbing'
    : (tool === 'hand' || spaceHandActive)
      ? 'grab'
      : tool === 'zoom'
        ? (altHeld ? 'zoom-out' : 'zoom-in')
        : (isRegisteredDrawingTool(tool) || tool === 'pen')
          ? 'crosshair'
          : 'default';

  useEffect(() => {
    window.canvasStage = (stageRef.current as any) || undefined;
  }, [isPureRendererMode]);

  useEffect(() => {
    const adapter = createRendererAdapter({ preferredBackend: rendererBackend });
    rendererAdapterRef.current = adapter;

    let cancelled = false;
    let initializeFrame: number | null = null;

    const tryInitialize = () => {
      if (cancelled) return;

      const stage = stageRef.current;
      const stageCanvas = stage?.container()?.querySelector('canvas') as HTMLCanvasElement | null;
      const canvas = isPureRendererMode ? pureCanvasRef.current : stageCanvas;

      if (!canvas) {
        initializeFrame = requestAnimationFrame(tryInitialize);
        return;
      }

      void adapter.initialize(canvas);
    };

    tryInitialize();

    return () => {
      cancelled = true;
      if (initializeFrame !== null) cancelAnimationFrame(initializeFrame);
      adapter.dispose();
      if (rendererAdapterRef.current === adapter) {
        rendererAdapterRef.current = null;
      }
    };
  }, [isPureRendererMode, rendererBackend]);

  useEffect(() => {
    rendererFrameInputRef.current = rendererFrameInput;
  }, [rendererFrameInput]);

  useEffect(() => {
    if (!isPureRendererMode) return;

    let rafId: number | null = null;
    let active = true;

    const renderLoop = () => {
      if (!active) return;
      const adapter = rendererAdapterRef.current;
      const input = rendererFrameInputRef.current;
      if (adapter && input) {
        void adapter.renderFrame(input);
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPureRendererMode]);

  useEffect(() => {
    if (isPureRendererMode) return;

    const adapter = rendererAdapterRef.current;
    if (!adapter) return;

    void adapter.renderFrame(rendererFrameInput);
  }, [isPureRendererMode, rendererFrameInput]);

  useEffect(() => {
    if (!useWorkerSpatialRuntime) {
      spatialWorkerRuntimeRef.current?.dispose();
      spatialWorkerRuntimeRef.current = null;
      return;
    }

    const runtime = new SpatialWorkerRuntime();
    spatialWorkerRuntimeRef.current = runtime;

    void runtime.initialize().then((ready) => {
      if (!ready) return;
      runtime.load(spatialRuntime.bounds);
    });

    return () => {
      runtime.dispose();
      if (spatialWorkerRuntimeRef.current === runtime) {
        spatialWorkerRuntimeRef.current = null;
      }
    };
  }, [spatialRuntime.bounds, useWorkerSpatialRuntime]);

  useEffect(() => {
    if (!useWorkerSpatialRuntime) return;
    spatialWorkerRuntimeRef.current?.load(spatialRuntime.bounds);
  }, [spatialRuntime.bounds, useWorkerSpatialRuntime]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.container().style.cursor = canvasCursor;
  }, [canvasCursor]);

  useEffect(() => {
    return () => {
      if (viewportAnimationRef.current !== null) {
        cancelAnimationFrame(viewportAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tool !== 'direct-select') {
      directSelectCycleRef.current = null;
      setDirectSelectHoverIds([]);
      setSelectedPathAnchor(null);
      setSelectedPathAnchors([]);
    }
  }, [tool]);

  const setPathAnchorSelection = (anchors: PathAnchorSelection[]) => {
    setSelectedPathAnchors(anchors);
    setSelectedPathAnchor(anchors[0] || null);
  };

  const clearPathAnchorSelection = () => {
    setPathAnchorSelection([]);
  };

  const isPathAnchorSelected = (nodeId: string, index: number) => {
    return selectedPathAnchors.some((anchor) => anchor.nodeId === nodeId && anchor.index === index);
  };

  useEffect(() => {
    if (mode === 'prototype') {
      setAutoLayoutDropPreview(null);
    } else {
      setPrototypeConnectionDraft(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isTypingFieldFocused = () => {
    const active = document.activeElement as HTMLElement | null;
    const activeTag = active?.tagName?.toLowerCase();
    return !!active && (active.isContentEditable || activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');
  };

  const zoomAtPointer = (pointer: { x: number; y: number }, zoomIn: boolean) => {
    const scaleBy = 1.15;
    const oldScale = viewport.zoom;
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    let newScale = zoomIn ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.min(Math.max(newScale, 0.05), 20);

    setViewport({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isUndoModifier = (e.metaKey || e.ctrlKey) && !e.altKey;
        const normalizedKey = e.key.toLowerCase();

        if (!isTypingFieldFocused() && isUndoModifier && normalizedKey === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }

        if (!isTypingFieldFocused() && isUndoModifier && normalizedKey === 'y') {
          e.preventDefault();
          redo();
          return;
        }

        if (e.key === 'Alt') setAltHeld(true);
        if (!isTypingFieldFocused() && e.code === 'Space') {
          e.preventDefault();
          setSpaceHandActive(true);
          return;
        }
        if (!isTypingFieldFocused()) {
          const shortcutTool = matchToolShortcut(e);
          if (shortcutTool) {
            e.preventDefault();
            if (shortcutTool !== 'pen' && penPoints.length > 0) setPenPoints([]);
            clearPathAnchorSelection();
            setTool(shortcutTool);
            return;
          }
        }

        if (e.key === '.' || e.key === 'Decimal') {
            zoomToFitSelected();
        }

      const arrowDeltaMap: Record<string, { x: number; y: number }> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const arrowDelta = arrowDeltaMap[e.key];
      if (arrowDelta && mode !== 'prototype' && !editingId && selectedIds.length > 0) {
        e.preventDefault();

        const step = e.shiftKey ? 10 : 1;
        const dx = arrowDelta.x * step;
        const dy = arrowDelta.y * step;
        const selectedSet = new Set(selectedIds);
        const topLevelSelection = nodes.filter((node) => {
          if (!selectedSet.has(node.id)) return false;
          let parentId = node.parentId;
          while (parentId) {
            if (selectedSet.has(parentId)) return false;
            parentId = nodes.find((entry) => entry.id === parentId)?.parentId;
          }
          return true;
        });

        if (topLevelSelection.length === 0) return;

        if (topLevelSelection.length === 1) {
          const target = topLevelSelection[0];
          const currentGlobal = getGlobalPosition(target.id);
          const parentGlobal = target.parentId ? getGlobalPosition(target.parentId) : { x: 0, y: 0 };
          const snapped = snapGlobalPosition(
            currentGlobal.x + dx,
            currentGlobal.y + dy,
            target.width,
            target.height,
            target.id,
            5 / viewport.zoom,
            [target.id]
          );

          updateNode(target.id, {
            x: clampCoord(snapped.x - parentGlobal.x, target.x),
            y: clampCoord(snapped.y - parentGlobal.y, target.y),
          });
          setSnapLines(snapped.guides);
          setTimeout(() => setSnapLines([]), 90);
        } else {
          topLevelSelection.forEach((target) => {
            updateNode(target.id, {
              x: clampCoord(target.x + dx, target.x),
              y: clampCoord(target.y + dy, target.y),
            });
          });
          setSnapLines([]);
        }

        pushHistory('nudge');
        return;
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        clearPathAnchorSelection();
        directSelectCycleRef.current = null;
        setPrototypeConnectionDraft(null);
        if (penPoints.length > 0) {
          setPenPoints([]);
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedPathAnchors.length > 0 || selectedPathAnchor)) {
        e.preventDefault();
        const anchorsToDelete = selectedPathAnchors.length > 0
          ? selectedPathAnchors
          : selectedPathAnchor
            ? [selectedPathAnchor]
            : [];
        const groupedByNode = new Map<string, number[]>();

        anchorsToDelete.forEach((anchor) => {
          const nextIndices = groupedByNode.get(anchor.nodeId) || [];
          nextIndices.push(anchor.index);
          groupedByNode.set(anchor.nodeId, nextIndices);
        });

        groupedByNode.forEach((indices, nodeId) => {
          const node = nodes.find((entry) => entry.id === nodeId);
          if (!node || node.type !== 'path') return;

          const parsed = parsePathData(node.data);
          const anchors = [...parsed.anchors];
          const uniqueDescending = Array.from(new Set(indices)).sort((left, right) => right - left);
          if (anchors.length - uniqueDescending.length < 2) return;

          uniqueDescending.forEach((index) => {
            if (index >= 0 && index < anchors.length) anchors.splice(index, 1);
          });

          const shouldClose = parsed.closed && anchors.length >= 3;
          updateNode(node.id, { data: serializePathData(anchors, shouldClose) });
        });

        pushHistory('path-edit');
        clearPathAnchorSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && mode !== 'prototype' && !editingId && selectedIds.length > 0) {
        if (!isTypingFieldFocused()) {
          e.preventDefault();
          deleteNodes(selectedIds);
          setSelectedIds([]);
          clearPathAnchorSelection();
          pushHistory('delete');
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setAltHeld(false);
      if (e.code === 'Space') setSpaceHandActive(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [clearPathAnchorSelection, deleteNodes, editingId, mode, nodes, penPoints.length, pushHistory, redo, selectedIds, selectedPathAnchor, selectedPathAnchors, setSnapLines, setTool, undo, updateNode, viewport.zoom]);

  // Tool Tool Handlers

  const clampCoord = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(-1_000_000, Math.min(1_000_000, value));
  };

  const clampSize = (value: number, fallback = 1) => {
    if (!Number.isFinite(value)) return Math.max(1, fallback);
    return Math.max(1, Math.min(1_000_000, Math.abs(value)));
  };

  const insertPathAnchorAtPointer = (nodeId: string) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type !== 'path') return;

    const parsed = parsePathData(node.data);
    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const localPoint = { x: pointer.x - globalPos.x, y: pointer.y - globalPos.y };

    const result = insertAnchorAtPoint(parsed, localPoint);
    if (!result) return;

    updateNode(nodeId, { data: serializePathData(result.anchors, parsed.closed) });
    setPathAnchorSelection([{ nodeId, index: result.insertionIndex }]);
    pushHistory('path-edit');
  };

  const zoomToFitSelected = () => {
    if (selectedIds.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedIds.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        const pos = getGlobalPosition(id);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + node.width);
        maxY = Math.max(maxY, pos.y + node.height);
      }
    });

    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 100;

    const container = document.getElementById('canvas-container');
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const zoom = Math.min((cw - padding * 2) / width, (ch - padding * 2) / height);
    const finalZoom = Math.max(0.05, Math.min(zoom, 8)); // Clamp zoom

    const newX = (cw / 2) - (minX + width / 2) * finalZoom;
    const newY = (ch / 2) - (minY + height / 2) * finalZoom;

    setViewport({ x: newX, y: newY, zoom: finalZoom });
  };

  const updatePathAnchors = (nodeId: string, updater: (anchors: PathAnchor[]) => void) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type === 'path') {
        const parsed = parsePathData(node.data);
        const anchors = [...parsed.anchors];
        updater(anchors);
        updateNode(nodeId, { data: serializePathData(anchors, parsed.closed) });
    }
  };

  const handlePointDragMove = (nodeId: string, index: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'path') return;

    const parsed = parsePathData(node.data);
    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const nextX = pointer.x - globalPos.x;
    const nextY = pointer.y - globalPos.y;

    const selectedAnchorsInNode = selectedPathAnchors.filter((anchor) => anchor.nodeId === nodeId);
    if (selectedAnchorsInNode.length > 1 && selectedAnchorsInNode.some((anchor) => anchor.index === index)) {
      const activeAnchor = parsed.anchors[index];
      if (!activeAnchor) return;

      const deltaX = nextX - activeAnchor.x;
      const deltaY = nextY - activeAnchor.y;
      updatePathAnchors(nodeId, (anchors) => {
        selectedAnchorsInNode.forEach((selection) => {
          const targetAnchor = anchors[selection.index];
          if (!targetAnchor) return;
          targetAnchor.x += deltaX;
          targetAnchor.y += deltaY;
          if (targetAnchor.cpIn) {
            targetAnchor.cpIn = { x: targetAnchor.cpIn.x + deltaX, y: targetAnchor.cpIn.y + deltaY };
          }
          if (targetAnchor.cpOut) {
            targetAnchor.cpOut = { x: targetAnchor.cpOut.x + deltaX, y: targetAnchor.cpOut.y + deltaY };
          }
        });
      });
      return;
    }

    updatePathAnchors(nodeId, (anchors) => {
      const next = moveAnchorWithHandles(anchors, index, { x: nextX, y: nextY });
      anchors.splice(0, anchors.length, ...next);
    });
  };

  const handleControlPointDragMove = (nodeId: string, index: number, kind: 'in' | 'out', event: CanvasSceneEvent) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'path') return;

    const pointer = getPointerPosition();
    const globalPos = getGlobalPosition(nodeId);
    const nextX = pointer.x - globalPos.x;
    const nextY = pointer.y - globalPos.y;
    const mirrorHandle = !event.evt.altKey;

    updatePathAnchors(nodeId, (anchors) => {
      const next = moveControlHandle(anchors, index, kind, { x: nextX, y: nextY }, mirrorHandle);
      anchors.splice(0, anchors.length, ...next);
    });
  };

  const togglePathAnchorMode = (nodeId: string, index: number) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type !== 'path') return;

    const parsed = parsePathData(node.data);
    const anchors = [...parsed.anchors];
    const toggled = toggleAnchorCurve(anchors, index);
    updateNode(nodeId, { data: serializePathData(toggled, parsed.closed) });
    setPathAnchorSelection([{ nodeId, index }]);
    pushHistory('path-edit');
  };

  const filterTopLevelSelection = (ids: string[]): string[] => {
    const selectedSet = new Set(ids);

    const hasSelectedAncestor = (nodeId: string): boolean => {
      let cursor = nodes.find((node) => node.id === nodeId)?.parentId;
      while (cursor) {
        if (selectedSet.has(cursor)) return true;
        cursor = nodes.find((node) => node.id === cursor)?.parentId;
      }
      return false;
    };

    return ids.filter((nodeId) => !hasSelectedAncestor(nodeId));
  };

  const collectDescendantIds = (rootId: string): string[] => {
    const children = nodes.filter((node) => node.parentId === rootId);
    return children.flatMap((child) => [child.id, ...collectDescendantIds(child.id)]);
  };

  const buildScalePatch = (originalNode: SceneNode, scaledNode: SceneNode, includePosition: boolean): Partial<SceneNode> => {
    const patch: Partial<SceneNode> & {
      data?: PathNode['data'];
      fontSize?: TextNode['fontSize'];
      lineHeight?: TextNode['lineHeight'];
      imageTransform?: ImageNode['imageTransform'];
      radiusX?: number;
      radiusY?: number;
    } = {
      width: scaledNode.width,
      height: scaledNode.height,
      strokeWidth: scaledNode.strokeWidth,
      cornerRadius: scaledNode.cornerRadius,
      individualCornerRadius: scaledNode.individualCornerRadius,
      effects: scaledNode.effects,
    };

    if (includePosition) {
      patch.x = scaledNode.x;
      patch.y = scaledNode.y;
    }

    if (scaledNode.type === 'path' && originalNode.type === 'path') {
      patch.data = scaledNode.data;
    }

    if (scaledNode.type === 'text' && originalNode.type === 'text') {
      patch.fontSize = scaledNode.fontSize;
      patch.lineHeight = scaledNode.lineHeight;
    }

    if (scaledNode.type === 'image' && originalNode.type === 'image') {
      patch.imageTransform = scaledNode.imageTransform;
    }

    if (scaledNode.type === 'ellipse' && originalNode.type === 'ellipse') {
      patch.radiusX = scaledNode.radiusX;
      patch.radiusY = scaledNode.radiusY;
    }

    return patch;
  };

  // Handle selection Transformer
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      if (isPureRendererMode) {
        transformerRef.current.nodes([]);
        return;
      }
      if (editingId || penPoints.length > 0) {
        transformerRef.current.nodes([]);
        return;
      }
      const selectedNodes = filterTopLevelSelection(selectedIds)
        .map(id => stageRef.current?.findOne('#' + id))
        .filter((node) => node !== undefined) as any[];
      
      transformerRef.current.nodes(selectedNodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [editingId, isPureRendererMode, nodes, selectedIds]);

  const updatePurePointer = (clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      purePointerRef.current = { ...purePointerRef.current, clientX, clientY };
      return purePointerRef.current;
    }

    const localX = clientX - containerRect.left;
    const localY = clientY - containerRect.top;
    const x = (localX - viewport.x) / viewport.zoom;
    const y = (localY - viewport.y) / viewport.zoom;
    purePointerRef.current = { x, y, localX, localY, clientX, clientY };
    return purePointerRef.current;
  };

  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage || isPureRendererMode) {
      return { x: purePointerRef.current.x, y: purePointerRef.current.y };
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    
    return {
      x: (pointer.x - viewport.x) / viewport.zoom,
      y: (pointer.y - viewport.y) / viewport.zoom,
    };
  };

  const getGlobalPosition = (nodeId: string): { x: number, y: number } => {
    return spatialRuntime.positionsById.get(nodeId) || { x: 0, y: 0 };
  };

  const getGlobalRect = (nodeId: string) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node) return null;
    const global = getGlobalPosition(nodeId);
    return { x: global.x, y: global.y, width: node.width, height: node.height };
  };

  const stopViewportAnimation = () => {
    if (viewportAnimationRef.current !== null) {
      cancelAnimationFrame(viewportAnimationRef.current);
      viewportAnimationRef.current = null;
    }
  };

  const animateViewportTo = (nextViewport: { x: number; y: number; zoom: number }, animation: 'instant' | 'slide-in' | 'dissolve' = 'slide-in') => {
    stopViewportAnimation();

    if (animation === 'instant') {
      setViewport(nextViewport);
      return;
    }

    const duration = animation === 'dissolve' ? 220 : 280;
    const start = performance.now();
    const initialViewport = { ...viewport };

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setViewport({
        x: initialViewport.x + (nextViewport.x - initialViewport.x) * eased,
        y: initialViewport.y + (nextViewport.y - initialViewport.y) * eased,
        zoom: initialViewport.zoom + (nextViewport.zoom - initialViewport.zoom) * eased,
      });

      if (progress < 1) {
        viewportAnimationRef.current = requestAnimationFrame(tick);
      } else {
        viewportAnimationRef.current = null;
      }
    };

    viewportAnimationRef.current = requestAnimationFrame(tick);
  };

  const focusPrototypeTarget = (targetId: string, animation: 'instant' | 'slide-in' | 'dissolve' = 'slide-in') => {
    const targetNode = nodes.find((entry) => entry.id === targetId);
    if (!targetNode || !isPrototypeTargetNode(targetNode)) return;

    const global = getGlobalPosition(targetNode.id);
    const padding = 96;
    const zoomX = (dimensions.width - padding * 2) / Math.max(1, targetNode.width);
    const zoomY = (dimensions.height - padding * 2) / Math.max(1, targetNode.height);
    const nextZoom = Math.max(0.2, Math.min(2.5, Math.min(zoomX, zoomY)));
    const nextViewport = {
      zoom: nextZoom,
      x: dimensions.width / 2 - (global.x + targetNode.width / 2) * nextZoom,
      y: dimensions.height / 2 - (global.y + targetNode.height / 2) * nextZoom,
    };

    animateViewportTo(nextViewport, animation);
  };

  const findPrototypeTargetAtPoint = (point: { x: number; y: number }, excludeId?: string): string | undefined => {
    return findSmallestContainingNodeId(
      spatialRuntime,
      point,
      (candidateId) => {
        const node = nodesById.get(candidateId);
        return !!node && isPrototypeTargetNode(node);
      },
      excludeId
    );
  };

  const findPrototypeTargetAtPointWorker = async (point: { x: number; y: number }, excludeId?: string): Promise<string | undefined> => {
    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) return findPrototypeTargetAtPoint(point, excludeId);

    const hits = await runtime.hitTest(point);
    const filtered = hits
      .filter((entry) => entry.id !== excludeId)
      .filter((entry) => {
        const node = nodesById.get(entry.id);
        return !!node && isPrototypeTargetNode(node);
      })
      .sort((left, right) => {
        const leftArea = Math.max(0, left.maxX - left.minX) * Math.max(0, left.maxY - left.minY);
        const rightArea = Math.max(0, right.maxX - right.minX) * Math.max(0, right.maxY - right.minY);
        return leftArea - rightArea;
      });

    return filtered[0]?.id;
  };

  const findBoundsIdsInRectWorker = async (rect: { x: number; y: number; width: number; height: number }): Promise<string[]> => {
    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) return findBoundsIdsInRect(spatialRuntime, rect);

    const hits = await runtime.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });

    return hits.map((entry) => entry.id);
  };

  const setHoveredNode = (nodeId: string | null) => {
    if (hoveredNodeRef.current === nodeId) return;

    hoveredNodeRef.current = nodeId;
    useStore.getState().setHoveredId(nodeId);

    if (!nodeId || mode !== 'prototype') return;
    const node = nodesById.get(nodeId);
    if (node) runNodeInteractions(node, 'onHover');
  };

  const sortBoundsByArea = (left: { minX: number; minY: number; maxX: number; maxY: number }, right: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const leftArea = Math.max(0, left.maxX - left.minX) * Math.max(0, left.maxY - left.minY);
    const rightArea = Math.max(0, right.maxX - right.minX) * Math.max(0, right.maxY - right.minY);
    if (leftArea === rightArea) return 0;
    return leftArea - rightArea;
  };

  const findSmallestNodeAtPointWorker = async (
    point: { x: number; y: number },
    excludeIds: string[] = [],
    predicate?: (candidateId: string) => boolean
  ): Promise<string | undefined> => {
    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) {
      const excluded = new Set(excludeIds);
      return findSmallestContainingNodeId(
        spatialRuntime,
        point,
        (candidateId) => {
          if (excluded.has(candidateId)) return false;
          const node = nodesById.get(candidateId);
          if (!node || node.visible === false) return false;
          return predicate ? predicate(candidateId) : true;
        }
      );
    }

    const excluded = new Set(excludeIds);
    const hits = await runtime.hitTest(point);
    const filtered = hits
      .filter((entry) => !excluded.has(entry.id))
      .filter((entry) => {
        const node = nodesById.get(entry.id);
        if (!node || node.visible === false) return false;
        return predicate ? predicate(entry.id) : true;
      })
      .sort(sortBoundsByArea);

    return filtered[0]?.id;
  };

  const getSelectableHitStackWorker = async (point: { x: number; y: number }): Promise<string[]> => {
    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) {
      return getSelectableHitStack(nodes, point).map((node) => node.id);
    }

    const hits = await runtime.hitTest(point);
    return hits
      .filter((entry) => {
        const node = nodesById.get(entry.id);
        return !!node && node.visible !== false && !node.locked;
      })
      .sort(sortBoundsByArea)
      .map((entry) => entry.id);
  };

  const findInnermostAutoLayoutFrameWorker = async (
    point: { x: number; y: number },
    excludeIds: string[] = []
  ): Promise<string | undefined> => {
    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) {
      return findInnermostAutoLayoutFrame(point.x, point.y, excludeIds);
    }

    const hits = await runtime.hitTest(point);
    return findDeepestAutoLayoutContainerFromHits(hits, nodesById, excludeIds);
  };

  const snapGlobalPositionWorker = async (
    globalX: number,
    globalY: number,
    width: number,
    height: number,
    nodeId: string,
    snapThreshold: number,
    excludedIds: string[] = []
  ): Promise<{ x: number; y: number; guides: { x?: number; y?: number }[] }> => {
    if (!enableSpatialRuntime) return { x: globalX, y: globalY, guides: [] };

    const runtime = spatialWorkerRuntimeRef.current;
    if (!runtime || !runtime.isReady()) {
      return snapGlobalPosition(globalX, globalY, width, height, nodeId, snapThreshold, excludedIds);
    }

    const excluded = new Set(excludedIds);
    excluded.add(nodeId);

    const queryPadding = snapThreshold + Math.max(width, height) * 0.5;
    const hits = await runtime.search({
      minX: globalX - queryPadding,
      minY: globalY - queryPadding,
      maxX: globalX + width + queryPadding,
      maxY: globalY + height + queryPadding,
    });

    const candidates = hits.filter((entry) => !excluded.has(entry.id));
    const snapped = snapNodeToSpatialCandidates({
      nodeId,
      globalX,
      globalY,
      width,
      height,
      snapThreshold,
      persistentGuides,
      candidates,
    });

    return { x: snapped.x, y: snapped.y, guides: snapped.snapLines };
  };

  const setAutoLayoutPreviewFromParent = (
    autoLayoutParentId: string | undefined,
    pointerCenter: { x: number; y: number },
    excludedIds: string[]
  ) => {
    if (!autoLayoutParentId) {
      setAutoLayoutDropPreview(null);
      return;
    }

    const autoLayoutParent = nodes.find((entry) => entry.id === autoLayoutParentId);
    if (!autoLayoutParent || !isFrameLikeNode(autoLayoutParent) || autoLayoutParent.layoutMode === 'none') {
      setAutoLayoutDropPreview(null);
      return;
    }

    const siblingCandidates = nodes.filter((entry) => entry.parentId === autoLayoutParentId && !excludedIds.includes(entry.id));
    setAutoLayoutDropPreview(getAutoLayoutDropPreview(autoLayoutParent, siblingCandidates, pointerCenter, getGlobalPosition));
  };

  const evaluateInteractionCondition = (condition: Interaction['condition']) => {
    if (!condition) return true;

    const variable = useStore.getState().variables.find((entry) => entry.id === condition.variableId);
    if (!variable) return false;

    const leftValue = variable.value;
    const rightValue = condition.value;

    switch (condition.operator) {
      case '==':
        return leftValue === rightValue;
      case '!=':
        return leftValue !== rightValue;
      case '>':
        return Number(leftValue) > Number(rightValue);
      case '<':
        return Number(leftValue) < Number(rightValue);
      case '>=':
        return Number(leftValue) >= Number(rightValue);
      case '<=':
        return Number(leftValue) <= Number(rightValue);
      default:
        return false;
    }
  };

  const runNodeInteractions = (node: SceneNode, trigger: 'onClick' | 'onHover' | 'onDrag') => {
    if (mode !== 'prototype') return;
    const interactions = (node.interactions || []).filter((interaction) => interaction.trigger === trigger);
    if (interactions.length === 0) return;

    interactions.forEach((interaction) => {
      if (!evaluateInteractionCondition(interaction.condition)) return;
      interaction.actions.forEach((action) => {
        if (action.type === 'navigate') {
          const targetId = typeof action.targetId === 'string'
            ? action.targetId
            : (typeof action.value === 'string' ? action.value : undefined);

          if (targetId && pages.some((page) => page.id === targetId)) {
            useStore.getState().setPage(targetId);
          } else if (targetId) {
            focusPrototypeTarget(targetId, action.animation || 'slide-in');
          }
          return;
        }

        if (action.type === 'setVariable') {
          if (typeof action.targetId === 'string') {
            useStore.getState().mutateVariable(action.targetId, action.value);
          }
          return;
        }

        if (action.type === 'toggleVisibility') {
          if (typeof action.targetId !== 'string') return;
          const targetNode = nodes.find((entry) => entry.id === action.targetId);
          if (!targetNode) return;
          updateNode(action.targetId, { visible: !targetNode.visible });
        }
      });
    });
  };

  const findInnermostFrame = (x: number, y: number, excludeIds: string[] = []): string | undefined => {
    const frames = nodes.filter(n => {
      if (!isFrameLikeNode(n) || excludeIds.includes(n.id)) return false;
      const globalPos = getGlobalPosition(n.id);
      return x >= globalPos.x && x <= globalPos.x + n.width &&
             y >= globalPos.y && y <= globalPos.y + n.height;
    });

    if (frames.length === 0) return undefined;
    // Smallest area usually means most nested frame
    return frames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0].id;
  };

  const findInnermostAutoLayoutFrame = (x: number, y: number, excludeIds: string[] = []): string | undefined => {
    const frames = nodes.filter((node) => {
      if (!isFrameLikeNode(node) || node.layoutMode === 'none' || excludeIds.includes(node.id)) return false;
      const globalPos = getGlobalPosition(node.id);
      return x >= globalPos.x && x <= globalPos.x + node.width && y >= globalPos.y && y <= globalPos.y + node.height;
    });

    if (frames.length === 0) return undefined;
    return frames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0].id;
  };

  const snapGlobalPosition = (
    globalX: number,
    globalY: number,
    width: number,
    height: number,
    nodeId: string,
    snapThreshold: number,
    excludedIds: string[] = []
  ): { x: number; y: number; guides: { x?: number; y?: number }[] } => {
    if (!enableSpatialRuntime) {
      return { x: globalX, y: globalY, guides: [] };
    }

    const snapped = snapNodeToSpatial({
      state: spatialRuntime,
      nodeId,
      globalX,
      globalY,
      width,
      height,
      snapThreshold,
      persistentGuides,
      excludedIds,
    });

    return { x: snapped.x, y: snapped.y, guides: snapped.snapLines };
  };

  const finalizePenPath = (closed: boolean = false) => {
    const built = buildPathDataFromPenPoints(penPoints, closed);
    if (!built) {
      setPenPoints([]);
      return;
    }

    const node = createDefaultNode('path', built.bounds.minX, built.bounds.minY) as PathNode;
    node.data = built.data;
    node.width = built.bounds.width;
    node.height = built.bounds.height;
    node.strokeWidth = 2;
    node.stroke = '#6366F1';
    addNode(node);
    setPenPoints([]);
    pushHistory();
  };

  const handleMouseDown = (e: CanvasSceneEvent) => {
    setContextMenu(null);

    if (e.evt.button === 2) {
      return;
    }

    // Middle Mouse Button (button 1) for panning
    if (e.evt.button === 1 || tool === 'hand' || spaceHandActive) {
      setIsPanning(true);
      const stage = stageRef.current;
      if (stage) {
        stage.container().style.cursor = 'grabbing';
      }
      return;
    }

    if (mode === 'prototype') {
      return;
    }

    // Stop editing if clicking elsewhere
    if (editingId) {
      const target = nodes.find((entry): entry is TextNode => entry.id === editingId && entry.type === 'text');
      if (target) {
        updateNode(editingId, buildTextEditPatch(target, editingText));
      }
      pushHistory();
      setEditingId(null);
    }

    const clickedOnStage = e.target === e.target.getStage();
    const isActiveDrawingTool = isRegisteredDrawingTool(tool);

    if (tool === 'zoom') {
      const { x, y } = getPointerPosition();
      setZoomRect({ x, y, width: 0, height: 0 });
      return;
    }

    // If text tool and clicked on existing text, edit it instead of creating new
    if (tool === 'text' && !clickedOnStage) {
        const id = e.target.id();
        const node = nodes.find(n => n.id === id);
        if (node?.type === 'text') {
            handleTextDblClick(node);
            return;
        }
    }
    if (clickedOnStage || isActiveDrawingTool || tool === 'pen' || isSelectionTool(tool)) {
      if (isActiveDrawingTool) {
        const { x, y } = getPointerPosition();
        const parentId = findInnermostFrame(x, y);
        let finalX = x;
        let finalY = y;
        
        if (parentId) {
            const parentPos = getGlobalPosition(parentId);
            finalX -= parentPos.x;
            finalY -= parentPos.y;
        }

        const node = createDefaultNode(tool as DrawingToolType, finalX, finalY);
        node.parentId = parentId;
        node.width = 0;
        node.height = 0;
        setNewNode(node);
        setIsDrawing(true);
        setSelectedIds([]);
        clearPathAnchorSelection();
        
        // Also start selection marquee in case they drag
        setSelectionRect({ x, y, width: 0, height: 0 });
      } else if (tool === 'pen') {
        const { x, y } = getPointerPosition();
        
        // If clicking near first point, close it
        if (penPoints.length > 2) {
            const first = penPoints[0];
            const dist = Math.sqrt(Math.pow(x - first.x, 2) + Math.pow(y - first.y, 2));
            if (dist < 10 / viewport.zoom) {
                finalizePenPath(true);
                return;
            }
        }
        
        setIsPenDragging(true);
        setPenPoints([...penPoints, { x, y, cp1: {x, y}, cp2: {x, y} }]);
      } else if (isSelectionTool(tool)) {
        const id = e.target.id();
        const clickedFrame = nodes.find(n => n.id === id && (n.type === 'frame' || n.type === 'section'));
        
        if (clickedOnStage) {
            const { x, y } = getPointerPosition();
            setSelectionRect({ x, y, width: 0, height: 0 });
            setSelectedIds([]);
          directSelectCycleRef.current = null;
          clearPathAnchorSelection();
        } else if (clickedFrame) {
            if (e.evt.shiftKey) setSelectedIds(Array.from(new Set([...selectedIds, clickedFrame.id])));
            else setSelectedIds([clickedFrame.id]);
          directSelectCycleRef.current = null;
          clearPathAnchorSelection();
        }
      }
      return;
    }
  };

  const handleMouseMove = (e: CanvasSceneEvent) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (prototypeConnectionDraft) {
      const pointer = getPointerPosition();
      if (useWorkerSpatialRuntime) {
        const sourceId = prototypeConnectionDraft.sourceId;
        const requestId = ++prototypeHitRequestRef.current;
        setPrototypeConnectionDraft((current) => {
          if (!current || current.sourceId !== sourceId) return current;
          return {
            ...current,
            pointer,
          };
        });

        void findPrototypeTargetAtPointWorker(pointer, sourceId).then((targetId) => {
          if (requestId !== prototypeHitRequestRef.current) return;
          setPrototypeConnectionDraft((current) => {
            if (!current || current.sourceId !== sourceId) return current;
            return {
              ...current,
              targetId: targetId || null,
            };
          });
        });
      } else {
        setPrototypeConnectionDraft({
          sourceId: prototypeConnectionDraft.sourceId,
          pointer,
          targetId: findPrototypeTargetAtPoint(pointer, prototypeConnectionDraft.sourceId) || null,
        });
      }
      return;
    }

    if (isPanning) {
        if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
        const dx = e.evt.movementX;
        const dy = e.evt.movementY;
        setViewport({
            ...viewport,
            x: viewport.x + dx,
            y: viewport.y + dy
        });
        return;
    }

    if (tool === 'pen' && isPenDragging) {
      if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
        const { x, y } = getPointerPosition();
        const newPoints = [...penPoints];
        const last = newPoints[newPoints.length - 1];
        // Mirror the control points around the anchor point
        const dx = x - last.x;
        const dy = y - last.y;
        last.cp1 = { x: last.x - dx, y: last.y - dy };
        last.cp2 = { x: last.x + dx, y: last.y + dy };
        setPenPoints(newPoints);
        return;
    }

    if (isDrawing && newNode) {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scale = stage.scaleX();
      const x = (pointer.x - stage.x()) / scale;
      const y = (pointer.y - stage.y()) / scale;

      let localX = x;
      let localY = y;

      if (newNode.parentId) {
          const parentPos = getGlobalPosition(newNode.parentId);
          localX -= parentPos.x;
          localY -= parentPos.y;
      }

        if (newNode.type === 'ellipse') {
          setNewNode({
            ...newNode,
            width: localX - newNode.x,
            height: localY - newNode.y
          });
      } else if (newNode.type === 'text') {
          const w = localX - newNode.x;
          const h = localY - newNode.y;
          setNewNode({
              ...newNode,
              width: w,
              height: h,
              fontSize: Math.max(12, Math.abs(Math.floor(h / 1.2))) // Heuristic: font size is ~80% of box height
          });
      } else {
          setNewNode({
            ...newNode,
            width: localX - newNode.x,
            height: localY - newNode.y
          });
      }
    } else if (selectionRect) {
      const { x, y } = getPointerPosition();
      setSelectionRect({
        ...selectionRect,
        width: x - selectionRect.x,
        height: y - selectionRect.y
      });
    } else if (zoomRect) {
      const { x, y } = getPointerPosition();
      setZoomRect({
        ...zoomRect,
        width: x - zoomRect.x,
        height: y - zoomRect.y,
      });
    } else if (tool === 'direct-select') {
      const point = getPointerPosition();
      if (useWorkerSpatialRuntime) {
        const requestId = ++directSelectHitRequestRef.current;
        void getSelectableHitStackWorker(point).then((hits) => {
          if (requestId !== directSelectHitRequestRef.current) return;
          setDirectSelectHoverIds((current) => {
            if (current.length === hits.length && current.every((id, index) => id === hits[index])) {
              return current;
            }
            return hits;
          });
        });
      } else {
        const hits = getSelectableHitStack(nodes, point).map((node) => node.id);
        setDirectSelectHoverIds((current) => {
          if (current.length === hits.length && current.every((id, index) => id === hits[index])) {
            return current;
          }
          return hits;
        });
      }
    } else {
      directSelectHitRequestRef.current += 1;
      if (directSelectHoverIds.length > 0) {
        setDirectSelectHoverIds([]);
      }
    }

    if (isDrawing || selectionRect || zoomRect) {
      return;
    }

    const hoverPoint = getPointerPosition();
    if (useWorkerSpatialRuntime) {
      const requestId = ++hoverHitRequestRef.current;
      void findSmallestNodeAtPointWorker(hoverPoint, [], (candidateId) => {
        const candidate = nodesById.get(candidateId);
        return !!candidate;
      }).then((hoveredNodeId) => {
        if (requestId !== hoverHitRequestRef.current) return;
        setHoveredNode(hoveredNodeId ?? null);
      });
    } else {
      const hoveredNodeId = findSmallestContainingNodeId(spatialRuntime, hoverPoint, (candidateId) => {
        const candidate = nodesById.get(candidateId);
        return !!candidate && candidate.visible !== false;
      });
      setHoveredNode(hoveredNodeId ?? null);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
        setIsPanning(false);
        const stage = stageRef.current;
        if (stage) {
        stage.container().style.cursor = canvasCursor;
        }
    }
    if (isPenDragging) {
        setIsPenDragging(false);
    }

    if (prototypeConnectionDraft) {
      const { sourceId, targetId } = prototypeConnectionDraft;
      if (targetId && targetId !== sourceId) {
        const sourceNode = nodes.find((entry) => entry.id === sourceId);
        if (sourceNode) {
          updateNode(sourceId, {
            interactions: upsertPrototypeNavigation(sourceNode.interactions, targetId, 'slide-in'),
          });
          setSelectedIds([sourceId]);
          pushHistory('prototype-link');
        }
      }
      setPrototypeConnectionDraft(null);
      return;
    }

    if (zoomRect) {
      const normalizedZoomRect = normalizeCanvasRect(zoomRect);
      const clickThreshold = 8 / viewport.zoom;
      const stage = stageRef.current;

      if (normalizedZoomRect.width < clickThreshold || normalizedZoomRect.height < clickThreshold) {
        const pointer = stage?.getPointerPosition();
        if (pointer) {
          zoomAtPointer(pointer, !altHeld);
        }
      } else {
        setViewport(computeViewportForZoomBox(normalizedZoomRect, dimensions, viewport));
      }

      setZoomRect(null);
      return;
    }

    if (isDrawing && newNode) {
      const isDrag = Math.abs(newNode.width) > 5 || Math.abs(newNode.height) > 5;
      
      if (isDrag || newNode.type === 'text' || newNode.type === 'image') {
        const finalNode = { ...newNode };
        if (finalNode.width < 0) { finalNode.x += finalNode.width; finalNode.width = Math.abs(finalNode.width); }
        if (finalNode.height < 0) { finalNode.y += finalNode.height; finalNode.height = Math.abs(finalNode.height); }
        
        if (finalNode.type === 'text' || finalNode.type === 'image') {
            if (isDrag) {
              finalNode.horizontalResizing = 'fixed';
              finalNode.verticalResizing = finalNode.type === 'text' ? 'hug' : 'fixed';
            } else {
              finalNode.width = 100; // Default min width for click
              finalNode.height = finalNode.type === 'image' ? 100 : 24;
              if (finalNode.type === 'text') finalNode.fontSize = 20; // Default for point text click
              finalNode.horizontalResizing = 'hug';
              finalNode.verticalResizing = 'hug';
            }
            if (finalNode.type === 'image') {
              finalNode.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60';
              finalNode.imageScaleMode = 'fill';
            }
        } else {
            finalNode.width = Math.max(finalNode.width, 20);
            finalNode.height = Math.max(finalNode.height, 20);
        }
        
        addNode(finalNode);
        pushHistory();
      }
      setIsDrawing(false);
      setNewNode(null);
      setSelectionRect(null);
    } else if (selectionRect) {
      // Perform marquee selection
      const box = {
        x: selectionRect.width < 0 ? selectionRect.x + selectionRect.width : selectionRect.x,
        y: selectionRect.height < 0 ? selectionRect.y + selectionRect.height : selectionRect.y,
        width: Math.abs(selectionRect.width),
        height: Math.abs(selectionRect.height)
      };

      if (tool === 'direct-select') {
        const boxRight = box.x + box.width;
        const boxBottom = box.y + box.height;
        const anchorHits: PathAnchorSelection[] = [];

        nodes.forEach((node) => {
          if (node.type !== 'path') return;
          const globalPos = getGlobalPosition(node.id);
          parsePathData(node.data).anchors.forEach((anchor, index) => {
            const anchorX = globalPos.x + anchor.x;
            const anchorY = globalPos.y + anchor.y;
            if (anchorX >= box.x && anchorX <= boxRight && anchorY >= box.y && anchorY <= boxBottom) {
              anchorHits.push({ nodeId: node.id, index });
            }
          });
        });

        if (anchorHits.length > 0) {
          setSelectedIds(Array.from(new Set(anchorHits.map((anchor) => anchor.nodeId))));
          setPathAnchorSelection(anchorHits);
          setSelectionRect(null);
          return;
        }
      }

      if (useWorkerSpatialRuntime) {
        setSelectionRect(null);
        void findBoundsIdsInRectWorker(box).then((hits) => {
          setSelectedIds(hits);
          clearPathAnchorSelection();
        });
        return;
      }

      const hits = enableSpatialRuntime
        ? findBoundsIdsInRect(spatialRuntime, box)
        : nodes.filter(node => {
          const globalPos = getGlobalPosition(node.id);
          const nodeX = globalPos.x;
          const nodeY = globalPos.y;
          const nodeRight = nodeX + node.width;
          const nodeBottom = nodeY + node.height;
          const boxRight = box.x + box.width;
          const boxBottom = box.y + box.height;

          return (
            nodeX < boxRight &&
            nodeRight > box.x &&
            nodeY < boxBottom &&
            nodeBottom > box.y
          );
        }).map(n => n.id);

      setSelectedIds(hits);
      clearPathAnchorSelection();
      setSelectionRect(null);
    }
  };

  const handleCanvasContextMenu = (e: CanvasSceneEvent) => {
    e.evt.preventDefault();
    const pointer = getPointerPosition();
    const targetId = e.target?.id?.();

    const isTargetSelected = targetId && selectedIds.includes(targetId);
    const hasMultiSelection = selectedIds.length > 1;

    if (targetId && nodes.some((node) => node.id === targetId) && !isTargetSelected && !hasMultiSelection) {
      setSelectedIds([targetId]);
    }

    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      canvasX: pointer.x,
      canvasY: pointer.y,
    });
  };

  const runContextAction = (action: 'copy' | 'paste' | 'duplicate' | 'group' | 'frame' | 'delete') => {
    if (action === 'copy') {
      copySelected();
      setContextMenu(null);
      return;
    }

    if (action === 'paste') {
      if (!contextMenu) return;
      pasteCopied(contextMenu.canvasX, contextMenu.canvasY);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'duplicate') {
      if (!contextMenu) return;
      copySelected();
      pasteCopied(contextMenu.canvasX + 24, contextMenu.canvasY + 24);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'group') {
      if (selectedIds.length < 2) return;
      groupSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'frame') {
      if (selectedIds.length === 0) return;
      frameSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'delete') {
      if (selectedIds.length === 0) return;
      deleteNodes(selectedIds);
      pushHistory();
      setContextMenu(null);
    }
  };

  const buildTextEditPatch = (node: TextNode, value: string): Partial<TextNode> => {
    const richText = createRichTextDocument(value);
    const maxWidth = (node.horizontalResizing === 'fixed' || node.horizontalResizing === 'fill')
      ? Math.max(1, node.width)
      : Math.max(160, node.width || 160);
    const lineHeightPx = node.lineHeight || node.fontSize * 1.2;

    const layout = computeTextLayout(richText, {
      maxWidth,
      fontSize: node.fontSize,
      lineHeight: lineHeightPx,
      fontFamily: node.fontFamily,
    });

    const nextHeight = (node.verticalResizing === 'hug' || node.verticalResizing === 'fill')
      ? Math.max(node.fontSize, layout.height)
      : node.height;

    return {
      text: value,
      richText,
      textLayoutMetrics: layout,
      height: nextHeight,
    };
  };

  const handleTextDblClick = (node: SceneNode) => {
    if (node.type === 'text') {
      setEditingId(node.id);
      setEditingText(node.richText ? toPlainText(node.richText) : node.text);
      setEditingHeight(node.height);
      setSelectedIds([]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditingText(newText);
    
    if (editingId) {
        const node = nodes.find(n => n.id === editingId);
        if (node && node.type === 'text') {
            const textNode = node as TextNode;
            const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill')
              ? Math.max(1, textNode.width)
              : Math.max(160, textNode.width || 160);
            const metrics = computeTextLayout(createRichTextDocument(newText), {
              maxWidth,
              fontSize: textNode.fontSize,
              lineHeight: textNode.lineHeight || textNode.fontSize * 1.2,
              fontFamily: textNode.fontFamily,
            });
            setEditingHeight(metrics.height);
        }
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const target = nodes.find((entry): entry is TextNode => entry.id === editingId && entry.type === 'text');
      if (target) {
        updateNode(editingId!, buildTextEditPatch(target, editingText));
      }
      pushHistory('text-edit');
      setEditingId(null);
      setEditingHeight(null);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditingHeight(null);
    }
  };

  const handleWheel = (e: CanvasSceneEvent) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = viewport.zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.min(Math.max(newScale, 0.05), 20); // Limit zoom

    setViewport({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handlePureCanvasWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const pointer = updatePurePointer(event.clientX, event.clientY);

    const scaleBy = 1.1;
    const oldScale = viewport.zoom;
    const nextScale = event.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const zoom = Math.min(Math.max(nextScale, 0.05), 20);

    setViewport({
      zoom,
      x: pointer.localX - pointer.x * zoom,
      y: pointer.localY - pointer.y * zoom,
    });
  };

  const findSelectableNodeAtPoint = async (point: { x: number; y: number }): Promise<string | undefined> => {
    if (useWorkerSpatialRuntime) {
      return findSmallestNodeAtPointWorker(point, [], (candidateId) => {
        const node = nodesById.get(candidateId);
        return !!node && node.visible !== false && !node.locked;
      });
    }

    return findSmallestContainingNodeId(spatialRuntime, point, (candidateId) => {
      const node = nodesById.get(candidateId);
      return !!node && node.visible !== false && !node.locked;
    });
  };

  const handlePureCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setContextMenu(null);
    const pointer = updatePurePointer(event.clientX, event.clientY);

    if (event.button === 2) return;

    if (event.button === 1 || tool === 'hand' || spaceHandActive) {
      setIsPanning(true);
      return;
    }

    if (mode === 'prototype') {
      return;
    }

    if (editingId) {
      const target = nodes.find((entry): entry is TextNode => entry.id === editingId && entry.type === 'text');
      if (target) {
        updateNode(editingId, buildTextEditPatch(target, editingText));
      }
      pushHistory();
      setEditingId(null);
    }

    const isActiveDrawingTool = isRegisteredDrawingTool(tool);

    if (tool === 'zoom') {
      setZoomRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
      return;
    }

    if (isActiveDrawingTool) {
      const parentId = findInnermostFrame(pointer.x, pointer.y);
      let finalX = pointer.x;
      let finalY = pointer.y;

      if (parentId) {
        const parentPos = getGlobalPosition(parentId);
        finalX -= parentPos.x;
        finalY -= parentPos.y;
      }

      const node = createDefaultNode(tool as DrawingToolType, finalX, finalY);
      node.parentId = parentId;
      node.width = 0;
      node.height = 0;
      setNewNode(node);
      setIsDrawing(true);
      setSelectedIds([]);
      clearPathAnchorSelection();
      setSelectionRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
      return;
    }

    if (tool === 'pen') {
      if (penPoints.length > 2) {
        const first = penPoints[0];
        const distance = Math.hypot(pointer.x - first.x, pointer.y - first.y);
        if (distance < 10 / viewport.zoom) {
          finalizePenPath(true);
          return;
        }
      }

      setIsPenDragging(true);
      setPenPoints([...penPoints, { x: pointer.x, y: pointer.y, cp1: { x: pointer.x, y: pointer.y }, cp2: { x: pointer.x, y: pointer.y } }]);
      return;
    }

    if (!isSelectionTool(tool)) return;

    void findSelectableNodeAtPoint(pointer).then((hitId) => {
      if (!hitId) {
        setSelectionRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
        if (!event.shiftKey) setSelectedIds([]);
        directSelectCycleRef.current = null;
        clearPathAnchorSelection();
        return;
      }

      if (event.shiftKey) {
        setSelectedIds(Array.from(new Set([...selectedIds, hitId])));
      } else {
        setSelectedIds([hitId]);
      }
      directSelectCycleRef.current = null;
      clearPathAnchorSelection();
    });
  };

  const handlePureCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = updatePurePointer(event.clientX, event.clientY);

    if (isPanning) {
      if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
      setViewport({
        ...viewport,
        x: viewport.x + event.movementX,
        y: viewport.y + event.movementY,
      });
      return;
    }

    if (tool === 'pen' && isPenDragging) {
      if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
      const newPoints = [...penPoints];
      const last = newPoints[newPoints.length - 1];
      const dx = pointer.x - last.x;
      const dy = pointer.y - last.y;
      last.cp1 = { x: last.x - dx, y: last.y - dy };
      last.cp2 = { x: last.x + dx, y: last.y + dy };
      setPenPoints(newPoints);
      return;
    }

    if (isDrawing && newNode) {
      let localX = pointer.x;
      let localY = pointer.y;

      if (newNode.parentId) {
        const parentPos = getGlobalPosition(newNode.parentId);
        localX -= parentPos.x;
        localY -= parentPos.y;
      }

      if (newNode.type === 'text') {
        const w = localX - newNode.x;
        const h = localY - newNode.y;
        setNewNode({
          ...newNode,
          width: w,
          height: h,
          fontSize: Math.max(12, Math.abs(Math.floor(h / 1.2))),
        });
      } else {
        setNewNode({
          ...newNode,
          width: localX - newNode.x,
          height: localY - newNode.y,
        });
      }
      return;
    }

    if (selectionRect) {
      setSelectionRect({
        ...selectionRect,
        width: pointer.x - selectionRect.x,
        height: pointer.y - selectionRect.y,
      });
      return;
    }

    if (zoomRect) {
      setZoomRect({
        ...zoomRect,
        width: pointer.x - zoomRect.x,
        height: pointer.y - zoomRect.y,
      });
      return;
    }

    if (tool === 'direct-select') {
      if (useWorkerSpatialRuntime) {
        const requestId = ++directSelectHitRequestRef.current;
        void getSelectableHitStackWorker(pointer).then((hits) => {
          if (requestId !== directSelectHitRequestRef.current) return;
          setDirectSelectHoverIds((current) => {
            if (current.length === hits.length && current.every((id, index) => id === hits[index])) return current;
            return hits;
          });
        });
      } else {
        const hits = getSelectableHitStack(nodes, pointer).map((node) => node.id);
        setDirectSelectHoverIds((current) => {
          if (current.length === hits.length && current.every((id, index) => id === hits[index])) return current;
          return hits;
        });
      }
    } else {
      directSelectHitRequestRef.current += 1;
      if (directSelectHoverIds.length > 0) setDirectSelectHoverIds([]);
    }

    const requestId = ++hoverHitRequestRef.current;
    void findSmallestNodeAtPointWorker(pointer, [], (candidateId) => {
      const node = nodesById.get(candidateId);
      return !!node && node.visible !== false;
    }).then((hoveredNodeId) => {
      if (requestId !== hoverHitRequestRef.current) return;
      setHoveredNode(hoveredNodeId ?? null);
    });
  };

  const handlePureCanvasPointerUp = () => {
    handleMouseUp();
  };

  const handlePureCanvasPointerLeave = () => {
    setDirectSelectHoverIds([]);
    setAutoLayoutDropPreview(null);
    setHoveredNode(null);
    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handlePureCanvasContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const pointer = updatePurePointer(event.clientX, event.clientY);
    void findSelectableNodeAtPoint(pointer).then((targetId) => {
      const isTargetSelected = targetId ? selectedIds.includes(targetId) : false;
      const hasMultiSelection = selectedIds.length > 1;

      if (targetId && nodes.some((node) => node.id === targetId) && !isTargetSelected && !hasMultiSelection) {
        setSelectedIds([targetId]);
      }

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        canvasX: pointer.x,
        canvasY: pointer.y,
      });
    });
  };

  const handleNodeDragStart = (e: CanvasSceneEvent) => {
    if (mode === 'prototype') return;
    const id = e.target.id();
    setAutoLayoutDropPreview(null);
    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  const handleNodeDragMove = (e: CanvasSceneEvent) => {
    if (mode === 'prototype') return;
    const node = e.target;
    const stage = stageRef.current;
    if (!stage) return;

    const nodeId = node.id();
    const draggedModel = nodes.find(n => n.id === nodeId);
    if (!draggedModel) return;
    const isCenterAnchored = draggedModel.type === 'circle' || draggedModel.type === 'ellipse';
    const currentWidth = clampSize(Math.abs(node.width() || draggedModel.width), Math.abs(draggedModel.width));
    const currentHeight = clampSize(Math.abs(node.height() || draggedModel.height), Math.abs(draggedModel.height));
    const anchorOffsetX = isCenterAnchored ? currentWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? currentHeight / 2 : 0;

    const parentGlobal = draggedModel.parentId ? getGlobalPosition(draggedModel.parentId) : { x: 0, y: 0 };

    const snapThreshold = 5 / viewport.zoom;
    
    const currentGlobalX = clampCoord(parentGlobal.x + node.x() - anchorOffsetX, draggedModel.x);
    const currentGlobalY = clampCoord(parentGlobal.y + node.y() - anchorOffsetY, draggedModel.y);
    const excludedIds = [nodeId, ...collectDescendantIds(nodeId)];

    if (useWorkerSpatialRuntime) {
      const requestId = ++dragSpatialRequestRef.current;
      void snapGlobalPositionWorker(currentGlobalX, currentGlobalY, currentWidth, currentHeight, nodeId, snapThreshold, excludedIds).then(async (snapped) => {
        if (requestId !== dragSpatialRequestRef.current) return;

        node.x(clampCoord(snapped.x - parentGlobal.x + anchorOffsetX, node.x()));
        node.y(clampCoord(snapped.y - parentGlobal.y + anchorOffsetY, node.y()));
        setSnapLines(snapped.guides);

        const pointerCenter = {
          x: snapped.x + currentWidth / 2,
          y: snapped.y + currentHeight / 2,
        };
        const autoLayoutParentId = await findInnermostAutoLayoutFrameWorker(pointerCenter, excludedIds);
        if (requestId !== dragSpatialRequestRef.current) return;

        setAutoLayoutPreviewFromParent(autoLayoutParentId, pointerCenter, excludedIds);
        node.getLayer()?.batchDraw();
      });
      return;
    }

    const snapped = snapGlobalPosition(currentGlobalX, currentGlobalY, currentWidth, currentHeight, nodeId, snapThreshold);

    node.x(clampCoord(snapped.x - parentGlobal.x + anchorOffsetX, node.x()));
    node.y(clampCoord(snapped.y - parentGlobal.y + anchorOffsetY, node.y()));
    setSnapLines(snapped.guides);

    const pointerCenter = {
      x: snapped.x + currentWidth / 2,
      y: snapped.y + currentHeight / 2,
    };
    const autoLayoutParentId = findInnermostAutoLayoutFrame(pointerCenter.x, pointerCenter.y, excludedIds);
    setAutoLayoutPreviewFromParent(autoLayoutParentId, pointerCenter, excludedIds);
  };

  const handleNodeUpdate = (e: CanvasSceneEvent) => {
    dragSpatialRequestRef.current += 1;
    const konvaNode = e.target;
    const nodeId = konvaNode.id();
    const nodeData = nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    if (mode === 'prototype' && e.type === 'dragend') {
      runNodeInteractions(nodeData, 'onDrag');
      const isCenterAnchored = nodeData.type === 'circle' || nodeData.type === 'ellipse';
      const resetX = isCenterAnchored ? nodeData.x + nodeData.width / 2 : nodeData.x;
      const resetY = isCenterAnchored ? nodeData.y + nodeData.height / 2 : nodeData.y;
      konvaNode.x(resetX);
      konvaNode.y(resetY);
      konvaNode.getLayer()?.batchDraw();
      setSnapLines([]);
      setAutoLayoutDropPreview(null);
      return;
    }

    const isTransformEvent = e.type === 'transformend' || e.type === 'transform';
    const activeAutoLayoutDropPreview = !isTransformEvent ? autoLayoutDropPreview : null;

    if (activeAutoLayoutDropPreview) {
      setAutoLayoutDropPreview(null);
      setSnapLines([]);
      moveNodeHierarchy(nodeId, activeAutoLayoutDropPreview.targetId, activeAutoLayoutDropPreview.position);
      pushHistory();
      return;
    }

    const newWidth = clampSize(Math.abs(konvaNode.width() * konvaNode.scaleX()), Math.abs(nodeData.width));
    const newHeight = clampSize(Math.abs(konvaNode.height() * konvaNode.scaleY()), Math.abs(nodeData.height));
  const scaleFactorX = newWidth / Math.max(1, Math.abs(nodeData.width));
  const scaleFactorY = newHeight / Math.max(1, Math.abs(nodeData.height));
    const isCenterAnchored = nodeData.type === 'circle' || nodeData.type === 'ellipse';
    const anchorOffsetX = isCenterAnchored ? newWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? newHeight / 2 : 0;

    // Get stage-relative position and convert to canvas-global
    const absolutePos = konvaNode.getAbsolutePosition();
    const globalX = clampCoord((absolutePos.x - viewport.x) / viewport.zoom - anchorOffsetX, nodeData.x);
    const globalY = clampCoord((absolutePos.y - viewport.y) / viewport.zoom - anchorOffsetY, nodeData.y);
    const snappedTransform = snapGlobalPosition(globalX, globalY, newWidth, newHeight, nodeId, 5 / viewport.zoom);

    // We want to reparent based on where the node is dropped
    // Exclude self and children to avoid circular dependency
    const getDescendants = (id: string): string[] => {
      const children = nodes.filter(n => n.parentId === id);
      return [id, ...children.flatMap(c => getDescendants(c.id))];
    };
    const excluded = getDescendants(nodeId);
    
    // Use center of node for reparenting detection
    const newParentId = isTransformEvent
      ? nodeData.parentId
      : findInnermostFrame(
        globalX + (konvaNode.width() * konvaNode.scaleX()) / 2,
        globalY + (konvaNode.height() * konvaNode.scaleY()) / 2,
        excluded
      );

    let finalX = snappedTransform.x;
    let finalY = snappedTransform.y;

    if (newParentId) {
        const parentPos = getGlobalPosition(newParentId);
        finalX = clampCoord(finalX - parentPos.x, finalX);
        finalY = clampCoord(finalY - parentPos.y, finalY);
    }

    const wasResized = Math.abs(newWidth - nodeData.width) > 0.1 || Math.abs(newHeight - nodeData.height) > 0.1;

    const nextRootPatch: Partial<SceneNode> & { data?: PathNode['data'] } = {
      x: clampCoord(finalX, nodeData.x),
      y: clampCoord(finalY, nodeData.y),
      parentId: newParentId,
      width: newWidth,
      height: newHeight,
      rotation: konvaNode.rotation(),
      scaleX: 1,
      scaleY: 1,
      ...(wasResized ? {
        horizontalResizing: 'fixed',
        verticalResizing: 'fixed'
      } : {})
    };

    if (isTransformEvent && wasResized && nodeData.type === 'path') {
      Object.assign(nextRootPatch, { data: scalePathData(nodeData.data, scaleFactorX, scaleFactorY) });
    }

    if (isTransformEvent && wasResized && tool === 'scale') {
      const scaledRootNode = scaleSceneNode(nodeData, scaleFactorX, scaleFactorY, {
        scalePosition: false,
        scaleText: true,
        scaleStyle: true,
      });
      Object.assign(nextRootPatch, buildScalePatch(nodeData, scaledRootNode, false));
      nextRootPatch.x = clampCoord(finalX, nodeData.x);
      nextRootPatch.y = clampCoord(finalY, nodeData.y);
      nextRootPatch.parentId = newParentId;
      nextRootPatch.rotation = konvaNode.rotation();
      nextRootPatch.scaleX = 1;
      nextRootPatch.scaleY = 1;
    }

    updateNode(nodeId, nextRootPatch);

    if (isTransformEvent && wasResized && tool === 'scale') {
      collectDescendantIds(nodeId).forEach((descendantId) => {
        const descendant = nodes.find((node) => node.id === descendantId);
        if (!descendant) return;
        const scaledDescendant = scaleSceneNode(descendant, scaleFactorX, scaleFactorY, {
          scalePosition: true,
          scaleText: true,
          scaleStyle: true,
        });
        updateNode(descendantId, buildScalePatch(descendant, scaledDescendant, true));
      });
    }

    if (isTransformEvent) {
      konvaNode.scaleX(1);
      konvaNode.scaleY(1);
    }

    setAutoLayoutDropPreview(null);
    setSnapLines(snappedTransform.guides);
    setTimeout(() => setSnapLines([]), 90);
    pushHistory();
  };

  return (
    <div
      id="canvas-container"
      className="flex-1 bg-[#1A1A1A] relative overflow-hidden h-full"
      data-renderer-backend={rendererBackend}
      data-spatial-runtime-mode={resolvedSpatialRuntimeMode}
      data-spatial-runtime-enabled={String(enableSpatialRuntime)}
      style={{ cursor: canvasCursor }}
      onClick={() => setContextMenu(null)}
    >
       {/* Rulers */}
       <FigmaRulers />

       {/* Grid Overlay */}
       <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
            backgroundImage: `radial-gradient(#FFF 0.5px, transparent 0.5px)`,
            backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
       />

      <div 
        ref={containerRef}
        className="absolute top-5 left-5 right-0 bottom-0 overflow-hidden"
      >
        {isPureRendererMode ? (
          <>
            <canvas
              ref={pureCanvasRef}
              width={Math.max(1, dimensions.width)}
              height={Math.max(1, dimensions.height)}
              className="absolute inset-0 touch-none"
              onPointerDown={handlePureCanvasPointerDown}
              onPointerMove={handlePureCanvasPointerMove}
              onPointerUp={handlePureCanvasPointerUp}
              onPointerLeave={handlePureCanvasPointerLeave}
              onContextMenu={handlePureCanvasContextMenu}
              onWheel={handlePureCanvasWheel}
              onDoubleClick={() => tool === 'pen' && finalizePenPath()}
              style={{ width: '100%', height: '100%' }}
            />
            {selectionRect && (
              <div
                className="pointer-events-none absolute border border-dashed border-[#6366F1] bg-[rgba(99,102,241,0.1)]"
                style={{
                  left: (Math.min(selectionRect.x, selectionRect.x + selectionRect.width) * viewport.zoom) + viewport.x,
                  top: (Math.min(selectionRect.y, selectionRect.y + selectionRect.height) * viewport.zoom) + viewport.y,
                  width: Math.abs(selectionRect.width) * viewport.zoom,
                  height: Math.abs(selectionRect.height) * viewport.zoom,
                }}
              />
            )}
            {zoomRect && (
              <div
                className="pointer-events-none absolute border border-dashed border-[#10B981] bg-[rgba(16,185,129,0.12)]"
                style={{
                  left: (Math.min(zoomRect.x, zoomRect.x + zoomRect.width) * viewport.zoom) + viewport.x,
                  top: (Math.min(zoomRect.y, zoomRect.y + zoomRect.height) * viewport.zoom) + viewport.y,
                  width: Math.abs(zoomRect.width) * viewport.zoom,
                  height: Math.abs(zoomRect.height) * viewport.zoom,
                }}
              />
            )}
          </>
        ) : (
          <React.Suspense fallback={null}>
            <LazyKonvaSceneTree
              dimensions={dimensions}
              viewport={viewport}
              stageRef={stageRef}
              transformerRef={transformerRef}
              tool={tool}
              mode={mode}
              altHeld={altHeld}
              selectedIds={selectedIds}
              hoveredId={hoveredId}
              nodes={nodes}
              variables={variables}
              selectedPathAnchors={selectedPathAnchors}
              directSelectHoverIds={directSelectHoverIds}
              autoLayoutDropPreview={autoLayoutDropPreview}
              prototypeConnectionDraft={prototypeConnectionDraft}
              useWorkerSpatialRuntime={useWorkerSpatialRuntime}
              isPanning={isPanning}
              editingId={editingId}
              newNode={newNode}
              penPoints={penPoints}
              directSelectCycleRef={directSelectCycleRef}
              getGlobalPosition={getGlobalPosition}
              getGlobalRect={getGlobalRect}
              filterTopLevelSelection={filterTopLevelSelection}
              setPrototypeConnectionDraft={setPrototypeConnectionDraft}
              runNodeInteractions={runNodeInteractions}
              getPointerPosition={getPointerPosition}
              setSelectedIds={setSelectedIds}
              clearPathAnchorSelection={clearPathAnchorSelection}
              setHoveredNode={setHoveredNode}
              handleTextDblClick={handleTextDblClick}
              handleNodeDragMove={handleNodeDragMove}
              handleNodeDragStart={handleNodeDragStart}
              handleNodeUpdate={handleNodeUpdate}
              setPathAnchorSelection={setPathAnchorSelection}
              setSelectedPathAnchor={setSelectedPathAnchor}
              isPathAnchorSelected={isPathAnchorSelected}
              togglePathAnchorMode={togglePathAnchorMode}
              handleControlPointDragMove={handleControlPointDragMove}
              pushHistory={pushHistory}
              handlePointDragMove={handlePointDragMove}
              insertPathAnchorAtPointer={insertPathAnchorAtPointer}
              clampSize={clampSize}
              resolveDirectSelectCycle={resolveDirectSelectCycle}
              selectionRect={selectionRect}
              zoomRect={zoomRect}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={handleCanvasContextMenu}
              onMouseLeave={() => {
                setDirectSelectHoverIds([]);
                setAutoLayoutDropPreview(null);
              }}
              onDoubleClick={() => {
                if (tool === 'pen') {
                  finalizePenPath();
                }
              }}
            />
          </React.Suspense>
        )}

        <GuidesOverlay
          nodes={nodes}
          viewport={viewport}
          width={dimensions.width}
          height={dimensions.height}
          mode={mode}
          persistentGuides={persistentGuides}
          snapLines={snapLines}
          prototypeConnectionDraft={prototypeConnectionDraft}
          getGlobalPosition={getGlobalPosition}
        />
        <TransformOverlay
          enabled={isPureRendererMode}
          getGlobalPosition={getGlobalPosition}
        />
      </div>

      {contextMenu && (
        <div
          className="fixed z-[120] w-48 rounded-xl border border-[#2A2A2A] bg-[#0B0B0B] p-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => runContextAction('copy')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Copy Selection
          </button>
          <button
            onClick={() => runContextAction('paste')}
            disabled={!canPaste()}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Paste Here
          </button>
          <button
            onClick={() => runContextAction('duplicate')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Duplicate
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('group')}
            disabled={selectedIds.length < 2}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Group Selection
          </button>
          <button
            onClick={() => runContextAction('frame')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Frame Selection
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('delete')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-red-300 transition-colors hover:bg-red-600/20 hover:text-red-200 disabled:opacity-35"
          >
            Delete
          </button>
        </div>
      )}

      {/* Text Editing Overlay */}
      {editingId && nodes.find(n => n.id === editingId && n.type === 'text') && (() => {
        const node = nodes.find((n): n is TextNode => n.id === editingId && n.type === 'text');
        if (!node) return null;
        const globalPos = getGlobalPosition(node.id);
        const visibleTextFill = (node.fills || []).filter((p) => p.visible !== false && p.type === 'solid').slice(-1)[0];
        const textColor = visibleTextFill?.color || node.fill;
        return (
          <textarea
            autoFocus
            value={editingText}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            style={{
              position: 'absolute',
              top: (globalPos.y * viewport.zoom) + viewport.y,
              left: (globalPos.x * viewport.zoom) + viewport.x,
              width: (node.width || 200) * viewport.zoom,
              height: (editingHeight || node.height || 40) * viewport.zoom,
              fontSize: node.fontSize * viewport.zoom,
              fontFamily: node.fontFamily,
              color: textColor,
              textAlign: node.align || 'left',
              WebkitTextStroke: node.strokeWidth ? `${node.strokeWidth * viewport.zoom}px ${node.stroke}` : 'none',
              background: 'transparent',
              border: `1px solid #6366F1`,
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              padding: 0,
              margin: 0,
              lineHeight: node.lineHeight ? (node.lineHeight / node.fontSize) : 1.2,
              transform: `rotate(${node.rotation}deg)`,
              transformOrigin: 'top left',
              zIndex: 100,
            }}
          />
        );
      })()}
    </div>
  );
};
