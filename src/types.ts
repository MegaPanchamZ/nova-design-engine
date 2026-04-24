import { v4 as uuidv4 } from 'uuid';

export type NodeType = 'rect' | 'circle' | 'ellipse' | 'text' | 'path' | 'group' | 'image' | 'boolean' | 'frame' | 'component' | 'instance' | 'section';

export interface Variable {
  id: string;
  name: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  value: any;
  modeValues?: Record<string, any>; // For Light/Dark modes
}

export interface Style {
  id: string;
  name: string;
  type: 'text' | 'color' | 'effect' | 'layout';
  properties: any;
}

export interface Interaction {
  id: string;
  trigger: 'onClick' | 'onHover' | 'onDrag';
  condition?: {
      variableId: string;
      operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
      value: any;
  };
  actions: {
      type: 'navigate' | 'setVariable' | 'toggleVisibility';
      targetId?: string; // Page ID or Node ID or Variable ID
      value?: any;
  }[];
}

export interface Paint {
  id: string;
  type: 'solid' | 'gradient-linear' | 'gradient-radial';
  color?: string;
  gradientStops?: { offset: number; color: string }[];
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
}

export interface FrameNode extends BaseNode {
  type: 'frame';
  layoutMode: 'none' | 'horizontal' | 'vertical' | 'grid';
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
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
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  lineHeight?: number;
  align: 'left' | 'center' | 'right';
  writingMode?: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
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
  imageScaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  imageScale?: number;
  imageTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
}

export type SceneNode = RectNode | CircleNode | EllipseNode | TextNode | PathNode | BooleanNode | FrameNode | ImageNode | any;

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
  value: any;
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
    visible: true,
    locked: false,
    draggable: true,
    horizontalResizing: 'fixed',
    verticalResizing: 'fixed',
    isAbsolute: false,
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
      return { 
        ...base, 
        type: 'frame', 
        layoutMode: 'none', 
        padding: { top: 0, right: 0, bottom: 0, left: 0 }, 
        gap: 0,
        justifyContent: 'start',
        alignItems: 'start',
        clipsContent: true,
        gridColumns: 1,
        gridRows: 1,
        fill: '#f0f0f000', // Transparent default
        stroke: '#A1A1A1',
        strokeWidth: 0 // Default to 0 as per user request
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
