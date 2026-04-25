import { LayoutBounds } from './bounds';

export type GridTrackInput = number | string | undefined;

export interface GridDefinition {
  columns: number;
  rows: number;
  gapX?: number;
  gapY?: number;
}

export interface GridCellPlacement {
  column: number;
  row: number;
  columnSpan?: number;
  rowSpan?: number;
}

export const parseGridDimension = (value: GridTrackInput, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) return tokens.length;
  }
  return fallback;
};

export const parseGridTracks = (value: GridTrackInput, fallbackCount: number): string[] => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Array.from({ length: Math.floor(value) }, () => '1fr');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return Array.from({ length: fallbackCount }, () => '1fr');
    const parsed = parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0 && String(parsed) === trimmed) {
      return Array.from({ length: parsed }, () => '1fr');
    }
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) return tokens;
  }
  return Array.from({ length: fallbackCount }, () => '1fr');
};

export const resolveTrackSizes = (tokens: string[], available: number): number[] => {
  const parsed = tokens.map((token) => {
    const normalized = token.toLowerCase();
    if (normalized.endsWith('fr')) {
      const weight = Number.parseFloat(normalized.slice(0, -2));
      return { kind: 'fr' as const, value: Number.isFinite(weight) && weight > 0 ? weight : 1 };
    }
    if (normalized.endsWith('%')) {
      const percent = Number.parseFloat(normalized.slice(0, -1));
      if (Number.isFinite(percent) && percent > 0) {
        return { kind: 'px' as const, value: (available * percent) / 100 };
      }
    }
    if (normalized === 'auto') {
      return { kind: 'fr' as const, value: 1 };
    }
    const numeric = Number.parseFloat(normalized);
    if (Number.isFinite(numeric) && numeric > 0) {
      return { kind: 'px' as const, value: numeric };
    }
    return { kind: 'fr' as const, value: 1 };
  });

  const fixed = parsed.reduce((sum, track) => (track.kind === 'px' ? sum + track.value : sum), 0);
  const frTotal = parsed.reduce((sum, track) => (track.kind === 'fr' ? sum + track.value : sum), 0);
  const remaining = Math.max(0, available - fixed);

  return parsed.map((track) => {
    if (track.kind === 'px') return track.value;
    if (frTotal <= 0) return 0;
    return (remaining * track.value) / frTotal;
  });
};

export const resolveGridCell = (
  container: LayoutBounds,
  grid: GridDefinition,
  placement: GridCellPlacement
): LayoutBounds => {
  const gapX = grid.gapX || 0;
  const gapY = grid.gapY || 0;

  const columnWidth = (container.width - gapX * (grid.columns - 1)) / grid.columns;
  const rowHeight = (container.height - gapY * (grid.rows - 1)) / grid.rows;

  const columnSpan = Math.max(1, placement.columnSpan || 1);
  const rowSpan = Math.max(1, placement.rowSpan || 1);

  const x = container.x + placement.column * (columnWidth + gapX);
  const y = container.y + placement.row * (rowHeight + gapY);

  return {
    x,
    y,
    width: columnWidth * columnSpan + gapX * (columnSpan - 1),
    height: rowHeight * rowSpan + gapY * (rowSpan - 1),
  };
};
