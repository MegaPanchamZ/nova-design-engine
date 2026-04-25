import { SpatialBounds } from '../spatial/types';

export interface SnapGuide {
  axis: 'x' | 'y';
  value: number;
  type: 'edge' | 'center' | 'distribution';
  sourceId: string;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

export interface SnapQuery {
  movingId: string;
  bounds: SpatialBounds;
  candidates: SpatialBounds[];
  threshold: number;
}

const centerX = (bounds: SpatialBounds): number => (bounds.minX + bounds.maxX) / 2;
const centerY = (bounds: SpatialBounds): number => (bounds.minY + bounds.maxY) / 2;

export const computeSnap = (query: SnapQuery): SnapResult => {
  let snappedX = query.bounds.minX;
  let snappedY = query.bounds.minY;
  const guides: SnapGuide[] = [];

  query.candidates.forEach((candidate) => {
    if (candidate.id === query.movingId) return;

    const candidatesX = [candidate.minX, centerX(candidate), candidate.maxX];
    const movingX = [query.bounds.minX, centerX(query.bounds), query.bounds.maxX];

    candidatesX.forEach((candidateX) => {
      movingX.forEach((movingValue, movingIndex) => {
        if (Math.abs(candidateX - movingValue) > query.threshold) return;
        const offset = movingValue - query.bounds.minX;
        snappedX = candidateX - offset;
        guides.push({ axis: 'x', value: candidateX, type: movingIndex === 1 ? 'center' : 'edge', sourceId: candidate.id });
      });
    });

    const candidatesY = [candidate.minY, centerY(candidate), candidate.maxY];
    const movingY = [query.bounds.minY, centerY(query.bounds), query.bounds.maxY];

    candidatesY.forEach((candidateY) => {
      movingY.forEach((movingValue, movingIndex) => {
        if (Math.abs(candidateY - movingValue) > query.threshold) return;
        const offset = movingValue - query.bounds.minY;
        snappedY = candidateY - offset;
        guides.push({ axis: 'y', value: candidateY, type: movingIndex === 1 ? 'center' : 'edge', sourceId: candidate.id });
      });
    });
  });

  return { x: snappedX, y: snappedY, guides };
};
