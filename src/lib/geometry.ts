export const getSuperellipsePath = (width: number, height: number, radius: number, smoothing: number): string => {
  const safeWidth = Math.max(1, Math.abs(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.abs(Number.isFinite(height) ? height : 1));
  const maxRadius = Math.min(safeWidth, safeHeight) / 2;
  const safeRadius = Math.min(maxRadius, Math.max(0, Number.isFinite(radius) ? radius : 0));

  if (smoothing <= 0) {
    // Normal rect with some radius
    return `M ${safeRadius} 0 L ${safeWidth - safeRadius} 0 A ${safeRadius} ${safeRadius} 0 0 1 ${safeWidth} ${safeRadius} L ${safeWidth} ${safeHeight - safeRadius} A ${safeRadius} ${safeRadius} 0 0 1 ${safeWidth - safeRadius} ${safeHeight} L ${safeRadius} ${safeHeight} A ${safeRadius} ${safeRadius} 0 0 1 0 ${safeHeight - safeRadius} L 0 ${safeRadius} A ${safeRadius} ${safeRadius} 0 0 1 ${safeRadius} 0 Z`;
  }

  // Approximation of Figma's corner smoothing
  // We use a cubic bezier approximation for the super-ellipse
  // The 'smoothing' factor pushes the control points of the corner further into the straight lines
  const s = Math.min(Math.max(smoothing, 0), 1);
  const r = safeRadius;
  
  // Extension factor for the curve
  const e = r * (1 + s);
  
  // Bezier handle length approximation... 0.5517 is the circle approximation
  const k = 0.5517 * (1 - s); 
  
  const p1 = r; // curve start
  const p2 = e; // curve influence

  return `
    M ${e} 0
    L ${safeWidth - e} 0
    C ${safeWidth - e + e*k} 0, ${safeWidth} ${e - e*k}, ${safeWidth} ${e}
    L ${safeWidth} ${safeHeight - e}
    C ${safeWidth} ${safeHeight - e + e*k}, ${safeWidth - e + e*k} ${safeHeight}, ${safeWidth - e} ${safeHeight}
    L ${e} ${safeHeight}
    C ${e - e*k} ${safeHeight}, 0 ${safeHeight - e + e*k}, 0 ${safeHeight - e}
    L 0 ${e}
    C 0 ${e - e*k}, ${e - e*k} 0, ${e} 0
    Z
  `.replace(/\s+/g, ' ').trim();
};
