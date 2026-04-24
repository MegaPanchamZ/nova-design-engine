import { prepareWithSegments, measureNaturalWidth, layout, measureLineStats } from '@chenglou/pretext';

export const measureText = (text: string, fontSize: number, fontFamily: string, maxWidth?: number, lineHeight?: number): { width: number, height: number } => {
  if (!text) return { width: 0, height: 0 };
  
  // Normalize font string for Canvas-based measurement in pretext
  const fontString = `${fontSize}px "${fontFamily}", sans-serif`;
  const lh = lineHeight ?? Math.round(fontSize * 1.4);
  
  try {
    const prepared = prepareWithSegments(text, fontString);
    const preparedForLayout = prepared as unknown as Parameters<typeof layout>[0];
    
    if (!maxWidth || maxWidth === Infinity || maxWidth <= 0) {
      const naturalWidth = measureNaturalWidth(prepared);
      // Even with natural width, we might have hard breaks (\n)
      const result = layout(preparedForLayout, naturalWidth + 2, lh);
      return {
        width: Math.ceil(naturalWidth) + 4, // 4px buffer total (padding + rendering)
        height: Math.ceil(result.height || lh)
      };
    } else {
      // Pass slightly less width to account for padding when measuring wrap
      const effectiveMaxWidth = Math.max(1, maxWidth - 4);
      const stats = measureLineStats(prepared, effectiveMaxWidth);
      const result = layout(preparedForLayout, effectiveMaxWidth, lh);
      
      return {
        width: Math.ceil(stats.maxLineWidth) + 4,
        height: Math.ceil(result.height || lh)
      };
    }
  } catch (e) {
    console.error("Pretext measurement failed, falling back", e);
    // Fallback if Intl.Segmenter is missing or other issues
    return {
      width: maxWidth || text.length * (fontSize * 0.6),
      height: lh
    };
  }
};

