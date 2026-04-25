import { RenderBounds, RenderTile } from './types';

export interface TileGridOptions {
  tileSize: number;
  overscanTiles?: number;
}

const overlap = (a: RenderBounds, b: RenderBounds): boolean => {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
};

export const buildVisibleTiles = (
  viewport: RenderBounds,
  options: TileGridOptions
): RenderTile[] => {
  const tileSize = Math.max(64, Math.floor(options.tileSize));
  const overscan = Math.max(0, Math.floor(options.overscanTiles || 1));

  const minTileX = Math.floor(viewport.x / tileSize) - overscan;
  const maxTileX = Math.floor((viewport.x + viewport.width) / tileSize) + overscan;
  const minTileY = Math.floor(viewport.y / tileSize) - overscan;
  const maxTileY = Math.floor((viewport.y + viewport.height) / tileSize) + overscan;

  const tiles: RenderTile[] = [];
  for (let ty = minTileY; ty <= maxTileY; ty += 1) {
    for (let tx = minTileX; tx <= maxTileX; tx += 1) {
      const bounds: RenderBounds = {
        x: tx * tileSize,
        y: ty * tileSize,
        width: tileSize,
        height: tileSize,
      };
      if (!overlap(bounds, viewport)) continue;
      tiles.push({ id: `${tx}:${ty}`, bounds, nodeIds: [] });
    }
  }

  return tiles;
};
