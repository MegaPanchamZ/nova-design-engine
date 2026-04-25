import { describe, expect, it } from 'vitest';
import { applyDelta, createRichTextDocument, toPlainText } from './richText';

describe('richText', () => {
  it('creates a default document', () => {
    const doc = createRichTextDocument('Hello');
    expect(doc.paragraphs).toHaveLength(1);
    expect(toPlainText(doc)).toBe('Hello');
  });

  it('applies simple retain/delete/insert deltas', () => {
    const doc = createRichTextDocument('Hello world');
    const next = applyDelta(doc, [{ retain: 6 }, { delete: 5 }, { insert: 'Nova' }]);
    expect(toPlainText(next)).toBe('Hello Nova');
    expect(next.format).toBe('delta-v1');
  });
});
