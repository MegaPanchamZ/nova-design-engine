export interface PathPoint {
  x: number;
  y: number;
}

export interface PathAnchor extends PathPoint {
  cpIn?: PathPoint;
  cpOut?: PathPoint;
}

export interface ParsedPathData {
  anchors: PathAnchor[];
  closed: boolean;
}

export interface PenPoint extends PathPoint {
  cp1?: PathPoint;
  cp2?: PathPoint;
}

export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const toNumber = (token: string | undefined): number | null => {
  if (typeof token !== 'string') return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
};

export const parsePathData = (data: string): ParsedPathData => {
  const tokens = data.match(/[MLCZmlcz]|-?\d*\.?\d+/g) || [];
  const anchors: PathAnchor[] = [];
  let index = 0;
  let command = '';
  let closed = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLCZmlcz]$/.test(token)) {
      command = token.toUpperCase();
      index += 1;
      if (command === 'Z') {
        closed = true;
        continue;
      }
    }

    if (!command) break;

    if (command === 'M' || command === 'L') {
      const x = toNumber(tokens[index++]);
      const y = toNumber(tokens[index++]);
      if (x !== null && y !== null) anchors.push({ x, y });
      if (command === 'M') command = 'L';
      continue;
    }

    if (command === 'C') {
      const c1x = toNumber(tokens[index++]);
      const c1y = toNumber(tokens[index++]);
      const c2x = toNumber(tokens[index++]);
      const c2y = toNumber(tokens[index++]);
      const x = toNumber(tokens[index++]);
      const y = toNumber(tokens[index++]);
      if ([c1x, c1y, c2x, c2y, x, y].every((n) => n !== null)) {
        const prev = anchors[anchors.length - 1];
        if (prev) prev.cpOut = { x: c1x as number, y: c1y as number };
        anchors.push({ x: x as number, y: y as number, cpIn: { x: c2x as number, y: c2y as number } });
      }
      continue;
    }
  }

  return { anchors, closed };
};

export const serializePathData = (anchors: PathAnchor[], closed: boolean): string => {
  if (anchors.length === 0) return '';

  let path = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let index = 1; index < anchors.length; index += 1) {
    const prev = anchors[index - 1];
    const current = anchors[index];

    if (prev.cpOut || current.cpIn) {
      const c1 = prev.cpOut || { x: prev.x, y: prev.y };
      const c2 = current.cpIn || { x: current.x, y: current.y };
      path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${current.x} ${current.y}`;
    } else {
      path += ` L ${current.x} ${current.y}`;
    }
  }

  if (closed) path += ' Z';
  return path;
};

export const pointToSegmentDistance = (
  point: PathPoint,
  start: PathPoint,
  end: PathPoint
): { distance: number; t: number } => {
  const abX = end.x - start.x;
  const abY = end.y - start.y;
  const apX = point.x - start.x;
  const apY = point.y - start.y;
  const lengthSquared = abX * abX + abY * abY;

  if (lengthSquared <= 0.000001) {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    return { distance: Math.sqrt(dx * dx + dy * dy), t: 0 };
  }

  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / lengthSquared));
  const closestX = start.x + abX * t;
  const closestY = start.y + abY * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;

  return { distance: Math.sqrt(dx * dx + dy * dy), t };
};

export const insertAnchorAtPoint = (
  parsed: ParsedPathData,
  localPoint: PathPoint
): { anchors: PathAnchor[]; insertionIndex: number } | null => {
  const anchors = [...parsed.anchors];
  if (anchors.length < 2) return null;

  let bestSegmentStart = 0;
  let bestT = 0.5;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const distance = pointToSegmentDistance(localPoint, anchors[index], anchors[index + 1]);
    if (distance.distance < bestDistance) {
      bestDistance = distance.distance;
      bestSegmentStart = index;
      bestT = distance.t;
    }
  }

  if (parsed.closed && anchors.length > 2) {
    const distance = pointToSegmentDistance(localPoint, anchors[anchors.length - 1], anchors[0]);
    if (distance.distance < bestDistance) {
      bestDistance = distance.distance;
      bestSegmentStart = anchors.length - 1;
      bestT = distance.t;
    }
  }

  const start = anchors[bestSegmentStart];
  const end = bestSegmentStart === anchors.length - 1 ? anchors[0] : anchors[bestSegmentStart + 1];
  const inserted: PathAnchor = {
    x: start.x + (end.x - start.x) * bestT,
    y: start.y + (end.y - start.y) * bestT,
  };

  const insertionIndex = bestSegmentStart === anchors.length - 1 ? anchors.length : bestSegmentStart + 1;
  anchors.splice(insertionIndex, 0, inserted);

  return { anchors, insertionIndex };
};

export const toggleAnchorCurve = (anchorsInput: PathAnchor[], index: number): PathAnchor[] => {
  const anchors = [...anchorsInput];
  const anchor = anchors[index];
  if (!anchor) return anchors;

  if (anchor.cpIn || anchor.cpOut) {
    anchor.cpIn = undefined;
    anchor.cpOut = undefined;
    return anchors;
  }

  const prev = anchors[index - 1] || anchor;
  const next = anchors[index + 1] || anchor;
  let vx = next.x - prev.x;
  let vy = next.y - prev.y;
  const length = Math.hypot(vx, vy);

  if (length < 0.001) {
    vx = 1;
    vy = 0;
  } else {
    vx /= length;
    vy /= length;
  }

  const handleLength = Math.max(12, Math.min(60, length / 4 || 24));
  anchor.cpIn = { x: anchor.x - vx * handleLength, y: anchor.y - vy * handleLength };
  anchor.cpOut = { x: anchor.x + vx * handleLength, y: anchor.y + vy * handleLength };

  return anchors;
};

export const moveAnchorWithHandles = (
  anchorsInput: PathAnchor[],
  index: number,
  nextPoint: PathPoint
): PathAnchor[] => {
  const anchors = [...anchorsInput];
  const target = anchors[index];
  if (!target) return anchors;

  const dx = nextPoint.x - target.x;
  const dy = nextPoint.y - target.y;

  target.x = nextPoint.x;
  target.y = nextPoint.y;
  if (target.cpIn) target.cpIn = { x: target.cpIn.x + dx, y: target.cpIn.y + dy };
  if (target.cpOut) target.cpOut = { x: target.cpOut.x + dx, y: target.cpOut.y + dy };

  return anchors;
};

export const moveControlHandle = (
  anchorsInput: PathAnchor[],
  index: number,
  kind: 'in' | 'out',
  nextPoint: PathPoint,
  mirrorHandle = true
): PathAnchor[] => {
  const anchors = [...anchorsInput];
  const target = anchors[index];
  if (!target) return anchors;

  if (kind === 'in') {
    target.cpIn = { x: nextPoint.x, y: nextPoint.y };
    if (mirrorHandle) {
      target.cpOut = { x: target.x + (target.x - nextPoint.x), y: target.y + (target.y - nextPoint.y) };
    }
  } else {
    target.cpOut = { x: nextPoint.x, y: nextPoint.y };
    if (mirrorHandle) {
      target.cpIn = { x: target.x + (target.x - nextPoint.x), y: target.y + (target.y - nextPoint.y) };
    }
  }

  return anchors;
};

export const getPathBounds = (points: PathPoint[]): PathBounds => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export const buildPathDataFromPenPoints = (points: PenPoint[], closed = false): { data: string; bounds: PathBounds } | null => {
  if (points.length < 2) return null;

  const bounds = getPathBounds(points);
  let data = `M ${points[0].x - bounds.minX} ${points[0].y - bounds.minY}`;

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    if (prev.cp2 && current.cp1) {
      data += ` C ${prev.cp2.x - bounds.minX} ${prev.cp2.y - bounds.minY}, ${current.cp1.x - bounds.minX} ${current.cp1.y - bounds.minY}, ${current.x - bounds.minX} ${current.y - bounds.minY}`;
    } else {
      data += ` L ${current.x - bounds.minX} ${current.y - bounds.minY}`;
    }
  }

  if (closed) data += ' Z';

  return { data, bounds };
};