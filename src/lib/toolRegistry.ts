import type { ToolType } from '../types';

export type ToolGroupId = 'cursor' | 'shape' | 'container' | 'draw' | 'view';

export type DrawingToolType = Extract<ToolType, 'rect' | 'circle' | 'ellipse' | 'text' | 'frame' | 'section' | 'image'>;

export interface ToolDefinition {
  id: ToolType;
  groupId: ToolGroupId;
  label: string;
  shortcutLabel: string;
  shortcutKey: string;
  shiftKey?: boolean;
}

export interface ToolGroupDefinition {
  id: ToolGroupId;
  label: string;
  toolIds: ToolType[];
}

export interface ToolShortcutEventLike {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: 'select', groupId: 'cursor', label: 'Select', shortcutLabel: 'V', shortcutKey: 'v' },
  { id: 'direct-select', groupId: 'cursor', label: 'Direct Select', shortcutLabel: 'A', shortcutKey: 'a' },
  { id: 'scale', groupId: 'cursor', label: 'Scale', shortcutLabel: 'K', shortcutKey: 'k' },
  { id: 'rect', groupId: 'shape', label: 'Rectangle', shortcutLabel: 'R', shortcutKey: 'r' },
  { id: 'circle', groupId: 'shape', label: 'Circle', shortcutLabel: 'O', shortcutKey: 'o' },
  { id: 'ellipse', groupId: 'shape', label: 'Ellipse', shortcutLabel: 'E', shortcutKey: 'e' },
  { id: 'frame', groupId: 'container', label: 'Frame', shortcutLabel: 'F', shortcutKey: 'f' },
  { id: 'section', groupId: 'container', label: 'Section', shortcutLabel: 'Shift+S', shortcutKey: 's', shiftKey: true },
  { id: 'pen', groupId: 'draw', label: 'Pen', shortcutLabel: 'P', shortcutKey: 'p' },
  { id: 'text', groupId: 'draw', label: 'Text', shortcutLabel: 'T', shortcutKey: 't' },
  { id: 'image', groupId: 'draw', label: 'Image', shortcutLabel: 'I', shortcutKey: 'i' },
  { id: 'hand', groupId: 'view', label: 'Hand', shortcutLabel: 'H', shortcutKey: 'h' },
  { id: 'zoom', groupId: 'view', label: 'Zoom', shortcutLabel: 'Z', shortcutKey: 'z' },
];

export const TOOL_GROUPS: ToolGroupDefinition[] = [
  { id: 'cursor', label: 'Select', toolIds: ['select', 'direct-select', 'scale'] },
  { id: 'shape', label: 'Shapes', toolIds: ['rect', 'circle', 'ellipse'] },
  { id: 'container', label: 'Containers', toolIds: ['frame', 'section'] },
  { id: 'draw', label: 'Draw', toolIds: ['pen', 'text', 'image'] },
  { id: 'view', label: 'View', toolIds: ['hand', 'zoom'] },
];

export const isSelectionTool = (tool: ToolType): boolean => {
  return tool === 'select' || tool === 'direct-select' || tool === 'scale';
};

export const isDrawingTool = (tool: ToolType): tool is DrawingToolType => {
  return tool === 'rect' || tool === 'circle' || tool === 'ellipse' || tool === 'text' || tool === 'frame' || tool === 'section' || tool === 'image';
};

export const getToolDefinition = (tool: ToolType): ToolDefinition => {
  return TOOL_DEFINITIONS.find((entry) => entry.id === tool) || TOOL_DEFINITIONS[0];
};

export const getToolGroupForTool = (tool: ToolType): ToolGroupDefinition => {
  return TOOL_GROUPS.find((group) => group.toolIds.includes(tool)) || TOOL_GROUPS[0];
};

export const matchToolShortcut = (event: ToolShortcutEventLike): ToolType | null => {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  const normalizedKey = event.key.toLowerCase();
  const match = TOOL_DEFINITIONS.find((tool) => tool.shortcutKey === normalizedKey && Boolean(tool.shiftKey) === Boolean(event.shiftKey));
  return match?.id || null;
};