import { RichTextDocument, TextLayoutLine, TextLayoutMetrics } from '../../types';

export interface TextLayoutOptions {
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
}

interface TextSegment {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

const fallbackMeasure = (text: string, fontSize: number) => ({
  width: text.length * Math.max(1, fontSize * 0.56),
  ascent: fontSize * 0.8,
  descent: fontSize * 0.2,
});

const getMeasureContext = (): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(1, 1);
    return canvas.getContext('2d');
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    return canvas.getContext('2d');
  }

  return null;
};

const measureSegment = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  text: string,
  segment: TextSegment
) => {
  if (!ctx) return fallbackMeasure(text, segment.fontSize);

  const family = segment.fontFamily || 'Inter';
  ctx.font = `${segment.fontStyle} ${segment.fontWeight} ${segment.fontSize}px ${family}`;
  const metrics = ctx.measureText(text || ' ');

  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
    ? metrics.actualBoundingBoxAscent
    : segment.fontSize * 0.8;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
    ? metrics.actualBoundingBoxDescent
    : segment.fontSize * 0.2;

  return {
    width: metrics.width,
    ascent,
    descent,
  };
};

const collectSegments = (doc: RichTextDocument, options: TextLayoutOptions): TextSegment[] => {
  const segments: TextSegment[] = [];
  const defaultFontFamily = options.fontFamily || 'Inter';
  const defaultWeight = options.fontWeight || 400;
  const defaultStyle = options.fontStyle || 'normal';

  doc.paragraphs.forEach((paragraph, paragraphIndex) => {
    paragraph.spans.forEach((span) => {
      segments.push({
        text: span.text,
        fontSize: span.marks?.fontSize || options.fontSize,
        fontFamily: span.marks?.fontFamily || defaultFontFamily,
        fontWeight: span.marks?.fontWeight || defaultWeight,
        fontStyle: span.marks?.fontStyle || defaultStyle,
      });
    });

    if (paragraphIndex < doc.paragraphs.length - 1) {
      segments.push({
        text: '\n',
        fontSize: options.fontSize,
        fontFamily: defaultFontFamily,
        fontWeight: defaultWeight,
        fontStyle: defaultStyle,
      });
    }
  });

  return segments;
};

export const computeTextLayout = (doc: RichTextDocument, options: TextLayoutOptions): TextLayoutMetrics => {
  const ctx = getMeasureContext();
  const lineHeight = Math.max(1, options.lineHeight);
  const maxWidth = Math.max(1, options.maxWidth);
  const segments = collectSegments(doc, options);

  const lines: TextLayoutLine[] = [];
  let globalOffset = 0;
  let lineStart = 0;
  let lineWidth = 0;
  let lineAscent = 0;
  let lineDescent = 0;
  let lineRuns: TextLayoutLine['runs'] = [];

  const commitLine = () => {
    const index = lines.length;
    const y = index * lineHeight;
    const ascent = lineAscent || options.fontSize * 0.8;
    const descent = lineDescent || options.fontSize * 0.2;

    lines.push({
      start: lineStart,
      end: globalOffset,
      y,
      width: lineWidth,
      baseline: y + ascent,
      ascent,
      descent,
      runs: lineRuns,
    });

    lineStart = globalOffset;
    lineWidth = 0;
    lineAscent = 0;
    lineDescent = 0;
    lineRuns = [];
  };

  segments.forEach((segment) => {
    const parts = segment.text.split(/(\s+)/).filter((token) => token.length > 0);
    const tokens = parts.length > 0 ? parts : [''];

    tokens.forEach((token) => {
      if (token === '\n') {
        commitLine();
        globalOffset += 1;
        lineStart = globalOffset;
        return;
      }

      const measured = measureSegment(ctx, token, segment);
      if (lineWidth > 0 && lineWidth + measured.width > maxWidth) {
        commitLine();
      }

      lineRuns.push({
        start: globalOffset,
        end: globalOffset + token.length,
        x: lineWidth,
        width: measured.width,
      });

      lineWidth += measured.width;
      lineAscent = Math.max(lineAscent, measured.ascent);
      lineDescent = Math.max(lineDescent, measured.descent);
      globalOffset += token.length;
    });
  });

  if (lineRuns.length > 0 || lines.length === 0) {
    commitLine();
  }

  const width = lines.reduce((max, line) => Math.max(max, line.width), 0);
  const height = Math.max(lineHeight, lines.length * lineHeight);
  const ascent = lines[0]?.ascent || options.fontSize * 0.8;
  const descent = lines[0]?.descent || options.fontSize * 0.2;

  return {
    width,
    height,
    baseline: ascent,
    ascent,
    descent,
    lines,
  };
};
