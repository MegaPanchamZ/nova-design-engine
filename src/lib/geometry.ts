export const getSuperellipsePath = (width: number, height: number, radius: number, smoothing: number): string => {
  if (smoothing <= 0) {
    // Normal rect with some radius
    return `M ${radius} 0 L ${width - radius} 0 A ${radius} ${radius} 0 0 1 ${width} ${radius} L ${width} ${height - radius} A ${radius} ${radius} 0 0 1 ${width - radius} ${height} L ${radius} ${height} A ${radius} ${radius} 0 0 1 0 ${height - radius} L 0 ${radius} A ${radius} ${radius} 0 0 1 ${radius} 0 Z`;
  }

  // Approximation of Figma's corner smoothing
  // We use a cubic bezier approximation for the super-ellipse
  // The 'smoothing' factor pushes the control points of the corner further into the straight lines
  const s = Math.min(Math.max(smoothing, 0), 1);
  const r = Math.min(radius, Math.min(width, height) / 2);
  
  // Extension factor for the curve
  const e = r * (1 + s);
  
  // Bezier handle length approximation... 0.5517 is the circle approximation
  const k = 0.5517 * (1 - s); 
  
  const p1 = r; // curve start
  const p2 = e; // curve influence

  return `
    M ${e} 0
    L ${width - e} 0
    C ${width - e + e*k} 0, ${width} ${e - e*k}, ${width} ${e}
    L ${width} ${height - e}
    C ${width} ${height - e + e*k}, ${width - e + e*k} ${height}, ${width - e} ${height}
    L ${e} ${height}
    C ${e - e*k} ${height}, 0 ${height - e + e*k}, 0 ${height - e}
    L 0 ${e}
    C 0 ${e - e*k}, ${e - e*k} 0, ${e} 0
    Z
  `.replace(/\s+/g, ' ').trim();
};
