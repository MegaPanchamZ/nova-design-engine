export interface SpatialPoint {
  x: number;
  y: number;
}

export interface SpatialBounds {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  metadata?: Record<string, unknown>;
}

export interface SpatialQuery {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
