import React, { useEffect, useMemo, useRef, useState } from 'react';

import { createSpatialRuntimeState, snapNodeToSpatial } from '../../lib/spatialRuntime';
import { scalePathData } from '../../lib/pathTooling';
import { useStore } from '../../store';
import { SceneNode } from '../../types';

type TransformHandle =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface SelectionSnapshotNode {
  id: string;
  node: SceneNode;
  parentGlobal: { x: number; y: number };
  globalX: number;
  globalY: number;
  width: number;
  height: number;
}

interface SelectionSnapshot {
  bounds: { x: number; y: number; width: number; height: number };
  nodes: SelectionSnapshotNode[];
  selectedIds: string[];
}

interface InteractionState {
  mode: 'move' | 'resize';
  handle?: TransformHandle;
  pointerStart: { x: number; y: number };
  snapshot: SelectionSnapshot;
}

export interface TransformOverlayProps {
  enabled: boolean;
  getGlobalPosition: (nodeId: string) => { x: number; y: number };
}

const HANDLE_SIZE = 10;

const normalizeBounds = (bounds: { x: number; y: number; width: number; height: number }) => ({
  x: Math.min(bounds.x, bounds.x + bounds.width),
  y: Math.min(bounds.y, bounds.y + bounds.height),
  width: Math.max(1, Math.abs(bounds.width)),
  height: Math.max(1, Math.abs(bounds.height)),
});

const getTopLevelSelection = (nodes: SceneNode[], selectedIds: string[]): string[] => {
  const selected = new Set(selectedIds);

  const hasSelectedAncestor = (nodeId: string): boolean => {
    let cursor = nodes.find((node) => node.id === nodeId)?.parentId;
    while (cursor) {
      if (selected.has(cursor)) return true;
      cursor = nodes.find((node) => node.id === cursor)?.parentId;
    }
    return false;
  };

  return selectedIds.filter((nodeId) => !hasSelectedAncestor(nodeId));
};

const collectDescendants = (nodes: SceneNode[], rootId: string): string[] => {
  const children = nodes.filter((node) => node.parentId === rootId);
  return children.flatMap((child) => [child.id, ...collectDescendants(nodes, child.id)]);
};

const buildSelectionSnapshot = (
  nodes: SceneNode[],
  selectedIds: string[],
  getGlobalPosition: (nodeId: string) => { x: number; y: number }
): SelectionSnapshot | null => {
  if (selectedIds.length === 0) return null;

  const selectedNodes = selectedIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is SceneNode => Boolean(node));

  if (selectedNodes.length === 0) return null;

  const nodeSnapshots = selectedNodes.map((node) => {
    const global = getGlobalPosition(node.id);
    const parentGlobal = node.parentId ? getGlobalPosition(node.parentId) : { x: 0, y: 0 };
    return {
      id: node.id,
      node,
      parentGlobal,
      globalX: global.x,
      globalY: global.y,
      width: node.width,
      height: node.height,
    };
  });

  const minX = Math.min(...nodeSnapshots.map((node) => node.globalX));
  const minY = Math.min(...nodeSnapshots.map((node) => node.globalY));
  const maxX = Math.max(...nodeSnapshots.map((node) => node.globalX + node.width));
  const maxY = Math.max(...nodeSnapshots.map((node) => node.globalY + node.height));

  return {
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
    nodes: nodeSnapshots,
    selectedIds: selectedIds.slice(),
  };
};

const updateBoundsByHandle = (
  source: { x: number; y: number; width: number; height: number },
  handle: TransformHandle,
  deltaX: number,
  deltaY: number
) => {
  const left = source.x;
  const top = source.y;
  const right = source.x + source.width;
  const bottom = source.y + source.height;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('left')) nextLeft += deltaX;
  if (handle.includes('right')) nextRight += deltaX;
  if (handle.includes('top')) nextTop += deltaY;
  if (handle.includes('bottom')) nextBottom += deltaY;

  if (handle === 'top-center' || handle === 'bottom-center') {
    nextLeft = left;
    nextRight = right;
  }

  if (handle === 'middle-left' || handle === 'middle-right') {
    nextTop = top;
    nextBottom = bottom;
  }

  const minSize = 1;
  if (Math.abs(nextRight - nextLeft) < minSize) {
    if (handle.includes('left')) nextLeft = nextRight - minSize;
    if (handle.includes('right')) nextRight = nextLeft + minSize;
  }

  if (Math.abs(nextBottom - nextTop) < minSize) {
    if (handle.includes('top')) nextTop = nextBottom - minSize;
    if (handle.includes('bottom')) nextBottom = nextTop + minSize;
  }

  return normalizeBounds({
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  });
};

export const TransformOverlay = ({ enabled, getGlobalPosition }: TransformOverlayProps) => {
  const pages = useStore((state) => state.pages);
  const currentPageId = useStore((state) => state.currentPageId);
  const selectedIds = useStore((state) => state.selectedIds);
  const viewport = useStore((state) => state.viewport);
  const tool = useStore((state) => state.tool);
  const guides = useStore((state) => state.guides);
  const updateNode = useStore((state) => state.updateNode);
  const setSnapLines = useStore((state) => state.setSnapLines);

  const currentPage = pages.find((page) => page.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  const topLevelSelection = useMemo(() => getTopLevelSelection(nodes, selectedIds), [nodes, selectedIds]);
  const snapshot = useMemo(() => buildSelectionSnapshot(nodes, topLevelSelection, getGlobalPosition), [getGlobalPosition, nodes, topLevelSelection]);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);

  const spatialRuntime = useMemo(() => createSpatialRuntimeState(nodes), [nodes]);

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (!state) return;

      const deltaX = (event.clientX - state.pointerStart.x) / viewport.zoom;
      const deltaY = (event.clientY - state.pointerStart.y) / viewport.zoom;

      if (state.mode === 'move') {
        const excluded = state.snapshot.selectedIds.flatMap((id) => [id, ...collectDescendants(nodes, id)]);
        const snapped = snapNodeToSpatial({
          state: spatialRuntime,
          nodeId: '__selection-overlay__',
          globalX: state.snapshot.bounds.x + deltaX,
          globalY: state.snapshot.bounds.y + deltaY,
          width: state.snapshot.bounds.width,
          height: state.snapshot.bounds.height,
          snapThreshold: 5 / viewport.zoom,
          persistentGuides: guides,
          excludedIds: excluded,
        });

        const snappedDx = snapped.x - state.snapshot.bounds.x;
        const snappedDy = snapped.y - state.snapshot.bounds.y;
        setSnapLines(snapped.snapLines);

        state.snapshot.nodes.forEach((node) => {
          const nextGlobalX = node.globalX + snappedDx;
          const nextGlobalY = node.globalY + snappedDy;
          updateNode(node.id, {
            x: nextGlobalX - node.parentGlobal.x,
            y: nextGlobalY - node.parentGlobal.y,
          });
        });
        return;
      }

      if (!state.handle) return;

      const nextBounds = updateBoundsByHandle(state.snapshot.bounds, state.handle, deltaX, deltaY);
      const scaleX = nextBounds.width / Math.max(1, state.snapshot.bounds.width);
      const scaleY = nextBounds.height / Math.max(1, state.snapshot.bounds.height);

      setSnapLines([]);

      state.snapshot.nodes.forEach((node) => {
        const relativeX = node.globalX - state.snapshot.bounds.x;
        const relativeY = node.globalY - state.snapshot.bounds.y;

        const nextGlobalX = nextBounds.x + relativeX * scaleX;
        const nextGlobalY = nextBounds.y + relativeY * scaleY;
        const nextWidth = Math.max(1, node.width * scaleX);
        const nextHeight = Math.max(1, node.height * scaleY);

        const patch: Partial<SceneNode> & { data?: string } = {
          x: nextGlobalX - node.parentGlobal.x,
          y: nextGlobalY - node.parentGlobal.y,
          width: nextWidth,
          height: nextHeight,
          horizontalResizing: 'fixed',
          verticalResizing: 'fixed',
        };

        if (node.node.type === 'path') {
          patch.data = scalePathData(node.node.data, scaleX, scaleY);
        }

        updateNode(node.id, patch);
      });
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
      setInteraction(null);
      setSnapLines([]);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [guides, interaction, nodes, setSnapLines, spatialRuntime, updateNode, viewport.zoom]);

  if (!enabled) return null;
  if (!snapshot) return null;
  if (tool !== 'select' && tool !== 'scale') return null;

  const screenLeft = snapshot.bounds.x * viewport.zoom + viewport.x;
  const screenTop = snapshot.bounds.y * viewport.zoom + viewport.y;
  const screenWidth = snapshot.bounds.width * viewport.zoom;
  const screenHeight = snapshot.bounds.height * viewport.zoom;

  const handles: Array<{ name: TransformHandle; left: number; top: number; cursor: string }> = [
    { name: 'top-left', left: 0, top: 0, cursor: 'nwse-resize' },
    { name: 'top-center', left: 50, top: 0, cursor: 'ns-resize' },
    { name: 'top-right', left: 100, top: 0, cursor: 'nesw-resize' },
    { name: 'middle-left', left: 0, top: 50, cursor: 'ew-resize' },
    { name: 'middle-right', left: 100, top: 50, cursor: 'ew-resize' },
    { name: 'bottom-left', left: 0, top: 100, cursor: 'nesw-resize' },
    { name: 'bottom-center', left: 50, top: 100, cursor: 'ns-resize' },
    { name: 'bottom-right', left: 100, top: 100, cursor: 'nwse-resize' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="pointer-events-auto absolute border border-[#6366F1]"
        style={{
          left: screenLeft,
          top: screenTop,
          width: screenWidth,
          height: screenHeight,
          boxSizing: 'border-box',
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setInteraction({
            mode: 'move',
            pointerStart: { x: event.clientX, y: event.clientY },
            snapshot,
          });
        }}
      >
        {handles.map((handle) => (
          <div
            key={handle.name}
            className="absolute rounded-sm border border-[#6366F1] bg-white"
            style={{
              left: `calc(${handle.left}% - ${HANDLE_SIZE / 2}px)`,
              top: `calc(${handle.top}% - ${HANDLE_SIZE / 2}px)`,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor: handle.cursor,
              boxSizing: 'border-box',
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setInteraction({
                mode: 'resize',
                handle: handle.name,
                pointerStart: { x: event.clientX, y: event.clientY },
                snapshot,
              });
            }}
          />
        ))}
      </div>
    </div>
  );
};
