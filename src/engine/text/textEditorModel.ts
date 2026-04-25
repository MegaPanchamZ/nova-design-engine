import { RichTextDeltaOp, RichTextDocument } from '../../types';
import { applyDelta, toPlainText } from './richText';

export interface TextSelection {
  anchor: number;
  focus: number;
}

export interface TextEditorState {
  doc: RichTextDocument;
  selection: TextSelection;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const moveCursor = (state: TextEditorState, delta: number): TextEditorState => {
  const text = toPlainText(state.doc);
  const next = clamp(state.selection.focus + delta, 0, text.length);
  return {
    ...state,
    selection: { anchor: next, focus: next },
  };
};

export const insertText = (state: TextEditorState, value: string): TextEditorState => {
  const text = toPlainText(state.doc);
  const start = Math.min(state.selection.anchor, state.selection.focus);
  const end = Math.max(state.selection.anchor, state.selection.focus);

  const ops: RichTextDeltaOp[] = [];
  if (start > 0) ops.push({ retain: start });
  if (end > start) ops.push({ delete: end - start });
  ops.push({ insert: value });

  const doc = applyDelta(state.doc, ops);
  const cursor = clamp(start + value.length, 0, text.length + value.length);

  return {
    doc,
    selection: { anchor: cursor, focus: cursor },
  };
};
