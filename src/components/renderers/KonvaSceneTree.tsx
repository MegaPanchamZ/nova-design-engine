import React from 'react';
import Konva from 'konva';
import { Arrow, Circle, Ellipse, Group, Layer, Line, Path, Rect, Stage, Text, Transformer } from 'react-konva';
import useImage from 'use-image';

import { getSuperellipsePath } from '../../lib/geometry';
import {
  parsePathData,
} from '../../lib/pathTooling';
import { buildMaskingRuns } from '../../lib/masking';
import { buildPrototypeNoodlePoints, isPrototypeTargetNode } from '../../lib/prototypeNoodles';
import type { Effect, FrameNode, ImageNode, Paint, SceneNode } from '../../types';

type PathAnchorSelection = {
  nodeId: string;
  index: number;
};

interface SanitizedCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

const isFrameLikeNode = (node: SceneNode): node is FrameNode =>
  node.type === 'frame' ||
  node.type === 'section' ||
  node.type === 'group' ||
  node.type === 'component' ||
  node.type === 'instance';

const clampCornerValue = (value: number, fallback: number, maxCornerRadius: number): number => {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!Number.isFinite(value)) return Math.min(maxCornerRadius, Math.max(0, safeFallback));
  return Math.min(maxCornerRadius, Math.max(0, value));
};

const getSanitizedCornerData = (node: Pick<SceneNode, 'width' | 'height' | 'cornerRadius' | 'individualCornerRadius' | 'cornerSmoothing'>) => {
  const safeWidth = Number.isFinite(node.width) ? Math.abs(node.width) : 0;
  const safeHeight = Number.isFinite(node.height) ? Math.abs(node.height) : 0;
  const maxCornerRadius = Math.max(0, Math.min(safeWidth, safeHeight) / 2);
  const uniform = clampCornerValue(node.cornerRadius || 0, 0, maxCornerRadius);
  const corners: SanitizedCorners = {
    topLeft: clampCornerValue(node.individualCornerRadius?.topLeft ?? uniform, uniform, maxCornerRadius),
    topRight: clampCornerValue(node.individualCornerRadius?.topRight ?? uniform, uniform, maxCornerRadius),
    bottomRight: clampCornerValue(node.individualCornerRadius?.bottomRight ?? uniform, uniform, maxCornerRadius),
    bottomLeft: clampCornerValue(node.individualCornerRadius?.bottomLeft ?? uniform, uniform, maxCornerRadius),
  };

  const smoothingRaw = Number.isFinite(node.cornerSmoothing) ? node.cornerSmoothing : 0;
  const smoothing = Math.min(1, Math.max(0, smoothingRaw));

  return {
    uniform,
    corners,
    cornerRadiusArray: [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft] as [number, number, number, number],
    smoothing,
  };
};

interface KonvaImageProps {
  node: ImageNode;
  konvaProps: Record<string, unknown>;
  selectionProps: Record<string, unknown> | null;
  hoverProps: Record<string, unknown> | null;
}

const KonvaImage = ({ node, konvaProps, selectionProps, hoverProps }: KonvaImageProps) => {
  const [img] = useImage(node.src, 'anonymous');
  const cornerData = getSanitizedCornerData(node);

  const getScaleProps = () => {
    if (!img) return {};

    const mode = node.imageScaleMode || 'fill';
    const nodeWidth = node.width;
    const nodeHeight = node.height;
    const imgWidth = img.width;
    const imgHeight = img.height;

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let repeat = 'no-repeat';

    if (mode === 'fill') {
      scale = Math.max(nodeWidth / imgWidth, nodeHeight / imgHeight);
      offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
      offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
    } else if (mode === 'fit') {
      scale = Math.min(nodeWidth / imgWidth, nodeHeight / imgHeight);
      offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
      offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
    } else if (mode === 'tile') {
      scale = node.imageScale || 1;
      repeat = 'repeat';
    } else {
      return {
        fillPatternImage: img,
        fillPatternScaleX: nodeWidth / imgWidth,
        fillPatternScaleY: nodeHeight / imgHeight,
        fillPatternRepeat: 'no-repeat',
      };
    }

    return {
      fillPatternImage: img,
      fillPatternScaleX: scale,
      fillPatternScaleY: scale,
      fillPatternOffset: { x: offsetX, y: offsetY },
      fillPatternRepeat: repeat,
    };
  };

  const imageProps = getScaleProps();

  return (
    <Group>
      <Rect
        {...konvaProps}
        {...imageProps}
        fill={!img ? '#E5E7EB' : undefined}
        lineJoin="round"
        cornerRadius={cornerData.cornerRadiusArray}
      />
      {selectionProps && (
        <Rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rotation={node.rotation}
          cornerRadius={cornerData.cornerRadiusArray}
          {...selectionProps}
        />
      )}
      {hoverProps && (
        <Rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rotation={node.rotation}
          cornerRadius={cornerData.cornerRadiusArray}
          {...hoverProps}
        />
      )}
    </Group>
  );
};

export interface KonvaSceneTreeProps {
  [key: string]: any;
}

export const KonvaSceneTree = (props: KonvaSceneTreeProps) => {
  const {
    dimensions,
    viewport,
    stageRef,
    transformerRef,
    tool,
    mode,
    altHeld,
    selectedIds,
    hoveredId,
    nodes,
    variables,
    selectedPathAnchors,
    directSelectHoverIds,
    autoLayoutDropPreview,
    prototypeConnectionDraft,
    useWorkerSpatialRuntime,
    isPanning,
    editingId,
    newNode,
    penPoints,
    directSelectCycleRef,
    getGlobalPosition,
    getGlobalRect,
    filterTopLevelSelection,
    setPrototypeConnectionDraft,
    runNodeInteractions,
    getPointerPosition,
    setSelectedIds,
    clearPathAnchorSelection,
    setHoveredNode,
    handleTextDblClick,
    handleNodeDragMove,
    handleNodeDragStart,
    handleNodeUpdate,
    setPathAnchorSelection,
    setSelectedPathAnchor,
    isPathAnchorSelected,
    togglePathAnchorMode,
    handleControlPointDragMove,
    pushHistory,
    handlePointDragMove,
    insertPathAnchorAtPointer,
    clampSize,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onContextMenu,
    onMouseLeave,
    onDoubleClick,
  } = props;

  const renderAutoLayoutDropPreview = () => {
    if (!autoLayoutDropPreview) return null;

    if (autoLayoutDropPreview.marker.kind === 'box') {
      const marker = autoLayoutDropPreview.marker;
      return (
        <Group listening={false}>
          <Rect
            x={marker.x}
            y={marker.y}
            width={marker.width}
            height={marker.height}
            stroke="#22C55E"
            strokeWidth={2 / viewport.zoom}
            dash={[8 / viewport.zoom, 4 / viewport.zoom]}
            fill="rgba(34, 197, 94, 0.08)"
            cornerRadius={8 / viewport.zoom}
          />
          <Text
            x={marker.x}
            y={marker.y - (18 / viewport.zoom)}
            text={autoLayoutDropPreview.label}
            fontSize={11 / viewport.zoom}
            fontFamily="Inter"
            fill="#BBF7D0"
          />
        </Group>
      );
    }

    const marker = autoLayoutDropPreview.marker;
    const isVertical = marker.orientation === 'vertical';
    const labelWidth = 96 / viewport.zoom;
    const labelHeight = 18 / viewport.zoom;
    const labelX = isVertical ? marker.x - labelWidth / 2 : marker.x;
    const labelY = isVertical ? marker.y - (22 / viewport.zoom) : marker.y - (26 / viewport.zoom);

    return (
      <Group listening={false}>
        <Line
          points={isVertical
            ? [marker.x, marker.y, marker.x, marker.y + marker.length]
            : [marker.x, marker.y, marker.x + marker.length, marker.y]}
          stroke="#22C55E"
          strokeWidth={2.5 / viewport.zoom}
          lineCap="round"
          shadowColor="#22C55E"
          shadowBlur={10 / viewport.zoom}
          shadowOpacity={0.5}
        />
        <Circle x={marker.x} y={marker.y} radius={3.5 / viewport.zoom} fill="#22C55E" />
        <Circle
          x={isVertical ? marker.x : marker.x + marker.length}
          y={isVertical ? marker.y + marker.length : marker.y}
          radius={3.5 / viewport.zoom}
          fill="#22C55E"
        />
        <Group x={labelX} y={labelY}>
          <Rect
            width={labelWidth}
            height={labelHeight}
            fill="rgba(20, 83, 45, 0.92)"
            stroke="#22C55E"
            strokeWidth={1 / viewport.zoom}
            cornerRadius={6 / viewport.zoom}
          />
          <Text
            y={3 / viewport.zoom}
            width={labelWidth}
            text={autoLayoutDropPreview.label}
            fontSize={10 / viewport.zoom}
            fontFamily="Inter"
            fill="#DCFCE7"
            align="center"
          />
        </Group>
      </Group>
    );
  };

  const renderSingleNode = (node: SceneNode): React.ReactNode => {
    const isSelected = selectedIds.includes(node.id);

    const resolveVariableBinding = (bindingKey: 'fill' | 'stroke' | 'opacity' | 'text') => {
      const variableId = node.variableBindings?.[bindingKey];
      if (!variableId) return undefined;
      return variables.find((entry: any) => entry.id === variableId)?.value;
    };

    const boundFillValue = resolveVariableBinding('fill');
    const boundStrokeValue = resolveVariableBinding('stroke');
    const boundOpacityValue = resolveVariableBinding('opacity');
    const boundTextValue = resolveVariableBinding('text');

    const effectiveFill = typeof boundFillValue === 'string' ? boundFillValue : (node.fill || '#D9D9D9');
    const effectiveStroke = typeof boundStrokeValue === 'string' ? boundStrokeValue : (node.stroke || '#000000');
    const numericOpacity = typeof boundOpacityValue === 'number' ? boundOpacityValue : Number(boundOpacityValue);
    const effectiveOpacity = Number.isFinite(numericOpacity)
      ? Math.max(0, Math.min(1, numericOpacity))
      : (node.opacity || 1);
    const effectiveText = node.type === 'text' && typeof boundTextValue !== 'undefined'
      ? String(boundTextValue)
      : (node.type === 'text' ? node.text : undefined);

    const getVisibleFills = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-fill`, type: 'solid', color: fallback, opacity: 1, visible: true } as Paint];
    };

    const getVisibleStrokes = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-stroke`, type: 'solid', color: fallback, opacity: 1, visible: true } as Paint];
    };

    const getLinearGradientPoints = (paint: Paint) => {
      const angle = Number.isFinite((paint as any).gradientAngle) ? Number((paint as any).gradientAngle) : 0;
      const radians = (angle * Math.PI) / 180;
      const cx = node.width / 2;
      const cy = node.height / 2;
      const dx = Math.cos(radians) * (node.width / 2);
      const dy = Math.sin(radians) * (node.height / 2);
      return {
        start: { x: cx - dx, y: cy - dy },
        end: { x: cx + dx, y: cy + dy },
      };
    };

    const getGradientStops = (paint: Paint): (number | string)[] => {
      const rawStops = ((paint as any).gradientStops || []).map((stop: any) => ({
        offset: Math.min(1, Math.max(0, Number.isFinite(stop.offset) ? stop.offset : 0)),
        color: stop.color,
      }));
      const stops = rawStops.length > 0 ? rawStops : [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }];
      const sorted = [...stops].sort((a, b) => a.offset - b.offset);
      const result: (number | string)[] = [];
      sorted.forEach((stop) => {
        result.push(stop.offset, stop.color);
      });
      return result;
    };

    const getPaintFillProps = (paint: Paint | undefined, fallback: string) => {
      const safePaint = paint || ({ id: `${node.id}-safe`, type: 'solid', color: fallback, opacity: 1, visible: true } as Paint);
      const opacity = effectiveOpacity * ((safePaint as any).opacity || 1);

      if ((safePaint as any).type === 'solid') {
        return { fill: (safePaint as any).color || fallback, opacity };
      }

      if ((safePaint as any).type === 'gradient-radial') {
        const center = (safePaint as any).gradientCenter || { x: 0.5, y: 0.5 };
        const radius = Math.max(0.05, Math.min(1, (safePaint as any).gradientRadius ?? 0.5));
        const baseRadius = Math.min(Math.abs(node.width), Math.abs(node.height)) * radius;
        return {
          fillRadialGradientStartPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientEndRadius: baseRadius,
          fillRadialGradientColorStops: getGradientStops(safePaint),
          opacity,
        };
      }

      const { start, end } = getLinearGradientPoints(safePaint);
      return {
        fillLinearGradientStartPoint: start,
        fillLinearGradientEndPoint: end,
        fillLinearGradientColorStops: getGradientStops(safePaint),
        opacity,
      };
    };

    const fillPaints = getVisibleFills(node.fills, effectiveFill);
    const topFillPaint = fillPaints[fillPaints.length - 1];
    const underFillPaints = fillPaints.slice(0, -1);
    let fillProps = getPaintFillProps(topFillPaint, effectiveFill);

    const strokePaints = getVisibleStrokes(node.strokes, effectiveStroke);
    const topStrokePaint = strokePaints[strokePaints.length - 1];
    const strokeColor = (topStrokePaint as any)?.type === 'solid' ? ((topStrokePaint as any).color || effectiveStroke) : effectiveStroke;
    const strokeOpacity = effectiveOpacity * ((topStrokePaint as any)?.opacity || 1);

    if (node.isMask) {
      fillProps = { fill: 'rgba(59, 130, 246, 0.18)', opacity: 1 };
      underFillPaints.length = 0;
    }

    const cornerData = getSanitizedCornerData(node);
    const cornerRadiusArray = cornerData.cornerRadiusArray;
    const smoothCornerRadius = cornerData.uniform;
    const smoothCornerSmoothing = cornerData.smoothing;

    const effects: Effect[] = node.effects || [];
    const dropShadow = effects.find((effect) => effect.visible !== false && effect.type === 'drop-shadow');
    const shadowProps = dropShadow ? {
      shadowColor: dropShadow.color,
      shadowBlur: dropShadow.radius,
      shadowOffset: dropShadow.offset,
      shadowOpacity: 1,
    } : {};

    const layerBlur = effects.find((effect) => effect.visible !== false && effect.type === 'layer-blur');
    const backgroundBlur = effects.find((effect) => effect.visible !== false && effect.type === 'background-blur');
    const innerShadow = effects.find((effect) => effect.visible !== false && effect.type === 'inner-shadow');
    const blurProps = layerBlur ? {
      filters: [Konva.Filters.Blur],
      blurRadius: layerBlur.radius,
    } : {};

    const innerShadowColor = innerShadow?.color || 'rgba(0, 0, 0, 0.65)';
    const innerShadowOffset = innerShadow?.offset || { x: 0, y: 0 };
    const innerShadowBlur = Math.max(0, innerShadow?.radius || 0);

    const backgroundBlurOverlayProps = backgroundBlur
      ? {
        filters: [Konva.Filters.Blur],
        blurRadius: Math.max(0, backgroundBlur.radius || 0),
        opacity: 0.16,
        fill: 'rgba(255,255,255,0.32)',
      }
      : null;

    const blendModeMap: Record<string, GlobalCompositeOperation> = {
      'pass-through': 'source-over',
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
    };

    const { key: _key, ...konvaProps } = {
      id: node.id,
      key: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
      globalCompositeOperation: blendModeMap[node.blendMode || 'normal'] || 'source-over',
      draggable:
        node.draggable &&
        !node.locked &&
        !isPanning &&
        (mode === 'prototype'
          ? (node.interactions || []).some((interaction) => interaction.trigger === 'onDrag')
          : tool === 'select' || tool === 'scale' || tool === 'direct-select'),
      listening: node.visible,
      dash: node.isMask ? [8 / viewport.zoom, 4 / viewport.zoom] : undefined,
      cornerRadius: cornerRadiusArray,
      ...shadowProps,
      ...blurProps,
      onDragMove: handleNodeDragMove,
      onDragStart: handleNodeDragStart,
      onDragEnd: handleNodeUpdate,
      onTransformEnd: handleNodeUpdate,
      onTransform: (e: any) => {
        const nodeTarget = e.target;
        if (isFrameLikeNode(node)) return;

        const scaleX = nodeTarget.scaleX();
        const scaleY = nodeTarget.scaleY();
        const newWidth = clampSize(nodeTarget.width() * scaleX, node.width);
        const newHeight = clampSize(nodeTarget.height() * scaleY, node.height);

        nodeTarget.setAttrs({
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1,
        });
      },
      onClick: (e: any) => {
        if (node.locked) return;
        if (typeof e.evt.button === 'number' && e.evt.button !== 0) return;

        if (mode === 'prototype') {
          e.cancelBubble = true;
          runNodeInteractions(node, 'onClick');
          return;
        }

        e.cancelBubble = true;
        if (tool === 'direct-select') {
          const point = getPointerPosition();
          const cycle = props.resolveDirectSelectCycle(nodes, point, directSelectCycleRef.current);
          directSelectCycleRef.current = cycle.cycle;
          if (cycle.node) {
            if (e.evt.shiftKey) {
              setSelectedIds(Array.from(new Set([...selectedIds, cycle.node.id])));
            } else {
              setSelectedIds([cycle.node.id]);
            }
            clearPathAnchorSelection();
            return;
          }
        }

        directSelectCycleRef.current = null;
        if (e.evt.shiftKey) {
          setSelectedIds(Array.from(new Set([...selectedIds, node.id])));
        } else {
          setSelectedIds([node.id]);
        }
        clearPathAnchorSelection();
      },
      onDblClick: () => handleTextDblClick(node),
      onMouseEnter: () => {
        if (useWorkerSpatialRuntime) return;
        setHoveredNode(node.id);
      },
      onMouseLeave: () => {
        if (useWorkerSpatialRuntime) return;
        setHoveredNode(null);
      },
    };

    const isComponentRelated = node.type === 'component' || node.type === 'instance';
    const selectionColor = isComponentRelated ? '#A855F7' : '#6366F1';

    const selectionProps = isSelected
      ? {
        stroke: selectionColor,
        strokeWidth: 2 / viewport.zoom,
        dash: node.type === 'instance' ? [4 / viewport.zoom, 2 / viewport.zoom] : undefined,
        listening: false,
      }
      : null;

    const isHovered = hoveredId === node.id && !isSelected;
    const hoverProps = isHovered
      ? {
        stroke: selectionColor,
        strokeWidth: 1 / viewport.zoom,
        listening: false,
        opacity: 0.5,
      }
      : null;

    if (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
      const hasSmoothing = smoothCornerSmoothing > 0;
      const isTopLevel = !node.parentId;

      return (
        <Group key={node.id}>
          {isTopLevel && (
            <Text
              x={node.x}
              y={node.y - (14 / viewport.zoom)}
              text={node.name}
              fontSize={11 / viewport.zoom}
              fontFamily="Inter"
              fill={isSelected ? selectionColor : '#A1A1A1'}
              fontStyle="600"
            />
          )}
          <Group
            {...konvaProps}
            name="frame"
            clipFunc={node.clipsContent
              ? (ctx) => {
                const r = cornerData.corners;
                const w = node.width;
                const h = node.height;
                ctx.beginPath();
                ctx.moveTo(r.topLeft, 0);
                ctx.lineTo(w - r.topRight, 0);
                ctx.quadraticCurveTo(w, 0, w, r.topRight);
                ctx.lineTo(w, h - r.bottomRight);
                ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                ctx.lineTo(r.bottomLeft, h);
                ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                ctx.lineTo(0, r.topLeft);
                ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
                ctx.closePath();
              }
              : undefined}
          >
            {underFillPaints.map((paint) => {
              const layerProps = getPaintFillProps(paint, effectiveFill);
              if (hasSmoothing) {
                return (
                  <Path
                    key={`${node.id}-under-${paint.id}`}
                    data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                    {...layerProps}
                    listening={false}
                  />
                );
              }
              return (
                <Rect
                  key={`${node.id}-under-${paint.id}`}
                  width={node.width}
                  height={node.height}
                  cornerRadius={cornerRadiusArray}
                  {...layerProps}
                  lineJoin="round"
                  listening={false}
                />
              );
            })}
            {hasSmoothing ? (
              <Path
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                {...fillProps}
              />
            ) : (
              <Rect width={node.width} height={node.height} cornerRadius={cornerRadiusArray} {...fillProps} lineJoin="round" />
            )}
            {node.strokeWidth > 0 && (
              hasSmoothing ? (
                <Path
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  fillEnabled={false}
                  stroke={strokeColor}
                  strokeWidth={node.strokeWidth}
                  opacity={strokeOpacity}
                  listening={false}
                />
              ) : (
                <Rect
                  width={node.width}
                  height={node.height}
                  cornerRadius={cornerRadiusArray}
                  fillEnabled={false}
                  stroke={strokeColor}
                  strokeWidth={node.strokeWidth}
                  opacity={strokeOpacity}
                  lineJoin="round"
                  listening={false}
                />
              )
            )}
            {backgroundBlurOverlayProps && (
              hasSmoothing ? (
                <Path
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  {...backgroundBlurOverlayProps}
                  listening={false}
                />
              ) : (
                <Rect
                  width={node.width}
                  height={node.height}
                  cornerRadius={cornerRadiusArray}
                  {...backgroundBlurOverlayProps}
                  listening={false}
                />
              )
            )}
            {innerShadow && (
              hasSmoothing ? (
                <Path
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  fill={innerShadowColor}
                  opacity={0.12}
                  shadowColor={innerShadowColor}
                  shadowBlur={innerShadowBlur}
                  shadowOffset={innerShadowOffset}
                  globalCompositeOperation="source-atop"
                  listening={false}
                />
              ) : (
                <Rect
                  width={node.width}
                  height={node.height}
                  cornerRadius={cornerRadiusArray}
                  fill={innerShadowColor}
                  opacity={0.12}
                  shadowColor={innerShadowColor}
                  shadowBlur={innerShadowBlur}
                  shadowOffset={innerShadowOffset}
                  globalCompositeOperation="source-atop"
                  listening={false}
                />
              )
            )}
            {selectionProps && <Rect width={node.width} height={node.height} cornerRadius={cornerRadiusArray} {...selectionProps} />}
            {hoverProps && <Rect width={node.width} height={node.height} cornerRadius={cornerRadiusArray} {...hoverProps} />}
            {isHovered && node.layoutMode !== 'none' && (
              <Group listening={false}>
                {node.padding.top > 0 && <Rect x={0} y={0} width={node.width} height={node.padding.top} fill="rgba(255, 0, 255, 0.15)" />}
                {node.padding.bottom > 0 && <Rect x={0} y={node.height - node.padding.bottom} width={node.width} height={node.padding.bottom} fill="rgba(255, 0, 255, 0.15)" />}
                {node.padding.left > 0 && <Rect x={0} y={0} width={node.padding.left} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                {node.padding.right > 0 && <Rect x={node.width - node.padding.right} y={0} width={node.padding.right} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                {node.gap > 0 && nodes.filter((c: SceneNode) => c.parentId === node.id).slice(1).map((child: SceneNode, idx: number) => {
                  if (node.layoutMode === 'horizontal') {
                    return <Rect key={idx} x={child.x - node.gap} y={0} width={node.gap} height={node.height} fill="rgba(255, 0, 255, 0.2)" />;
                  }
                  return <Rect key={idx} x={0} y={child.y - node.gap} width={node.width} height={node.gap} fill="rgba(255, 0, 255, 0.2)" />;
                })}
              </Group>
            )}
            {renderNodeHierarchy(node.id)}
          </Group>
        </Group>
      );
    }

    if (node.type === 'rect') {
      const hasSmoothing = smoothCornerSmoothing > 0;
      return (
        <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            if (hasSmoothing) {
              return (
                <Path
                  key={`${node.id}-under-${paint.id}`}
                  x={node.x}
                  y={node.y}
                  rotation={node.rotation}
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  {...layerProps}
                  listening={false}
                  lineJoin="round"
                />
              );
            }
            return (
              <Rect
                key={`${node.id}-under-${paint.id}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                {...layerProps}
                lineJoin="round"
                listening={false}
              />
            );
          })}
          {hasSmoothing ? (
            <Path {...konvaProps} {...fillProps} data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)} lineJoin="round" />
          ) : (
            <Rect {...konvaProps} {...fillProps} cornerRadius={cornerRadiusArray} lineJoin="round" />
          )}
          {node.strokeWidth > 0 && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            )
          )}
          {backgroundBlurOverlayProps && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                {...backgroundBlurOverlayProps}
                listening={false}
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                {...backgroundBlurOverlayProps}
                listening={false}
              />
            )
          )}
          {innerShadow && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                fill={innerShadowColor}
                opacity={0.12}
                shadowColor={innerShadowColor}
                shadowBlur={innerShadowBlur}
                shadowOffset={innerShadowOffset}
                globalCompositeOperation="source-atop"
                listening={false}
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                fill={innerShadowColor}
                opacity={0.12}
                shadowColor={innerShadowColor}
                shadowBlur={innerShadowBlur}
                shadowOffset={innerShadowOffset}
                globalCompositeOperation="source-atop"
                listening={false}
              />
            )
          )}
          {selectionProps && (
            <Rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rotation={node.rotation}
              cornerRadius={cornerRadiusArray}
              {...selectionProps}
            />
          )}
          {hoverProps && (
            <Rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rotation={node.rotation}
              cornerRadius={cornerRadiusArray}
              {...hoverProps}
            />
          )}
        </Group>
      );
    }

    if (node.type === 'image') {
      return <KonvaImage key={node.id} node={node as ImageNode} konvaProps={konvaProps} selectionProps={selectionProps} hoverProps={hoverProps} />;
    }

    if (node.type === 'circle') {
      const radius = Math.abs(node.width / 2);
      const circleProps = {
        ...konvaProps,
        x: node.x + radius,
        y: node.y + radius,
        radius,
        ...fillProps,
      };
      return (
        <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            return (
              <Circle
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radius}
                y={node.y + radius}
                radius={radius}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
          <Circle {...circleProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
          {backgroundBlurOverlayProps && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
          {selectionProps && <Circle x={node.x + radius} y={node.y + radius} radius={radius} {...selectionProps} />}
          {hoverProps && <Circle x={node.x + radius} y={node.y + radius} radius={radius} {...hoverProps} />}
        </Group>
      );
    }

    if (node.type === 'ellipse') {
      const radiusX = Math.abs(node.width / 2);
      const radiusY = Math.abs(node.height / 2);
      const ellipseProps = {
        ...konvaProps,
        x: node.x + radiusX,
        y: node.y + radiusY,
        radiusX,
        radiusY,
        ...fillProps,
      };
      return (
        <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, effectiveFill);
            return (
              <Ellipse
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radiusX}
                y={node.y + radiusY}
                radiusX={radiusX}
                radiusY={radiusY}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
          <Ellipse {...ellipseProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
          {backgroundBlurOverlayProps && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
          {selectionProps && <Ellipse x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY} {...selectionProps} />}
          {hoverProps && <Ellipse x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY} {...hoverProps} />}
        </Group>
      );
    }

    if (node.type === 'path') {
      const pathComp = (
        <Group key={node.id}>
          {underFillPaints.map((paint) => (
            <Path
              key={`${node.id}-under-${paint.id}`}
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              {...getPaintFillProps(paint, effectiveFill)}
              lineJoin="round"
              listening={false}
            />
          ))}
          <Path {...konvaProps} {...fillProps} data={node.data} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              lineJoin="round"
              listening={false}
            />
          )}
          {backgroundBlurOverlayProps && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              {...backgroundBlurOverlayProps}
              listening={false}
            />
          )}
          {innerShadow && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              fill={innerShadowColor}
              opacity={0.12}
              shadowColor={innerShadowColor}
              shadowBlur={innerShadowBlur}
              shadowOffset={innerShadowOffset}
              globalCompositeOperation="source-atop"
              listening={false}
            />
          )}
          {hoverProps && <Path data={node.data} rotation={node.rotation} {...hoverProps} x={node.x} y={node.y} />}
        </Group>
      );

      if (tool === 'direct-select' && isSelected) {
        const parsed = parsePathData(node.data);
        const handles: React.ReactNode[] = [];

        for (let idx = 0; idx < parsed.anchors.length; idx += 1) {
          const anchor = parsed.anchors[idx];
          const anchorX = node.x + anchor.x;
          const anchorY = node.y + anchor.y;

          if (anchor.cpIn) {
            handles.push(
              <Line
                key={`${node.id}-line-in-${idx}`}
                points={[anchorX, anchorY, node.x + anchor.cpIn.x, node.y + anchor.cpIn.y]}
                stroke="#6366F1"
                strokeWidth={1 / viewport.zoom}
                opacity={0.5}
                listening={false}
              />,
            );
            handles.push(
              <Circle
                key={`${node.id}-cp-in-${idx}`}
                x={node.x + anchor.cpIn.x}
                y={node.y + anchor.cpIn.y}
                radius={3.5 / viewport.zoom}
                fill="#1D4ED8"
                stroke="#DBEAFE"
                strokeWidth={1 / viewport.zoom}
                draggable
                onMouseDown={(evt) => {
                  evt.cancelBubble = true;
                }}
                onDragMove={(evt) => handleControlPointDragMove(node.id, idx, 'in', evt)}
                onDragEnd={() => pushHistory('path-edit')}
              />,
            );
          }

          if (anchor.cpOut) {
            handles.push(
              <Line
                key={`${node.id}-line-out-${idx}`}
                points={[anchorX, anchorY, node.x + anchor.cpOut.x, node.y + anchor.cpOut.y]}
                stroke="#6366F1"
                strokeWidth={1 / viewport.zoom}
                opacity={0.5}
                listening={false}
              />,
            );
            handles.push(
              <Circle
                key={`${node.id}-cp-out-${idx}`}
                x={node.x + anchor.cpOut.x}
                y={node.y + anchor.cpOut.y}
                radius={3.5 / viewport.zoom}
                fill="#1D4ED8"
                stroke="#DBEAFE"
                strokeWidth={1 / viewport.zoom}
                draggable
                onMouseDown={(evt) => {
                  evt.cancelBubble = true;
                }}
                onDragMove={(evt) => handleControlPointDragMove(node.id, idx, 'out', evt)}
                onDragEnd={() => pushHistory('path-edit')}
              />,
            );
          }

          handles.push(
            <Circle
              key={`${node.id}-point-${idx}`}
              x={anchorX}
              y={anchorY}
              radius={4 / viewport.zoom}
              fill={isPathAnchorSelected(node.id, idx) ? '#6366F1' : '#FFFFFF'}
              stroke="#6366F1"
              strokeWidth={1 / viewport.zoom}
              draggable
              onMouseDown={(evt) => {
                evt.cancelBubble = true;
                if (evt.evt.shiftKey) {
                  const alreadySelected = isPathAnchorSelected(node.id, idx);
                  const nextSelection = alreadySelected
                    ? selectedPathAnchors.filter((anchor: PathAnchorSelection) => !(anchor.nodeId === node.id && anchor.index === idx))
                    : [...selectedPathAnchors, { nodeId: node.id, index: idx }];
                  setPathAnchorSelection(nextSelection);
                  return;
                }

                if (!isPathAnchorSelected(node.id, idx) || selectedPathAnchors.length <= 1) {
                  setPathAnchorSelection([{ nodeId: node.id, index: idx }]);
                } else {
                  setSelectedPathAnchor({ nodeId: node.id, index: idx });
                }
              }}
              onDblClick={(evt) => {
                evt.cancelBubble = true;
                togglePathAnchorMode(node.id, idx);
              }}
              onDragMove={() => handlePointDragMove(node.id, idx)}
              onDragEnd={() => pushHistory('path-edit')}
            />,
          );
        }

        return (
          <Group
            key={node.id}
            onDblClick={(evt) => {
              evt.cancelBubble = true;
              insertPathAnchorAtPointer(node.id);
            }}
          >
            {pathComp}
            {handles}
          </Group>
        );
      }

      return pathComp;
    }

    if (node.type === 'text') {
      const lineHeight = node.lineHeight ? node.lineHeight / node.fontSize : 1.2;
      const isVerticalWriting = node.writingMode === 'vertical-rl' || node.writingMode === 'vertical-lr';
      const resolvedRotation = node.rotation || (isVerticalWriting ? 90 : 0);
      const topTextPaintProps = getPaintFillProps(topFillPaint, effectiveFill);
      const baseTextOpacity = Number.isFinite((topTextPaintProps as { opacity?: number }).opacity)
        ? Number((topTextPaintProps as { opacity?: number }).opacity)
        : effectiveOpacity;
      const textBaseProps = {
        text: effectiveText || node.text,
        fontSize: node.fontSize,
        fontFamily: node.fontFamily,
        align: node.align,
        verticalAlign: 'top' as const,
        width: node.width,
        height: node.height,
        visible: editingId !== node.id,
        lineHeight,
        wrap: 'word' as const,
        padding: 1,
        lineJoin: 'round' as const,
      };

      return (
        <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerPaintProps = getPaintFillProps(paint, effectiveFill);
            const layerOpacity = Number.isFinite((layerPaintProps as { opacity?: number }).opacity)
              ? Number((layerPaintProps as { opacity?: number }).opacity)
              : effectiveOpacity;
            return (
              <Text
                key={`${node.id}-under-${paint.id}`}
                x={node.x}
                y={node.y}
                rotation={resolvedRotation}
                {...textBaseProps}
                {...layerPaintProps}
                opacity={isVerticalWriting ? layerOpacity * 0.9 : layerOpacity}
                listening={false}
              />
            );
          })}
          <Text
            {...konvaProps}
            {...textBaseProps}
            {...topTextPaintProps}
            opacity={isVerticalWriting ? baseTextOpacity * 0.9 : baseTextOpacity}
            rotation={resolvedRotation}
          />
          {selectionProps && (
            <Rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rotation={node.rotation}
              {...selectionProps}
            />
          )}
          {hoverProps && (
            <Rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rotation={node.rotation}
              {...hoverProps}
            />
          )}
        </Group>
      );
    }

    return null;
  };

  const renderNodeHierarchy = (parentNodeId?: string): React.ReactNode => {
    const parentNodes = nodes.filter((n: SceneNode) => n.parentId === parentNodeId);
    if (parentNodes.length === 0) return null;

    return buildMaskingRuns(parentNodes).map((run) => {
      if (run.type === 'normal') {
        return renderSingleNode(run.node);
      }

      const mask = run.mask;
      const contents = [...run.maskedNodes];

      return (
        <Group key={`mask-group-${mask.id}`}>
          {renderSingleNode(mask)}
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();

              ctx.save();
              ctx.translate(mask.x + mask.width / 2, mask.y + mask.height / 2);
              ctx.rotate((mask.rotation || 0) * Math.PI / 180);
              ctx.translate(-mask.width / 2, -mask.height / 2);

              if (mask.type === 'rect' || mask.type === 'frame' || mask.type === 'section' || mask.type === 'image') {
                const r = getSanitizedCornerData(mask).corners;
                const w = mask.width;
                const h = mask.height;

                ctx.moveTo(r.topLeft, 0);
                ctx.lineTo(w - r.topRight, 0);
                ctx.quadraticCurveTo(w, 0, w, r.topRight);
                ctx.lineTo(w, h - r.bottomRight);
                ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                ctx.lineTo(r.bottomLeft, h);
                ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                ctx.lineTo(0, r.topLeft);
                ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
              } else if (mask.type === 'circle') {
                ctx.arc(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), 0, Math.PI * 2);
              } else if (mask.type === 'ellipse') {
                ctx.ellipse(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), Math.abs(mask.height / 2), 0, 0, Math.PI * 2);
              } else if (mask.type === 'text') {
                ctx.rect(0, 0, mask.width, mask.height);
              } else if (mask.type === 'path') {
                const parsed = parsePathData(mask.data || '');
                if (parsed.anchors.length > 0) {
                  ctx.moveTo(parsed.anchors[0].x, parsed.anchors[0].y);
                  for (let index = 1; index < parsed.anchors.length; index += 1) {
                    const prev = parsed.anchors[index - 1];
                    const current = parsed.anchors[index];
                    if (prev.cpOut || current.cpIn) {
                      const c1 = prev.cpOut || { x: prev.x, y: prev.y };
                      const c2 = current.cpIn || { x: current.x, y: current.y };
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, current.x, current.y);
                    } else {
                      ctx.lineTo(current.x, current.y);
                    }
                  }
                  if (parsed.closed) ctx.closePath();
                } else {
                  ctx.rect(0, 0, Math.max(1, mask.width), Math.max(1, mask.height));
                }
              }

              ctx.restore();
            }}
          >
            {contents.map((entry) => renderSingleNode(entry))}
          </Group>
        </Group>
      );
    });
  };

  const renderDirectSelectHoverOutlines = () => {
    if (tool !== 'direct-select' || directSelectHoverIds.length === 0) return null;

    const cycleIds = directSelectCycleRef.current?.candidateIds || [];
    const cycleMatchesHover = cycleIds.length === directSelectHoverIds.length && cycleIds.every((id: string, index: number) => id === directSelectHoverIds[index]);
    const activeCycleId = cycleMatchesHover && directSelectCycleRef.current
      ? directSelectHoverIds[directSelectCycleRef.current.index] || directSelectHoverIds[0]
      : directSelectHoverIds[0];

    return directSelectHoverIds
      .map((id: string) => nodes.find((node: SceneNode) => node.id === id))
      .filter((node: SceneNode | undefined): node is SceneNode => Boolean(node))
      .map((node: SceneNode) => {
        const global = getGlobalPosition(node.id);
        const cornerData = getSanitizedCornerData(node);
        const highlightColor = node.type === 'component' || node.type === 'instance' ? '#A855F7' : '#14B8A6';
        const isActiveCycle = node.id === activeCycleId;
        const strokeWidth = (isActiveCycle ? 2 : 1) / viewport.zoom;
        const opacity = isActiveCycle ? 1 : 0.65;
        const commonProps = {
          key: `direct-select-hover-${node.id}`,
          stroke: highlightColor,
          strokeWidth,
          opacity,
          listening: false,
          dash: isActiveCycle ? undefined : [4 / viewport.zoom, 3 / viewport.zoom],
        };

        if (node.type === 'circle') {
          return (
            <Circle
              {...commonProps}
              x={global.x + Math.abs(node.width / 2)}
              y={global.y + Math.abs(node.width / 2)}
              radius={Math.abs(node.width / 2)}
              fillEnabled={false}
            />
          );
        }

        if (node.type === 'ellipse') {
          return (
            <Ellipse
              {...commonProps}
              x={global.x + Math.abs(node.width / 2)}
              y={global.y + Math.abs(node.height / 2)}
              radiusX={Math.abs(node.width / 2)}
              radiusY={Math.abs(node.height / 2)}
              fillEnabled={false}
            />
          );
        }

        if (node.type === 'path') {
          return (
            <Path
              {...commonProps}
              x={global.x}
              y={global.y}
              rotation={node.rotation}
              data={node.data}
              fillEnabled={false}
            />
          );
        }

        if (cornerData.smoothing > 0) {
          return (
            <Path
              {...commonProps}
              x={global.x}
              y={global.y}
              rotation={node.rotation}
              data={getSuperellipsePath(node.width, node.height, cornerData.uniform, cornerData.smoothing)}
              fillEnabled={false}
            />
          );
        }

        return (
          <Rect
            {...commonProps}
            x={global.x}
            y={global.y}
            width={node.width}
            height={node.height}
            rotation={node.rotation}
            cornerRadius={cornerData.cornerRadiusArray}
            fillEnabled={false}
          />
        );
      });
  };

  const renderPrototypeDraft = () => {
    if (mode !== 'prototype' || !prototypeConnectionDraft) return null;

    const sourceRect = getGlobalRect(prototypeConnectionDraft.sourceId);
    if (!sourceRect) return null;

    const targetRect = prototypeConnectionDraft.targetId
      ? getGlobalRect(prototypeConnectionDraft.targetId)
      : { x: prototypeConnectionDraft.pointer.x, y: prototypeConnectionDraft.pointer.y, width: 1, height: 1 };
    if (!targetRect) return null;

    const points = buildPrototypeNoodlePoints(sourceRect, targetRect);

    return (
      <Group listening={false}>
        <Arrow
          points={points}
          stroke="#FB7185"
          fill="#FB7185"
          strokeWidth={2 / viewport.zoom}
          pointerLength={10 / viewport.zoom}
          pointerWidth={9 / viewport.zoom}
          tension={0.45}
          dash={[10 / viewport.zoom, 6 / viewport.zoom]}
        />
        {prototypeConnectionDraft.targetId && (() => {
          const hoveredRect = getGlobalRect(prototypeConnectionDraft.targetId);
          if (!hoveredRect) return null;
          return (
            <Rect
              x={hoveredRect.x}
              y={hoveredRect.y}
              width={hoveredRect.width}
              height={hoveredRect.height}
              stroke="#FB7185"
              strokeWidth={2 / viewport.zoom}
              dash={[8 / viewport.zoom, 4 / viewport.zoom]}
              fillEnabled={false}
            />
          );
        })()}
      </Group>
    );
  };

  const renderPrototypeHandles = () => {
    if (mode !== 'prototype' || prototypeConnectionDraft) return null;

    return filterTopLevelSelection(selectedIds)
      .map((id: string) => nodes.find((node: SceneNode) => node.id === id))
      .filter((node: SceneNode | undefined): node is SceneNode => Boolean(node) && isPrototypeTargetNode(node as SceneNode))
      .map((node: SceneNode) => {
        const rect = getGlobalRect(node.id);
        if (!rect) return null;

        return (
          <Group key={`prototype-handle-${node.id}`}>
            <Circle
              x={rect.x + rect.width + 18 / viewport.zoom}
              y={rect.y + rect.height / 2}
              radius={10 / viewport.zoom}
              fill="#111827"
              stroke="#F59E0B"
              strokeWidth={2 / viewport.zoom}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                setPrototypeConnectionDraft({
                  sourceId: node.id,
                  pointer: getPointerPosition(),
                  targetId: null,
                });
              }}
            />
            <Arrow
              points={[
                rect.x + rect.width - 6 / viewport.zoom,
                rect.y + rect.height / 2,
                rect.x + rect.width + 10 / viewport.zoom,
                rect.y + rect.height / 2,
              ]}
              stroke="#F59E0B"
              fill="#F59E0B"
              strokeWidth={2 / viewport.zoom}
              pointerLength={8 / viewport.zoom}
              pointerWidth={7 / viewport.zoom}
              listening={false}
            />
          </Group>
        );
      });
  };

  return (
    <Stage
      width={dimensions.width}
      height={dimensions.height}
      ref={stageRef}
      scaleX={viewport.zoom}
      scaleY={viewport.zoom}
      x={viewport.x}
      y={viewport.y}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onMouseLeave={onMouseLeave}
      onDblClick={onDoubleClick}
      draggable={false}
    >
      <Layer>
        {renderNodeHierarchy()}
        {renderPrototypeDraft()}
        {renderPrototypeHandles()}
        {renderDirectSelectHoverOutlines()}
        {renderAutoLayoutDropPreview()}

        {newNode && (
          <Group
            x={newNode.parentId ? getGlobalPosition(newNode.parentId).x : 0}
            y={newNode.parentId ? getGlobalPosition(newNode.parentId).y : 0}
          >
            {(newNode.type === 'rect' || newNode.type === 'frame' || newNode.type === 'section') && (
              <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
            )}
            {newNode.type === 'circle' && (
              <Circle
                x={newNode.x + newNode.width / 2}
                y={newNode.y + newNode.width / 2}
                radius={Math.abs(newNode.width / 2)}
                fill="#6366F1"
                opacity={0.2}
                stroke="#6366F1"
                strokeWidth={1}
                lineJoin="round"
              />
            )}
            {newNode.type === 'image' && (
              <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
            )}
            {newNode.type === 'ellipse' && (
              <Ellipse
                x={newNode.x + newNode.width / 2}
                y={newNode.y + newNode.height / 2}
                radiusX={Math.abs(newNode.width / 2)}
                radiusY={Math.abs(newNode.height / 2)}
                fill="#6366F1"
                opacity={0.2}
                stroke="#6366F1"
                strokeWidth={1}
                lineJoin="round"
              />
            )}
            {newNode.type === 'text' && (
              <Group>
                <Rect
                  x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x}
                  y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y}
                  width={Math.abs(newNode.width)}
                  height={Math.abs(newNode.height)}
                  stroke="#6366F1"
                  strokeWidth={1 / viewport.zoom}
                  dash={[4, 2]}
                />
                <Text
                  x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x}
                  y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y}
                  text={newNode.text}
                  fontSize={newNode.fontSize}
                  fontFamily={newNode.fontFamily}
                  fill="#6366F1"
                  opacity={0.5}
                  width={Math.abs(newNode.width)}
                  height={Math.abs(newNode.height)}
                  wrap="word"
                  lineJoin="round"
                />
              </Group>
            )}
          </Group>
        )}

        {penPoints.length > 0 && (
          <Line
            points={penPoints.flatMap((p: { x: number; y: number }) => [p.x, p.y])}
            stroke="#6366F1"
            strokeWidth={2 / viewport.zoom}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {penPoints.length > 0 && (
          <Group>
            <Path
              data={`M ${penPoints[0].x} ${penPoints[0].y} ${penPoints.slice(1).map((p: any, i: number) => {
                const prev = penPoints[i];
                if (prev.cp2 && p.cp1) {
                  return `C ${prev.cp2.x} ${prev.cp2.y}, ${p.cp1.x} ${p.cp1.y}, ${p.x} ${p.y}`;
                }
                return `L ${p.x} ${p.y}`;
              }).join(' ')}`}
              stroke="#6366F1"
              strokeWidth={2 / viewport.zoom}
            />
            {penPoints.map((p: any, i: number) => (
              <Group key={i}>
                <Circle x={p.x} y={p.y} radius={4 / viewport.zoom} fill="white" stroke="#6366F1" strokeWidth={1 / viewport.zoom} />
                {p.cp1 && p.cp1.x !== p.x && (
                  <>
                    <Line points={[p.x, p.y, p.cp1.x, p.cp1.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                    <Circle x={p.cp1.x} y={p.cp1.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                  </>
                )}
                {p.cp2 && p.cp2.x !== p.x && (
                  <>
                    <Line points={[p.x, p.y, p.cp2.x, p.cp2.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                    <Circle x={p.cp2.x} y={p.cp2.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                  </>
                )}
              </Group>
            ))}
            {(() => {
              const { x, y } = getPointerPosition();
              return (
                <Line
                  points={[penPoints[penPoints.length - 1].x, penPoints[penPoints.length - 1].y, x, y]}
                  stroke="#6366F1"
                  strokeWidth={1 / viewport.zoom}
                  dash={[5, 5]}
                />
              );
            })()}
          </Group>
        )}

        {props.selectionRect && (
          <Rect
            x={props.selectionRect.x}
            y={props.selectionRect.y}
            width={props.selectionRect.width}
            height={props.selectionRect.height}
            fill="rgba(99, 102, 241, 0.1)"
            stroke="#6366F1"
            strokeWidth={1 / viewport.zoom}
            dash={[5, 5]}
          />
        )}

        {props.zoomRect && (
          <Rect
            x={props.zoomRect.x}
            y={props.zoomRect.y}
            width={props.zoomRect.width}
            height={props.zoomRect.height}
            fill="rgba(16, 185, 129, 0.12)"
            stroke="#10B981"
            strokeWidth={1 / viewport.zoom}
            dash={[6, 4]}
          />
        )}

        {(tool === 'select' || tool === 'scale') && (
          <Transformer
            ref={transformerRef}
            keepRatio={tool === 'scale'}
            centeredScaling={altHeld}
            rotateEnabled={tool !== 'scale'}
            enabledAnchors={tool === 'scale' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
            shiftBehavior="inverted"
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 1 || Math.abs(newBox.height) < 1) return oldBox;
              return newBox;
            }}
            anchorStroke="#6366F1"
            anchorFill="#FFFFFF"
            anchorSize={6}
            borderStroke="#6366F1"
            borderDash={[1, 1]}
          />
        )}

        {altHeld && selectedIds.length > 0 && hoveredId && selectedIds[0] !== hoveredId && (() => {
          const from = nodes.find((n: SceneNode) => n.id === selectedIds[0]);
          const to = nodes.find((n: SceneNode) => n.id === hoveredId);
          if (!from || !to) return null;

          const fromPos = getGlobalPosition(from.id);
          const toPos = getGlobalPosition(to.id);

          const fromRect = { x: fromPos.x, y: fromPos.y, width: from.width, height: from.height };
          const toRect = { x: toPos.x, y: toPos.y, width: to.width, height: to.height };
          const dists: React.ReactNode[] = [];

          const drawLine = (p1: [number, number], p2: [number, number], label: string) => (
            <Group key={`${p1}-${p2}`}>
              <Line points={[...p1, ...p2]} stroke="#FF4D4D" strokeWidth={1 / viewport.zoom} />
              <Group x={(p1[0] + p2[0]) / 2} y={(p1[1] + p2[1]) / 2}>
                <Rect x={-10 / viewport.zoom} y={-7 / viewport.zoom} width={20 / viewport.zoom} height={14 / viewport.zoom} fill="#FF4D4D" cornerRadius={2 / viewport.zoom} />
                <Text x={-10 / viewport.zoom} y={-5 / viewport.zoom} width={20 / viewport.zoom} text={label} fontSize={10 / viewport.zoom} fill="white" align="center" />
              </Group>
            </Group>
          );

          if (toRect.y + toRect.height < fromRect.y) {
            const dist = Math.round(fromRect.y - (toRect.y + toRect.height));
            dists.push(drawLine([fromRect.x + fromRect.width / 2, toRect.y + toRect.height], [fromRect.x + fromRect.width / 2, fromRect.y], dist.toString()));
          } else if (toRect.y > fromRect.y + fromRect.height) {
            const dist = Math.round(toRect.y - (fromRect.y + fromRect.height));
            dists.push(drawLine([fromRect.x + fromRect.width / 2, fromRect.y + fromRect.height], [fromRect.x + fromRect.width / 2, toRect.y], dist.toString()));
          }

          if (toRect.x + toRect.width < fromRect.x) {
            const dist = Math.round(fromRect.x - (toRect.x + toRect.width));
            dists.push(drawLine([toRect.x + toRect.width, fromRect.y + fromRect.height / 2], [fromRect.x, fromRect.y + fromRect.height / 2], dist.toString()));
          } else if (toRect.x > fromRect.x + fromRect.width) {
            const dist = Math.round(toRect.x - (fromRect.x + fromRect.width));
            dists.push(drawLine([fromRect.x + fromRect.width, fromRect.y + fromRect.height / 2], [toRect.x, fromRect.y + fromRect.height / 2], dist.toString()));
          }

          return dists;
        })()}
      </Layer>
    </Stage>
  );
};

export default KonvaSceneTree;
