import type { ToolType } from './types';

export interface NovaEditorPanelPreset {
  id: 'layers' | 'canvas' | 'properties' | 'chat' | string;
  region: 'left' | 'center' | 'right' | 'bottom';
  visible: boolean;
  width?: number;
  height?: number;
}

export interface NovaEditorToolPreset {
  id: ToolType;
  label: string;
  shortcut?: string;
  group: 'cursor' | 'shape' | 'container' | 'draw' | 'view' | string;
}

export interface NovaEditorPreset {
  version: 1;
  name: string;
  canvas: {
    minZoom: number;
    maxZoom: number;
    defaultZoom: number;
  };
  panels: NovaEditorPanelPreset[];
  tools: NovaEditorToolPreset[];
  bindings: {
    runTurn: 'runNovaTurn';
    mergeNodes: 'mergeGeneratedNodes';
    parser: 'parseHTMLToNodes';
  };
}

export const defaultEditorPreset: NovaEditorPreset = {
  version: 1,
  name: 'nova-default-editor',
  canvas: {
    minZoom: 0.1,
    maxZoom: 8,
    defaultZoom: 1,
  },
  panels: [
    { id: 'layers', region: 'left', visible: true, width: 280 },
    { id: 'canvas', region: 'center', visible: true },
    { id: 'properties', region: 'right', visible: true, width: 320 },
    { id: 'chat', region: 'bottom', visible: true, height: 340 },
  ],
  tools: [
    { id: 'select', label: 'Select', shortcut: 'V', group: 'cursor' },
    { id: 'direct-select', label: 'Direct Select', shortcut: 'A', group: 'cursor' },
    { id: 'scale', label: 'Scale', shortcut: 'K', group: 'cursor' },
    { id: 'rect', label: 'Rectangle', shortcut: 'R', group: 'shape' },
    { id: 'circle', label: 'Circle', shortcut: 'O', group: 'shape' },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'E', group: 'shape' },
    { id: 'frame', label: 'Frame', shortcut: 'F', group: 'container' },
    { id: 'section', label: 'Section', shortcut: 'S', group: 'container' },
    { id: 'pen', label: 'Pen', shortcut: 'P', group: 'draw' },
    { id: 'text', label: 'Text', shortcut: 'T', group: 'draw' },
    { id: 'image', label: 'Image', shortcut: 'I', group: 'draw' },
    { id: 'hand', label: 'Hand', shortcut: 'H', group: 'view' },
    { id: 'zoom', label: 'Zoom', shortcut: 'Z', group: 'view' },
  ],
  bindings: {
    runTurn: 'runNovaTurn',
    mergeNodes: 'mergeGeneratedNodes',
    parser: 'parseHTMLToNodes',
  },
};

export const defaultEditorPresetJson = JSON.stringify(defaultEditorPreset, null, 2);
