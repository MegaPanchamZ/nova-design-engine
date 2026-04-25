import { LayoutBounds } from './bounds';

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
