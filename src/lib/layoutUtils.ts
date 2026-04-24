import { SceneNode, FrameNode, TextNode } from '../types';
import { measureText } from './measureText';

export const calculateLayout = (frame: FrameNode, children: SceneNode[]): { frame: FrameNode, children: SceneNode[] } => {
  if (frame.layoutMode === 'none') return { frame, children };

  const { padding, gap } = frame;
  const layoutChildren = children.filter(c => !c.isAbsolute);
  const absoluteChildren = children.filter(c => c.isAbsolute);

  const updatedLayoutChildren = layoutChildren.map(c => ({ ...c }));
  const updatedFrame = { ...frame };

  const parseGridDimension = (value: number | string | undefined, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      const tokens = value.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) return tokens.length;
    }
    return fallback;
  };

  const parseGridTracks = (value: number | string | undefined, fallbackCount: number): string[] => {
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

  const resolveTrackSizes = (tokens: string[], available: number) => {
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

  const measureHugText = (child: SceneNode, maxWidth?: number) => {
    if (child.type !== 'text') return;
    const text = child as TextNode;
    const metrics = measureText(text.text, text.fontSize, text.fontFamily, maxWidth, text.lineHeight);
    if (child.horizontalResizing === 'hug') child.width = metrics.width;
    if (child.verticalResizing === 'hug') child.height = metrics.height;
  };

  const getInnerWidth = () => Math.max(0, updatedFrame.width - padding.left - padding.right);
  const getInnerHeight = () => Math.max(0, updatedFrame.height - padding.top - padding.bottom);

  // Pass 1: Determine Widths
  if (frame.layoutMode === 'horizontal') {
    updatedLayoutChildren.forEach(child => {
      if (child.horizontalResizing !== 'fill') measureHugText(child, child.horizontalResizing === 'fixed' ? child.width : undefined);
    });

    if (frame.horizontalResizing === 'hug') {
      const childrenW = updatedLayoutChildren.reduce((sum, c) => sum + c.width, 0);
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      updatedFrame.width = childrenW + totalGap + padding.left + padding.right;
    }

    const fillableW = updatedLayoutChildren.filter(c => c.horizontalResizing === 'fill');
    if (fillableW.length > 0) {
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      const fixedW = updatedLayoutChildren.filter(c => c.horizontalResizing !== 'fill').reduce((sum, c) => sum + c.width, 0);
      const availableW = Math.max(0, getInnerWidth() - fixedW - totalGap);
      const fillW = availableW / fillableW.length;
      updatedLayoutChildren.forEach(child => {
        if (child.horizontalResizing === 'fill') child.width = fillW;
      });
    }
  } else if (frame.layoutMode === 'vertical') {
    updatedLayoutChildren.forEach(child => {
      if (child.horizontalResizing === 'hug' && child.type === 'text') {
        measureHugText(child);
      } else if (child.horizontalResizing === 'fill') {
        child.width = getInnerWidth();
      }
    });

    if (frame.horizontalResizing === 'hug') {
      updatedFrame.width = Math.max(0, ...updatedLayoutChildren.map(c => c.width)) + padding.left + padding.right;
    }
    
    if (frame.horizontalResizing === 'hug') {
      updatedLayoutChildren.forEach(child => {
        if (child.horizontalResizing === 'fill') {
          child.width = getInnerWidth();
        }
      });
    }
  } else if (frame.layoutMode === 'grid') {
    const itemCount = Math.max(1, updatedLayoutChildren.length);
    const fallbackColumns = parseGridDimension(frame.gridColumns, Math.ceil(Math.sqrt(itemCount)));
    const columnTracks = parseGridTracks(frame.gridColumns, fallbackColumns);
    const columns = Math.max(1, columnTracks.length);

    const fallbackRows = parseGridDimension(frame.gridRows, Math.ceil(itemCount / columns));
    const rowTracks = parseGridTracks(frame.gridRows, fallbackRows);
    const rows = Math.max(1, Math.max(rowTracks.length, Math.ceil(itemCount / columns)));
    const normalizedRowTracks = rowTracks.length >= rows
      ? rowTracks
      : [...rowTracks, ...Array.from({ length: rows - rowTracks.length }, () => '1fr')];

    updatedLayoutChildren.forEach(child => {
      if (child.horizontalResizing === 'hug') measureHugText(child);
      if (child.verticalResizing === 'hug') measureHugText(child, child.width);
    });

    const maxChildWidth = Math.max(0, ...updatedLayoutChildren.map(c => c.width));
    const maxChildHeight = Math.max(0, ...updatedLayoutChildren.map(c => c.height));

    if (frame.horizontalResizing === 'hug') {
      updatedFrame.width = padding.left + padding.right + columns * maxChildWidth + Math.max(0, columns - 1) * gap;
    }
    if (frame.verticalResizing === 'hug') {
      updatedFrame.height = padding.top + padding.bottom + rows * maxChildHeight + Math.max(0, rows - 1) * gap;
    }

    const availableGridWidth = Math.max(0, getInnerWidth() - Math.max(0, columns - 1) * gap);
    const availableGridHeight = Math.max(0, getInnerHeight() - Math.max(0, rows - 1) * gap);
    const columnWidths = resolveTrackSizes(columnTracks, availableGridWidth);
    const rowHeights = resolveTrackSizes(normalizedRowTracks, availableGridHeight);

    const columnOffsets: number[] = [];
    let runningX = padding.left;
    for (let index = 0; index < columns; index++) {
      columnOffsets.push(runningX);
      runningX += (columnWidths[index] || 0) + gap;
    }

    const rowOffsets: number[] = [];
    let runningY = padding.top;
    for (let index = 0; index < rows; index++) {
      rowOffsets.push(runningY);
      runningY += (rowHeights[index] || 0) + gap;
    }

    updatedLayoutChildren.forEach((child, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellW = columnWidths[col] || 0;
      const cellH = rowHeights[row] || 0;

      if (child.horizontalResizing === 'fill' || frame.alignItems === 'stretch') child.width = cellW;
      if (child.verticalResizing === 'fill' || frame.alignItems === 'stretch') child.height = cellH;

      if (child.type === 'text' && child.verticalResizing === 'hug') {
        const text = child as TextNode;
        const wrapWidth = child.horizontalResizing === 'fill' ? cellW : child.width;
        const metrics = measureText(text.text, text.fontSize, text.fontFamily, wrapWidth, text.lineHeight);
        child.height = metrics.height;
      }

      child.x = columnOffsets[col] || padding.left;
      child.y = rowOffsets[row] || padding.top;

      if (frame.alignItems === 'center' && child.horizontalResizing !== 'fill') {
        child.x += (cellW - child.width) / 2;
      } else if (frame.alignItems === 'end' && child.horizontalResizing !== 'fill') {
        child.x += cellW - child.width;
      }
    });
  }

  // Pass 2: Determine Heights (now that widths are stable)
  if (frame.layoutMode === 'vertical') {
    updatedLayoutChildren.forEach(child => {
      if (child.verticalResizing !== 'fill') {
        if (child.type === 'text') measureHugText(child, child.width);
      }
    });

    if (frame.verticalResizing === 'hug') {
      const childrenH = updatedLayoutChildren.filter(c => c.verticalResizing !== 'fill').reduce((sum, c) => sum + c.height, 0);
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      updatedFrame.height = childrenH + totalGap + padding.top + padding.bottom;
    }

    const fillableH = updatedLayoutChildren.filter(c => c.verticalResizing === 'fill');
    if (fillableH.length > 0) {
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      const fixedH = updatedLayoutChildren.filter(c => c.verticalResizing !== 'fill').reduce((sum, c) => sum + c.height, 0);
      const availableH = Math.max(0, getInnerHeight() - fixedH - totalGap);
      const fillH = availableH / fillableH.length;
      updatedLayoutChildren.forEach(child => {
        if (child.verticalResizing === 'fill') child.height = fillH;
      });
    }
  } else if (frame.layoutMode === 'horizontal') {
    updatedLayoutChildren.forEach(child => {
      if (frame.alignItems === 'stretch' || child.verticalResizing === 'fill') child.height = getInnerHeight();
      else if (child.verticalResizing === 'hug' && child.type === 'text') measureHugText(child, child.width);
    });

    if (frame.verticalResizing === 'hug') {
      updatedFrame.height = Math.max(0, ...updatedLayoutChildren.map(c => c.height)) + padding.top + padding.bottom;
    }

    if (frame.verticalResizing === 'hug') {
      updatedLayoutChildren.forEach(child => {
        if (frame.alignItems === 'stretch' || child.verticalResizing === 'fill') child.height = getInnerHeight();
      });
    }
  }

  // Pass 3: Positioning
  const totalW = updatedLayoutChildren.reduce((sum, c) => sum + c.width, 0);
  const totalH = updatedLayoutChildren.reduce((sum, c) => sum + c.height, 0);
  const totalG = Math.max(0, updatedLayoutChildren.length - 1) * gap;

  if (frame.layoutMode === 'horizontal') {
    let x = padding.left;
    const availW = getInnerWidth();
    let effectiveGap = gap;
    
    if (frame.justifyContent === 'center') x = padding.left + (availW - totalW - totalG) / 2;
    else if (frame.justifyContent === 'end') x = padding.left + (availW - totalW - totalG);
    else if (frame.justifyContent === 'space-between' && updatedLayoutChildren.length > 1) {
      effectiveGap = Math.max(0, (availW - totalW) / (updatedLayoutChildren.length - 1));
    }

    updatedLayoutChildren.forEach(child => {
      child.x = x;
      if (frame.alignItems === 'center') child.y = padding.top + (updatedFrame.height - padding.top - padding.bottom - child.height) / 2;
      else if (frame.alignItems === 'end') child.y = updatedFrame.height - padding.bottom - child.height;
      else child.y = padding.top;
      x += child.width + effectiveGap;
    });
  } else if (frame.layoutMode === 'vertical') {
    let y = padding.top;
    const availH = getInnerHeight();
    let effectiveGap = gap;
    
    if (frame.justifyContent === 'center') y = padding.top + (availH - totalH - totalG) / 2;
    else if (frame.justifyContent === 'end') y = padding.top + (availH - totalH - totalG);
    else if (frame.justifyContent === 'space-between' && updatedLayoutChildren.length > 1) {
      effectiveGap = Math.max(0, (availH - totalH) / (updatedLayoutChildren.length - 1));
    }

    updatedLayoutChildren.forEach(child => {
      child.y = y;
      if (frame.alignItems === 'center') child.x = padding.left + (updatedFrame.width - padding.left - padding.right - child.width) / 2;
      else if (frame.alignItems === 'end') child.x = updatedFrame.width - padding.right - child.width;
      else child.x = padding.left;
      y += child.height + effectiveGap;
    });
  }

  // Merge back
  const resultMap = new Map<string, SceneNode>();
  updatedLayoutChildren.forEach(c => resultMap.set(c.id, c));
  absoluteChildren.forEach(c => resultMap.set(c.id, c));

  const finalChildren = children.map(c => resultMap.get(c.id) || c);

  return { frame: updatedFrame, children: finalChildren };
};
