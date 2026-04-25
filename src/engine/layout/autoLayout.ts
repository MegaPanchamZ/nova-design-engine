import { FrameNode, SceneNode, TextNode } from '../../types';
import { measureText } from '../../lib/measureText';
import { parseGridDimension, parseGridTracks, resolveTrackSizes } from './grid';

type Axis = 'horizontal' | 'vertical';

interface FlexLine {
  nodes: SceneNode[];
  mainSize: number;
  crossSize: number;
}

const getFlexBasis = (node: SceneNode, axis: Axis): number => {
  const basis = node.layoutBasis;
  if (typeof basis === 'number' && Number.isFinite(basis)) {
    return clampToNodeLimits(node, axis, basis);
  }
  return getAxisSize(node, axis);
};

const clampFinite = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return value;
};

const clampToNodeLimits = (node: SceneNode, axis: Axis, value: number): number => {
  const min = axis === 'horizontal' ? clampFinite(node.minWidth ?? 0, 0) : clampFinite(node.minHeight ?? 0, 0);
  const maxRaw = axis === 'horizontal' ? node.maxWidth : node.maxHeight;
  const max = Number.isFinite(maxRaw) ? (maxRaw as number) : Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, value));
};

const getAxisSize = (node: SceneNode, axis: Axis): number => {
  return axis === 'horizontal' ? node.width : node.height;
};

const setAxisSize = (node: SceneNode, axis: Axis, value: number) => {
  const normalized = Math.max(1, clampToNodeLimits(node, axis, value));
  if (axis === 'horizontal') node.width = normalized;
  else node.height = normalized;
};

const setAxisPosition = (node: SceneNode, axis: Axis, value: number) => {
  if (axis === 'horizontal') node.x = value;
  else node.y = value;
};

const getResizingMode = (node: SceneNode, axis: Axis): 'fixed' | 'hug' | 'fill' => {
  return axis === 'horizontal' ? node.horizontalResizing : node.verticalResizing;
};

const getGrowFactor = (node: SceneNode, axis: Axis): number => {
  if (node.layoutGrow && node.layoutGrow > 0) return node.layoutGrow;
  return getResizingMode(node, axis) === 'fill' ? 1 : 0;
};

const getShrinkFactor = (node: SceneNode): number => {
  return Number.isFinite(node.layoutShrink) ? Math.max(0, node.layoutShrink || 0) : 1;
};

const measureTextNode = (node: SceneNode, maxWidth?: number) => {
  if (node.type !== 'text') return;
  const text = node as TextNode;
  const metrics = measureText(text.text, text.fontSize, text.fontFamily, maxWidth, text.lineHeight);
  if (node.horizontalResizing === 'hug') node.width = clampToNodeLimits(node, 'horizontal', metrics.width);
  if (node.verticalResizing === 'hug') node.height = clampToNodeLimits(node, 'vertical', metrics.height);
};

const packFlexLines = (
  nodes: SceneNode[],
  mainAxis: Axis,
  crossAxis: Axis,
  mainGap: number,
  wrapLimit: number,
  allowWrap: boolean
): FlexLine[] => {
  if (nodes.length === 0) return [];

  const lines: FlexLine[] = [];
  let current: FlexLine = { nodes: [], mainSize: 0, crossSize: 0 };

  const pushCurrent = () => {
    if (current.nodes.length > 0) lines.push(current);
    current = { nodes: [], mainSize: 0, crossSize: 0 };
  };

  nodes.forEach((node) => {
    const nodeMain = getFlexBasis(node, mainAxis);
    const nodeCross = getAxisSize(node, crossAxis);
    const nextMain = current.nodes.length === 0 ? nodeMain : current.mainSize + mainGap + nodeMain;

    const shouldWrap = allowWrap &&
      current.nodes.length > 0 &&
      Number.isFinite(wrapLimit) &&
      nextMain > wrapLimit + 0.001;

    if (shouldWrap) {
      pushCurrent();
    }

    current.nodes.push(node);
    current.mainSize = current.nodes.length === 1 ? nodeMain : current.mainSize + mainGap + nodeMain;
    current.crossSize = Math.max(current.crossSize, nodeCross);
  });

  pushCurrent();
  return lines;
};

const applyFlexibleSizingInLine = (
  line: FlexLine,
  mainAxis: Axis,
  targetMainSize: number,
  mainGap: number
) => {
  const gapTotal = Math.max(0, line.nodes.length - 1) * mainGap;
  const currentMain = line.nodes.reduce((sum, node) => sum + getAxisSize(node, mainAxis), 0) + gapTotal;
  const growNodes = line.nodes.filter((node) => getGrowFactor(node, mainAxis) > 0);
  const growTotal = growNodes.reduce((sum, node) => sum + getGrowFactor(node, mainAxis), 0);
  const shrinkNodes = line.nodes.filter((node) => getShrinkFactor(node) > 0);
  const shrinkWeightTotal = shrinkNodes.reduce((sum, node) => sum + getShrinkFactor(node) * getAxisSize(node, mainAxis), 0);

  if (targetMainSize > currentMain + 0.001 && growNodes.length > 0 && growTotal > 0) {
    const extra = targetMainSize - currentMain;
    growNodes.forEach((node) => {
      const delta = extra * (getGrowFactor(node, mainAxis) / growTotal);
      setAxisSize(node, mainAxis, getAxisSize(node, mainAxis) + delta);
    });
  } else if (targetMainSize < currentMain - 0.001 && shrinkNodes.length > 0 && shrinkWeightTotal > 0) {
    const deficit = currentMain - targetMainSize;
    shrinkNodes.forEach((node) => {
      const weight = getShrinkFactor(node) * getAxisSize(node, mainAxis);
      const delta = deficit * (weight / shrinkWeightTotal);
      setAxisSize(node, mainAxis, getAxisSize(node, mainAxis) - delta);
    });
  }

  line.mainSize = line.nodes.reduce((sum, node, index) => {
    return sum + getAxisSize(node, mainAxis) + (index > 0 ? mainGap : 0);
  }, 0);
};

const applyLegacyFillInLine = (
  line: FlexLine,
  mainAxis: Axis,
  targetMainSize: number,
  mainGap: number
) => {
  const fillNodes = line.nodes.filter((node) =>
    getResizingMode(node, mainAxis) === 'fill' &&
    getGrowFactor(node, mainAxis) === 1 &&
    (node.layoutGrow || 0) === 0
  );
  if (fillNodes.length === 0) return;

  const fixedMain = line.nodes
    .filter((node) => !fillNodes.includes(node))
    .reduce((sum, node) => sum + getAxisSize(node, mainAxis), 0);
  const gapTotal = Math.max(0, line.nodes.length - 1) * mainGap;
  const available = Math.max(0, targetMainSize - fixedMain - gapTotal);
  const sizePerFill = available / fillNodes.length;

  fillNodes.forEach((node) => {
    setAxisSize(node, mainAxis, sizePerFill);
  });

  line.mainSize = line.nodes.reduce((sum, node, index) => {
    return sum + getAxisSize(node, mainAxis) + (index > 0 ? mainGap : 0);
  }, 0);
};

export const calculateLayout = (frame: FrameNode, children: SceneNode[]): { frame: FrameNode; children: SceneNode[] } => {
  if (frame.layoutMode === 'none') return { frame, children };

  const updatedFrame = { ...frame };
  const rowGap = Number.isFinite(updatedFrame.rowGap) ? (updatedFrame.rowGap as number) : updatedFrame.gap;
  const columnGap = Number.isFinite(updatedFrame.columnGap) ? (updatedFrame.columnGap as number) : updatedFrame.gap;
  const layoutChildren = children.filter((child) => !child.isAbsolute).map((child) => ({ ...child }));
  const absoluteChildren = children.filter((child) => child.isAbsolute);

  const getInnerWidth = () => Math.max(0, updatedFrame.width - updatedFrame.padding.left - updatedFrame.padding.right);
  const getInnerHeight = () => Math.max(0, updatedFrame.height - updatedFrame.padding.top - updatedFrame.padding.bottom);

  layoutChildren.forEach((child) => {
    if (child.type === 'text') {
      const maxWidth = child.horizontalResizing === 'fixed' ? child.width : undefined;
      measureTextNode(child, maxWidth);
    }
    setAxisSize(child, 'horizontal', child.width);
    setAxisSize(child, 'vertical', child.height);
  });

  if (updatedFrame.layoutMode === 'grid') {
    const itemCount = Math.max(1, layoutChildren.length);
    const fallbackColumns = parseGridDimension(updatedFrame.gridColumns, Math.ceil(Math.sqrt(itemCount)));
    const columnTracks = parseGridTracks(updatedFrame.gridColumns, fallbackColumns);
    const columns = Math.max(1, columnTracks.length);
    const fallbackRows = parseGridDimension(updatedFrame.gridRows, Math.ceil(itemCount / columns));
    const rowTracks = parseGridTracks(updatedFrame.gridRows, fallbackRows);
    const rows = Math.max(1, Math.max(rowTracks.length, Math.ceil(itemCount / columns)));
    const normalizedRows = rowTracks.length >= rows
      ? rowTracks
      : [...rowTracks, ...Array.from({ length: rows - rowTracks.length }, () => '1fr')];

    const maxChildWidth = Math.max(0, ...layoutChildren.map((child) => child.width));
    const maxChildHeight = Math.max(0, ...layoutChildren.map((child) => child.height));
    if (updatedFrame.horizontalResizing === 'hug') {
      updatedFrame.width =
        updatedFrame.padding.left +
        updatedFrame.padding.right +
        columns * maxChildWidth +
        Math.max(0, columns - 1) * columnGap;
    }
    if (updatedFrame.verticalResizing === 'hug') {
      updatedFrame.height =
        updatedFrame.padding.top +
        updatedFrame.padding.bottom +
        rows * maxChildHeight +
        Math.max(0, rows - 1) * rowGap;
    }

    const availableGridWidth = Math.max(0, getInnerWidth() - Math.max(0, columns - 1) * columnGap);
    const availableGridHeight = Math.max(0, getInnerHeight() - Math.max(0, rows - 1) * rowGap);
    const columnWidths = resolveTrackSizes(columnTracks, availableGridWidth);
    const rowHeights = resolveTrackSizes(normalizedRows, availableGridHeight);

    const columnOffsets: number[] = [];
    let runningX = updatedFrame.padding.left;
    for (let index = 0; index < columns; index += 1) {
      columnOffsets.push(runningX);
      runningX += (columnWidths[index] || 0) + columnGap;
    }

    const rowOffsets: number[] = [];
    let runningY = updatedFrame.padding.top;
    for (let index = 0; index < rows; index += 1) {
      rowOffsets.push(runningY);
      runningY += (rowHeights[index] || 0) + rowGap;
    }

    layoutChildren.forEach((child, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const cellWidth = columnWidths[column] || 0;
      const cellHeight = rowHeights[row] || 0;

      if (child.horizontalResizing === 'fill' || updatedFrame.alignItems === 'stretch') {
        setAxisSize(child, 'horizontal', cellWidth);
      }
      if (child.verticalResizing === 'fill' || updatedFrame.alignItems === 'stretch') {
        setAxisSize(child, 'vertical', cellHeight);
      }
      if (child.type === 'text' && child.verticalResizing === 'hug') {
        measureTextNode(child, child.width);
      }

      child.x = columnOffsets[column] || updatedFrame.padding.left;
      child.y = rowOffsets[row] || updatedFrame.padding.top;

      if (updatedFrame.alignItems === 'center' && child.horizontalResizing !== 'fill') {
        child.x += (cellWidth - child.width) / 2;
      } else if (updatedFrame.alignItems === 'end' && child.horizontalResizing !== 'fill') {
        child.x += cellWidth - child.width;
      }
    });
  } else {
    const isHorizontal = updatedFrame.layoutMode === 'horizontal';
    const mainAxis: Axis = isHorizontal ? 'horizontal' : 'vertical';
    const crossAxis: Axis = isHorizontal ? 'vertical' : 'horizontal';
    const mainGap = isHorizontal ? columnGap : rowGap;
    const crossGap = isHorizontal ? rowGap : columnGap;
    const innerMainSize = isHorizontal ? getInnerWidth() : getInnerHeight();
    const innerCrossSize = isHorizontal ? getInnerHeight() : getInnerWidth();
    const frameMainResizing = isHorizontal ? updatedFrame.horizontalResizing : updatedFrame.verticalResizing;
    const frameCrossResizing = isHorizontal ? updatedFrame.verticalResizing : updatedFrame.horizontalResizing;
    const allowWrap = updatedFrame.layoutWrap === 'wrap';
    const wrapLimit = allowWrap && frameMainResizing !== 'hug' ? innerMainSize : Number.POSITIVE_INFINITY;

    const lines = packFlexLines(layoutChildren, mainAxis, crossAxis, mainGap, wrapLimit, allowWrap);
    const lineTargetMain = frameMainResizing === 'hug'
      ? Math.max(0, ...lines.map((line) => line.mainSize), innerMainSize)
      : innerMainSize;
    lines.forEach((line) => {
      line.nodes.forEach((node) => {
        const basis = getFlexBasis(node, mainAxis);
        if (Math.abs(getAxisSize(node, mainAxis) - basis) > 0.001) {
          setAxisSize(node, mainAxis, basis);
        }
      });
      applyFlexibleSizingInLine(line, mainAxis, lineTargetMain, mainGap);
      applyLegacyFillInLine(line, mainAxis, lineTargetMain, mainGap);
      line.crossSize = Math.max(...line.nodes.map((node) => getAxisSize(node, crossAxis)), 0);
    });

    const maxLineMain = Math.max(...lines.map((line) => line.mainSize), 0);
    const totalCross = lines.reduce((sum, line) => sum + line.crossSize, 0) + Math.max(0, lines.length - 1) * crossGap;

    if (frameMainResizing === 'hug') {
      const paddingMainStart = isHorizontal ? updatedFrame.padding.left : updatedFrame.padding.top;
      const paddingMainEnd = isHorizontal ? updatedFrame.padding.right : updatedFrame.padding.bottom;
      const nextMain = maxLineMain + paddingMainStart + paddingMainEnd;
      if (isHorizontal) updatedFrame.width = Math.max(1, nextMain);
      else updatedFrame.height = Math.max(1, nextMain);
    }

    if (frameCrossResizing === 'hug') {
      const paddingCrossStart = isHorizontal ? updatedFrame.padding.top : updatedFrame.padding.left;
      const paddingCrossEnd = isHorizontal ? updatedFrame.padding.bottom : updatedFrame.padding.right;
      const nextCross = totalCross + paddingCrossStart + paddingCrossEnd;
      if (isHorizontal) updatedFrame.height = Math.max(1, nextCross);
      else updatedFrame.width = Math.max(1, nextCross);
    }

    const finalInnerMain = isHorizontal ? getInnerWidth() : getInnerHeight();
    const finalInnerCross = isHorizontal ? getInnerHeight() : getInnerWidth();
    let lineGap = crossGap;
    const lineCrossSizes = lines.map((line) => line.crossSize);
    const baseCross = lineCrossSizes.reduce((sum, size) => sum + size, 0);
    const crossSpace = Math.max(0, finalInnerCross - (baseCross + Math.max(0, lines.length - 1) * crossGap));
    const alignContent = updatedFrame.alignContent || 'start';

    let crossStart = 0;
    if (alignContent === 'center') {
      crossStart = crossSpace / 2;
    } else if (alignContent === 'end') {
      crossStart = crossSpace;
    } else if (alignContent === 'space-between' && lines.length > 1) {
      lineGap = crossGap + crossSpace / (lines.length - 1);
    } else if (alignContent === 'stretch' && lines.length > 0) {
      const extraPerLine = crossSpace / lines.length;
      for (let index = 0; index < lineCrossSizes.length; index += 1) {
        lineCrossSizes[index] += extraPerLine;
      }
    }

    const mainOrigin = isHorizontal ? updatedFrame.padding.left : updatedFrame.padding.top;
    const crossOrigin = isHorizontal ? updatedFrame.padding.top : updatedFrame.padding.left;
    let cursorCross = crossOrigin + crossStart;

    lines.forEach((line, lineIndex) => {
      const lineCrossSize = lineCrossSizes[lineIndex] || line.crossSize;
      const lineMainSize = line.mainSize;
      let cursorMain = mainOrigin;
      let effectiveGap = mainGap;

      if (updatedFrame.justifyContent === 'center') {
        cursorMain = mainOrigin + (finalInnerMain - lineMainSize) / 2;
      } else if (updatedFrame.justifyContent === 'end') {
        cursorMain = mainOrigin + (finalInnerMain - lineMainSize);
      } else if (updatedFrame.justifyContent === 'space-between' && line.nodes.length > 1) {
        const childrenMain = line.nodes.reduce((sum, node) => sum + getAxisSize(node, mainAxis), 0);
        effectiveGap = Math.max(0, (finalInnerMain - childrenMain) / (line.nodes.length - 1));
      }

      line.nodes.forEach((node) => {
        const childCrossResizing = getResizingMode(node, crossAxis);
        const alignSelf = node.layoutAlignSelf && node.layoutAlignSelf !== 'auto'
          ? node.layoutAlignSelf
          : updatedFrame.alignItems;

        if (alignSelf === 'stretch' || childCrossResizing === 'fill') {
          setAxisSize(node, crossAxis, lineCrossSize);
        }

        const childMainSize = getAxisSize(node, mainAxis);
        const childCrossSize = getAxisSize(node, crossAxis);

        let crossOffset = 0;
        if (alignSelf === 'center') {
          crossOffset = (lineCrossSize - childCrossSize) / 2;
        } else if (alignSelf === 'end') {
          crossOffset = lineCrossSize - childCrossSize;
        }

        setAxisPosition(node, mainAxis, cursorMain);
        setAxisPosition(node, crossAxis, cursorCross + crossOffset);
        cursorMain += childMainSize + effectiveGap;
      });

      cursorCross += lineCrossSize + lineGap;
    });
  }

  const resultMap = new Map<string, SceneNode>();
  layoutChildren.forEach((child) => resultMap.set(child.id, child));
  absoluteChildren.forEach((child) => resultMap.set(child.id, child));

  return {
    frame: updatedFrame,
    children: children.map((child) => resultMap.get(child.id) || child),
  };
};
