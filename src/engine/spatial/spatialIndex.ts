import { SpatialBounds, SpatialPoint, SpatialQuery } from './types';

const intersects = (left: SpatialQuery, right: SpatialQuery): boolean => {
  return !(left.maxX < right.minX || left.minX > right.maxX || left.maxY < right.minY || left.minY > right.maxY);
};

const containsPoint = (bounds: SpatialBounds, point: SpatialPoint): boolean => {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
};

export class SpatialIndex {
  private items: SpatialBounds[] = [];

  load(items: SpatialBounds[]): void {
    this.items = [...items];
  }

  clear(): void {
    this.items = [];
  }

  insert(item: SpatialBounds): void {
    const existingIndex = this.items.findIndex((entry) => entry.id === item.id);
    if (existingIndex >= 0) {
      this.items[existingIndex] = item;
      return;
    }
    this.items.push(item);
  }

  remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  search(query: SpatialQuery): SpatialBounds[] {
    return this.items.filter((item) => intersects(query, item));
  }

  hitTest(point: SpatialPoint): SpatialBounds[] {
    return this.items.filter((item) => containsPoint(item, point));
  }
}
