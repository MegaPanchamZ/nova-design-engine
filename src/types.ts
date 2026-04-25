import { v4 as uuidv4 } from 'uuid';

export type NodeType = 'rect' | 'circle' | 'ellipse' | 'text' | 'path' | 'group' | 'image' | 'boolean' | 'frame' | 'component' | 'instance' | 'section';

export interface Variable {
  id: string;
  name: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  value: unknown;
  modeValues?: Record<string, unknown>; // For Light/Dark modes
}

export interface Style {
  id: string;
  name: string;
  type: 'text' | 'color' | 'effect' | 'layout';
  properties: Record<string, unknown>;
}

export interface RichTextMark {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  letterSpacing?: number;
  color?: string;
}

export interface RichTextSpan {
  id: string;
  text: string;
  marks?: RichTextMark;
}

export interface RichTextParagraph {
  id: string;
  spans: RichTextSpan[];
  align?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  indent?: number;
}

export interface RichTextDeltaOp {
  retain?: number;
  insert?: string | { type: 'embed'; value: string };
  delete?: number;
  attributes?: RichTextMark;
}

export interface RichTextDocument {
  version: number;
  format: 'tree-v1' | 'delta-v1';
  paragraphs: RichTextParagraph[];
  delta?: RichTextDeltaOp[];
}

export interface TextLayoutGlyphRun {
  start: number;
  end: number;
  x: number;
  width: number;
}

export interface TextLayoutLine {
  start: number;
  end: number;
  y: number;
  width: number;
  baseline: number;
  ascent: number;
  descent: number;
  runs: TextLayoutGlyphRun[];
}

export interface TextLayoutMetrics {
  width: number;
  height: number;
  baseline: number;
  ascent: number;
  descent: number;
  lines: TextLayoutLine[];
}

export interface Interaction {
  id: string;
  trigger: 'onClick' | 'onHover' | 'onDrag';
  condition?: {
      variableId: string;
      operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
      value: unknown;
  };
  actions: {
      type: 'navigate' | 'setVariable' | 'toggleVisibility';
      targetId?: string; // Page ID or Node ID or Variable ID
      value?: unknown;
      animation?: 'instant' | 'slide-in' | 'dissolve';
  }[];
}

export interface Paint {
  id: string;
  type: 'solid' | 'gradient-linear' | 'gradient-radial';
  color?: string;
  gradientStops?: { offset: number; color: string }[];
  gradientAngle?: number;
  gradientCenter?: { x: number; y: number };
  gradientRadius?: number;
  opacity: number;
  visible: boolean;
}

export interface Effect {
  id: string;
  type: 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur';
  color?: string;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  visible: boolean;
}

export interface BaseNode {
  id: string;
  type: NodeType;
  parentId?: string;
  masterId?: string; // For Instances to link to Main Component
  instanceOverrides?: Record<string, unknown>;
  variantGroupId?: string;
  variantName?: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  fill: string; // Keep for convenience
  fills?: Paint[];
  stroke: string; // Keep for convenience
  strokes?: Paint[];
  strokeWidth: number;
  strokeAlign?: 'inside' | 'outside' | 'center';
  opacity: number;
  blendMode: 'pass-through' | 'normal' | 'multiply' | 'screen' | 'overlay';
  visible: boolean;
  locked: boolean;
  collapsed?: boolean; // For frames/groups in layers panel
  isMask?: boolean; // If true, this node masks siblings above it
  draggable: boolean;
  isAutoName?: boolean; // For text layers sync
  // Responsive Heuristics
  horizontalResizing: 'fixed' | 'hug' | 'fill';
  verticalResizing: 'fixed' | 'hug' | 'fill';
  isAbsolute?: boolean; // Breaks Auto Layout flow
  layoutAlignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  layoutGrow?: number;
  layoutShrink?: number;
  layoutBasis?: 'auto' | number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  // High-End Rendering
  cornerRadius: number;
  individualCornerRadius?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  cornerSmoothing: number; // 0 to 1
  effects?: Effect[];
  // Interactions
  interactions?: Interaction[];
  variableBindings?: {
    fill?: string;
    stroke?: string;
    opacity?: string;
    text?: string;
  };
}

export interface FrameNode extends BaseNode {
  type: 'frame' | 'section' | 'group' | 'component' | 'instance';
  layoutMode: 'none' | 'horizontal' | 'vertical' | 'grid';
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
  rowGap?: number;
  columnGap?: number;
  layoutWrap?: 'nowrap' | 'wrap';
  alignContent?: 'start' | 'center' | 'end' | 'space-between' | 'stretch';
  justifyContent: 'start' | 'center' | 'end' | 'space-between';
  alignItems: 'start' | 'center' | 'end' | 'stretch';
  clipsContent: boolean;
  // Grid specific
  gridColumns?: number | string; // e.g. 4 or "1fr 1fr 1fr"
  gridRows?: number | string;
}

export interface RectNode extends BaseNode {
  type: 'rect';
  borderRadius: number;
}

export interface CircleNode extends BaseNode {
  type: 'circle';
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
}

export interface PathNode extends BaseNode {
  type: 'path';
  data: string; // SVG path data
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  richText?: RichTextDocument;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  lineHeight?: number;
  align: 'left' | 'center' | 'right';
  writingMode?: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
  textLayoutMetrics?: TextLayoutMetrics;
}

export interface BooleanNode extends BaseNode {
  type: 'boolean';
  operation: 'union' | 'subtract' | 'intersect' | 'exclude';
  children: SceneNode[];
}

export interface Page {
  id: string;
  name: string;
  nodes: SceneNode[];
}

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  imageScaleMode?: 'fill' | 'fit' | 'tile' | 'stretch';
  imageScale?: number;
  imageTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
}

export type SceneNode = RectNode | CircleNode | EllipseNode | TextNode | PathNode | BooleanNode | FrameNode | ImageNode;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type ToolType = 'select' | 'direct-select' | 'scale' | 'pen' | 'rect' | 'circle' | 'ellipse' | 'text' | 'hand' | 'zoom' | 'frame' | 'section' | 'image';

export interface Guide {
  id: string;
  type: 'horizontal' | 'vertical';
  position: number; // canvas space
}

export interface SnapLine {
  x?: number;
  y?: number;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AITweak {
  id: string;
  label: string;
  type: 'slider' | 'color' | 'toggle' | 'action';
  targetNodeId: string;
  targetProperty: string;
  min?: number;
  max?: number;
  value: unknown;
}

export interface ExportOptions {
  type: 'pdf-digital' | 'pdf-print' | 'svg' | 'png' | 'jpg';
  scale?: number;
  includeBleed?: boolean;
  viewBleed?: boolean;
  includeCropMarks?: boolean;
}

export interface DesignState {
  pages: Page[];
  currentPageId: string;
  variables: Variable[];
  styles: Style[];
  selectedIds: string[];
  hoveredId: string | null;
  viewport: Viewport;
  tool: ToolType;
  history: Page[][]; 
  historyIndex: number;
  mode: 'design' | 'prototype' | 'inspect';
  showRulers: boolean;
  guides: Guide[];
  snapLines: SnapLine[];
  aiHistory: AIMessage[];
  aiTweaks: AITweak[];
}

export const createDefaultNode = (type: NodeType, x: number, y: number, id?: string): SceneNode => {
  const base: BaseNode = {
    id: id || uuidv4(),
    type,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)}`,
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 1,
    opacity: 1,
      blendMode: 'normal',
    visible: true,
    locked: false,
    draggable: true,
    horizontalResizing: 'fixed',
    verticalResizing: 'fixed',
    isAbsolute: false,
    layoutAlignSelf: 'auto',
    layoutGrow: 0,
    layoutShrink: 1,
    layoutBasis: 'auto',
    minWidth: 0,
    maxWidth: Number.POSITIVE_INFINITY,
    minHeight: 0,
    maxHeight: Number.POSITIVE_INFINITY,
    cornerRadius: 0,
    individualCornerRadius: {
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    },
    cornerSmoothing: 0,
    fills: [{ id: uuidv4(), type: 'solid', color: '#ffffff', opacity: 1, visible: true }],
    strokes: [],
    effects: [],
    interactions: [],
    variableBindings: {},
  };

  switch (type) {
    case 'rect':
      return { ...base, type: 'rect', borderRadius: 0 } as RectNode;
    case 'circle':
      return { ...base, type: 'circle' } as CircleNode;
    case 'ellipse':
      return { ...base, type: 'ellipse', radiusX: 50, radiusY: 30 } as EllipseNode;
    case 'path':
      return { ...base, type: 'path', data: '' } as PathNode;
    case 'frame':
    case 'section':
    case 'group':
    case 'component':
    case 'instance':
      return { 
        ...base, 
        type,
        layoutMode: 'none', 
        padding: { top: 0, right: 0, bottom: 0, left: 0 }, 
        gap: 0,
        rowGap: undefined,
        columnGap: undefined,
        layoutWrap: 'nowrap',
        alignContent: 'start',
        justifyContent: 'start',
        alignItems: 'start',
        clipsContent: type === 'group' ? false : true,
        gridColumns: 1,
        gridRows: 1,
        fill: 'transparent',
        fills: [],
        stroke: type === 'component' || type === 'instance' ? '#A855F7' : '#7D7D7D',
        strokeWidth: type === 'frame' || type === 'section' || type === 'component' ? 1 : 0
      } as FrameNode;
    case 'image':
      return { ...base, type: 'image', src: '', fill: '#E5E7EB', strokeWidth: 0, imageScaleMode: 'fill', imageScale: 1 } as ImageNode;
    case 'boolean':
      return { ...base, type: 'boolean', operation: 'union', children: [] } as BooleanNode;
    case 'text':
      return {
        ...base,
        type: 'text',
        isAutoName: true,
        text: 'Type something',
        fontSize: 20,
        fontFamily: 'Inter',
        fontStyle: 'normal',
        lineHeight: 28, // 1.4 * 20
        align: 'left',
        strokeWidth: 0,
        horizontalResizing: 'hug',
        verticalResizing: 'hug',
      } as TextNode;
    default:
      throw new Error(`Unsupported node type: ${type}`);
  }
};
