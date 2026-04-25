import { describe, expect, it } from 'vitest';
import { getToolGroupForTool, isDrawingTool, isSelectionTool, matchToolShortcut } from './toolRegistry';

describe('toolRegistry', () => {
  it('matches plain and shifted tool shortcuts', () => {
    expect(matchToolShortcut({ key: 'v', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe('select');
    expect(matchToolShortcut({ key: 'S', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false })).toBe('section');
    expect(matchToolShortcut({ key: 's', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBeNull();
  });

  it('classifies selection and drawing tools correctly', () => {
    expect(isSelectionTool('scale')).toBe(true);
    expect(isSelectionTool('pen')).toBe(false);
    expect(isDrawingTool('frame')).toBe(true);
    expect(isDrawingTool('zoom')).toBe(false);
    expect(getToolGroupForTool('pen').id).toBe('draw');
  });
});