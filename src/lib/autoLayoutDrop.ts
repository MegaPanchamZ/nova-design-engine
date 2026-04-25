import { FrameNode, SceneNode } from '../types';

type DropPosition = 'before' | 'after' | 'inside';
type MarkerOrientation = 'vertical' | 'horizontal';

interface Point {
  x: number;
  y: number;
}

interface ChildRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LineMarker {
  kind: 'line';
  orientation: MarkerOrientation;
  x: number;
  y: number;
  length: number;
}

interface BoxMarker {
  kind: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoLayoutDropPreview {
  parentId: string;
  targetId: string;
  position: DropPosition;
  marker: LineMarker | BoxMarker;
  label: string;
}

const BAND_TOLERANCE = 1.5;

const getLineDistance = (marker: LineMarker, pointer: Point): number => {
  if (marker.orientation === 'vertical') {
    const clampedY = Math.max(marker.y, Math.min(pointer.y, marker.y + marker.length));
    return Math.hypot(pointer.x - marker.x, pointer.y - clampedY);
  }

  const clampedX = Math.max(marker.x, Math.min(pointer.x, marker.x + marker.length));
  return Math.hypot(pointer.x - clampedX, pointer.y - marker.y);
};

const getBandBreak = (mainAxis: 'horizontal' | 'vertical', previousRect: ChildRect | undefined, nextRect: ChildRect | undefined): boolean => {
  if (!previousRect || !nextRect) return false;
  return mainAxis === 'horizontal'
    ? Math.abs(previousRect.y - nextRect.y) > BAND_TOLERANCE
    : Math.abs(previousRect.x - nextRect.x) > BAND_TOLERANCE;
};

const buildLineMarker = (
  rects: ChildRect[],
  index: number,
  mainAxis: 'horizontal' | 'vertical'
): { marker: LineMarker; targetId: string; position: DropPosition } => {
  const previousRect = index > 0 ? rects[index - 1] : undefined;
  const nextRect = index < rects.length ? rects[index] : undefined;
  const bandBreak = getBandBreak(mainAxis, previousRect, nextRect);

  if (mainAxis === 'horizontal') {
    const referenceRect = nextRect || previousRect;
    if (!referenceRect) {
      throw new Error('Cannot build auto-layout drop marker without a reference rect');
    }

    const x = !previousRect
      ? nextRect!.x
      : !nextRect
        ? previousRect.x + previousRect.width
        : bandBreak
          ? nextRect.x
          : (previousRect.x + previousRect.width + nextRect.x) / 2;
    const top = bandBreak && nextRect
      ? nextRect.y
      : Math.min(previousRect?.y ?? referenceRect.y, nextRect?.y ?? referenceRect.y);
    const bottom = bandBreak && nextRect
      ? nextRect.y + nextRect.height
      : Math.max(
          (previousRect?.y ?? referenceRect.y) + (previousRect?.height ?? referenceRect.height),
          (nextRect?.y ?? referenceRect.y) + (nextRect?.height ?? referenceRect.height)
        );

    return {
      marker: {
        kind: 'line',
        orientation: 'vertical',
        x,
        y: top,
        length: Math.max(12, bottom - top),
      },
      targetId: nextRect ? nextRect.id : previousRect!.id,
      position: nextRect ? 'before' : 'after',
    };
  }

  const referenceRect = nextRect || previousRect;
  if (!referenceRect) {
    throw new Error('Cannot build auto-layout drop marker without a reference rect');
  }

  const y = !previousRect
    ? nextRect!.y
    : !nextRect
      ? previousRect.y + previousRect.height
      : bandBreak
        ? nextRect.y
        : (previousRect.y + previousRect.height + nextRect.y) / 2;
  const left = bandBreak && nextRect
    ? nextRect.x
    : Math.min(previousRect?.x ?? referenceRect.x, nextRect?.x ?? referenceRect.x);
  const right = bandBreak && nextRect
    ? nextRect.x + nextRect.width
    : Math.max(
        (previousRect?.x ?? referenceRect.x) + (previousRect?.width ?? referenceRect.width),
        (nextRect?.x ?? referenceRect.x) + (nextRect?.width ?? referenceRect.width)
      );

  return {
    marker: {
      kind: 'line',
      orientation: 'horizontal',
      x: left,
      y,
      length: Math.max(12, right - left),
    },
    targetId: nextRect ? nextRect.id : previousRect!.id,
    position: nextRect ? 'before' : 'after',
  };
};

export const getAutoLayoutDropPreview = (
  frame: FrameNode,
  children: SceneNode[],
  pointer: Point,
  getGlobalPosition: (nodeId: string) => Point
): AutoLayoutDropPreview | null => {
  if (frame.layoutMode === 'none') return null;

  const frameGlobal = getGlobalPosition(frame.id);
  const innerX = frameGlobal.x + frame.padding.left;
  const innerY = frameGlobal.y + frame.padding.top;
  const innerWidth = Math.max(1, frame.width - frame.padding.left - frame.padding.right);
  const innerHeight = Math.max(1, frame.height - frame.padding.top - frame.padding.bottom);
  const flowChildren = children.filter((child) => !child.isAbsolute);

  if (flowChildren.length === 0) {
    return {
      parentId: frame.id,
      targetId: frame.id,
      position: 'inside',
      marker: {
        kind: 'box',
        x: innerX,
        y: innerY,
        width: innerWidth,
        height: innerHeight,
      },
      label: 'Drop Into Auto Layout',
    };
  }

  const orderedRects: ChildRect[] = flowChildren.map((child) => {
    const global = getGlobalPosition(child.id);
    return {
      id: child.id,
      x: global.x,
      y: global.y,
      width: child.width,
      height: child.height,
    };
  });

  const mainAxis = frame.layoutMode === 'vertical' ? 'vertical' : 'horizontal';
  const slots = Array.from({ length: orderedRects.length + 1 }, (_, index) => buildLineMarker(orderedRects, index, mainAxis));
  const best = slots.reduce((closest, slot) => {
    const distance = getLineDistance(slot.marker, pointer);
    if (!closest || distance < closest.distance) {
      return { slot, distance };
    }
    return closest;
  }, null as { slot: ReturnType<typeof buildLineMarker>; distance: number } | null);

  if (!best) return null;

  return {
    parentId: frame.id,
    targetId: best.slot.targetId,
    position: best.slot.position,
    marker: best.slot.marker,
    label: best.slot.position === 'before' ? 'Insert Before' : 'Insert After',
  };
};