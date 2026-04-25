import React, { useMemo } from 'react';

import { buildPrototypeNoodlePoints, collectPrototypeConnections } from '../../lib/prototypeNoodles';
import { SceneNode } from '../../types';

interface PrototypeConnectionDraft {
  sourceId: string;
  pointer: { x: number; y: number };
  targetId: string | null;
}

export interface GuidesOverlayProps {
  nodes: SceneNode[];
  viewport: { x: number; y: number; zoom: number };
  width: number;
  height: number;
  mode: 'design' | 'prototype' | 'inspect';
  persistentGuides: Array<{ id: string; type: 'horizontal' | 'vertical'; position: number }>;
  snapLines: Array<{ x?: number; y?: number }>;
  prototypeConnectionDraft?: PrototypeConnectionDraft | null;
  getGlobalPosition: (nodeId: string) => { x: number; y: number };
}

const toScreenX = (x: number, viewport: { x: number; zoom: number }) => x * viewport.zoom + viewport.x;
const toScreenY = (y: number, viewport: { y: number; zoom: number }) => y * viewport.zoom + viewport.y;

const buildNodeRectLookup = (nodes: SceneNode[], getGlobalPosition: (nodeId: string) => { x: number; y: number }) => {
  const map = new Map<string, { x: number; y: number; width: number; height: number }>();
  nodes.forEach((node) => {
    const global = getGlobalPosition(node.id);
    map.set(node.id, {
      x: global.x,
      y: global.y,
      width: node.width,
      height: node.height,
    });
  });
  return map;
};

const pointsToSvgPath = (points: number[], viewport: { x: number; y: number; zoom: number }) => {
  const p0x = toScreenX(points[0], viewport);
  const p0y = toScreenY(points[1], viewport);
  const c1x = toScreenX(points[2], viewport);
  const c1y = toScreenY(points[3], viewport);
  const c2x = toScreenX(points[4], viewport);
  const c2y = toScreenY(points[5], viewport);
  const p1x = toScreenX(points[6], viewport);
  const p1y = toScreenY(points[7], viewport);

  return `M ${p0x} ${p0y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1x} ${p1y}`;
};

export const GuidesOverlay = ({
  nodes,
  viewport,
  width,
  height,
  mode,
  persistentGuides,
  snapLines,
  prototypeConnectionDraft,
  getGlobalPosition,
}: GuidesOverlayProps) => {
  const nodeRects = useMemo(() => buildNodeRectLookup(nodes, getGlobalPosition), [getGlobalPosition, nodes]);

  const prototypePaths = useMemo(() => {
    if (mode !== 'prototype') return [] as Array<{ id: string; path: string; trigger: string }>;

    const mapped = collectPrototypeConnections(nodes)
      .map((connection) => {
        const sourceRect = nodeRects.get(connection.sourceId);
        const targetRect = nodeRects.get(connection.targetId);
        if (!sourceRect || !targetRect) return null;

        const points = buildPrototypeNoodlePoints(sourceRect, targetRect);
        return {
          id: `${connection.interactionId}-${connection.actionIndex}`,
          path: pointsToSvgPath(points, viewport),
          trigger: connection.trigger,
        };
      });

    return mapped.filter((entry): entry is { id: string; path: string; trigger: 'onClick' | 'onHover' | 'onDrag' } => entry !== null);
  }, [mode, nodeRects, nodes, viewport]);

  const draftPath = useMemo(() => {
    if (mode !== 'prototype' || !prototypeConnectionDraft) return null;

    const sourceRect = nodeRects.get(prototypeConnectionDraft.sourceId);
    if (!sourceRect) return null;

    const targetRect = prototypeConnectionDraft.targetId
      ? nodeRects.get(prototypeConnectionDraft.targetId)
      : {
          x: prototypeConnectionDraft.pointer.x,
          y: prototypeConnectionDraft.pointer.y,
          width: 1,
          height: 1,
        };

    if (!targetRect) return null;

    const points = buildPrototypeNoodlePoints(sourceRect, targetRect);
    return pointsToSvgPath(points, viewport);
  }, [mode, nodeRects, prototypeConnectionDraft, viewport]);

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={Math.max(1, width)}
      height={Math.max(1, height)}
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      preserveAspectRatio="none"
    >
      {persistentGuides.map((guide) => (
        guide.type === 'vertical' ? (
          <line
            key={`persistent-guide-${guide.id}`}
            x1={toScreenX(guide.position, viewport)}
            y1={0}
            x2={toScreenX(guide.position, viewport)}
            y2={height}
            stroke="#3B82F6"
            strokeWidth={1}
            opacity={0.9}
          />
        ) : (
          <line
            key={`persistent-guide-${guide.id}`}
            x1={0}
            y1={toScreenY(guide.position, viewport)}
            x2={width}
            y2={toScreenY(guide.position, viewport)}
            stroke="#3B82F6"
            strokeWidth={1}
            opacity={0.9}
          />
        )
      ))}

      {snapLines.map((line, index) => (
        typeof line.x === 'number' ? (
          <line
            key={`snap-line-x-${index}`}
            x1={toScreenX(line.x, viewport)}
            y1={0}
            x2={toScreenX(line.x, viewport)}
            y2={height}
            stroke="#FF4D4D"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ) : (
          <line
            key={`snap-line-y-${index}`}
            x1={0}
            y1={toScreenY(line.y || 0, viewport)}
            x2={width}
            y2={toScreenY(line.y || 0, viewport)}
            stroke="#FF4D4D"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )
      ))}

      {prototypePaths.map((entry) => (
        <g key={`prototype-noodle-${entry.id}`}>
          <path
            d={entry.path}
            stroke="#F59E0B"
            strokeWidth={2}
            fill="none"
            strokeDasharray={entry.trigger === 'onHover' ? '8 6' : undefined}
            opacity={0.9}
          />
        </g>
      ))}

      {draftPath && (
        <path
          d={draftPath}
          stroke="#FB7185"
          strokeWidth={2}
          strokeDasharray="10 6"
          fill="none"
          opacity={0.95}
        />
      )}
    </svg>
  );
};
