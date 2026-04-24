import { Paint, SceneNode } from '../types';

const toRgba = (color: string, opacity: number): string => {
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (safeOpacity >= 0.999) return color;

  const hex = color.trim().match(/^#([\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length <= 4 ? raw.split('').map((c) => c + c).join('') : raw;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    const sourceAlpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    const alpha = Math.min(1, Math.max(0, sourceAlpha * safeOpacity));
    return `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
  }

  return color;
};

const paintToCssBackground = (paint: Paint): string => {
  const opacity = paint.opacity ?? 1;
  if (paint.type === 'solid') {
    return toRgba(paint.color || '#D9D9D9', opacity);
  }

  const stops = (paint.gradientStops || [])
    .map((stop) => `${stop.color} ${Math.round(Math.min(1, Math.max(0, stop.offset)) * 100)}%`)
    .join(', ');

  if (paint.type === 'gradient-radial') {
    const center = paint.gradientCenter || { x: 0.5, y: 0.5 };
    const radius = Math.min(1, Math.max(0.05, paint.gradientRadius ?? 0.5));
    return `radial-gradient(circle ${Math.round(radius * 100)}% at ${Math.round(center.x * 100)}% ${Math.round(center.y * 100)}%, ${stops || '#FFFFFF 0%, #000000 100%'})`;
  }

  const angle = Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 0;
  return `linear-gradient(${angle}deg, ${stops || '#FFFFFF 0%, #000000 100%'})`;
};

const nodeBackgroundCss = (node: SceneNode): string => {
  const fills = (node.fills || []).filter((paint) => paint.visible !== false);
  if (fills.length === 0) return node.fill;

  return fills
    .slice()
    .reverse()
    .map((paint) => paintToCssBackground(paint))
    .join(', ');
};

export const nodesToHtmlContext = (nodes: SceneNode[]): string => {
  const buildHTML = (id?: string): string => {
    const children = nodes.filter((node) => node.parentId === id);
    return children
      .map((node) => {
        const background = nodeBackgroundCss(node);
        const style = `position: absolute; left: ${Math.round(node.x)}px; top: ${Math.round(node.y)}px; width: ${Math.round(node.width)}px; height: ${Math.round(node.height)}px; background: ${background};`;

        if (node.type === 'text') {
          return `<p id="${node.id}" style="${style} font-size: ${node.fontSize}px; font-family: ${node.fontFamily};">${node.text}</p>`;
        }

        if (node.type === 'image') {
          return `<img id="${node.id}" src="${node.src}" style="${style}" />`;
        }

        if (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
          const flexDirection = node.layoutMode === 'vertical' ? 'column' : 'row';
          return `<div id="${node.id}" style="${style} border-radius: ${node.cornerRadius}px; display: flex; flex-direction: ${flexDirection}; gap: ${node.gap}px;">${buildHTML(node.id)}</div>`;
        }

        return `<div id="${node.id}" style="${style}"></div>`;
      })
      .join('\n');
  };

  return buildHTML();
};
