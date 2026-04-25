import { RichTextDocument, TextLayoutLine, TextLayoutMetrics } from '../../types';

export interface TextLayoutOptions {
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
}

const averageGlyphWidth = (fontSize: number): number => Math.max(1, fontSize * 0.56);

export const computeTextLayout = (doc: RichTextDocument, options: TextLayoutOptions): TextLayoutMetrics => {
  const glyph = averageGlyphWidth(options.fontSize);
  const maxCharsPerLine = Math.max(1, Math.floor(options.maxWidth / glyph));

  const lines: TextLayoutLine[] = [];
  let globalOffset = 0;

  doc.paragraphs.forEach((paragraph) => {
    const text = paragraph.spans.map((span) => span.text).join('');
    const words = text.split(/(\s+)/).filter((token) => token.length > 0);

    let lineText = '';
    let lineStart = globalOffset;

    words.forEach((word) => {
      const candidate = lineText + word;
      if (candidate.length > maxCharsPerLine && lineText.length > 0) {
        const index = lines.length;
        const width = lineText.length * glyph;
        const y = index * options.lineHeight;
        lines.push({
          start: lineStart,
          end: lineStart + lineText.length,
          y,
          width,
          baseline: y + options.fontSize,
          ascent: options.fontSize * 0.8,
          descent: options.fontSize * 0.2,
          runs: [{ start: lineStart, end: lineStart + lineText.length, x: 0, width }],
        });
        lineStart += lineText.length;
        lineText = word;
      } else {
        lineText = candidate;
      }
    });

    if (lineText.length > 0) {
      const index = lines.length;
      const width = lineText.length * glyph;
      const y = index * options.lineHeight;
      lines.push({
        start: lineStart,
        end: lineStart + lineText.length,
        y,
        width,
        baseline: y + options.fontSize,
        ascent: options.fontSize * 0.8,
        descent: options.fontSize * 0.2,
        runs: [{ start: lineStart, end: lineStart + lineText.length, x: 0, width }],
      });
      lineStart += lineText.length;
    }

    globalOffset = lineStart + 1;
  });

  const width = lines.reduce((max, line) => Math.max(max, line.width), 0);
  const height = lines.length * options.lineHeight;
  const ascent = options.fontSize * 0.8;
  const descent = options.fontSize * 0.2;

  return {
    width,
    height,
    baseline: ascent,
    ascent,
    descent,
    lines,
  };
};
