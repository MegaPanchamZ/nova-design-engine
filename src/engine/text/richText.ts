import { RichTextDeltaOp, RichTextDocument, RichTextParagraph, RichTextSpan } from '../../types';

export const createRichTextDocument = (text = ''): RichTextDocument => {
  const paragraph: RichTextParagraph = {
    id: crypto.randomUUID(),
    spans: [{ id: crypto.randomUUID(), text }],
    align: 'left',
  };

  return {
    version: 1,
    format: 'tree-v1',
    paragraphs: [paragraph],
    delta: text ? [{ insert: text }] : [],
  };
};

export const toPlainText = (doc: RichTextDocument): string => {
  return doc.paragraphs
    .map((paragraph) => paragraph.spans.map((span) => span.text).join(''))
    .join('\n');
};

export const applyDelta = (doc: RichTextDocument, deltaOps: RichTextDeltaOp[]): RichTextDocument => {
  const baseText = toPlainText(doc);
  let cursor = 0;
  let result = '';

  deltaOps.forEach((op) => {
    if (typeof op.retain === 'number' && op.retain > 0) {
      result += baseText.slice(cursor, cursor + op.retain);
      cursor += op.retain;
      return;
    }

    if (typeof op.delete === 'number' && op.delete > 0) {
      cursor += op.delete;
      return;
    }

    if (typeof op.insert === 'string') {
      result += op.insert;
    }
  });

  result += baseText.slice(cursor);

  const spans: RichTextSpan[] = [{ id: crypto.randomUUID(), text: result }];
  return {
    version: doc.version + 1,
    format: 'delta-v1',
    paragraphs: [{ id: crypto.randomUUID(), spans, align: 'left' }],
    delta: deltaOps,
  };
};
