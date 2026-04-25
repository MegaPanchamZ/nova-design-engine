import { SceneNode, FrameNode, TextNode } from '../types';
import { buildMaskingRuns } from './masking';

export interface CssExportResult {
  css: string;
  html: string;
}

const LAYOUT_VALUE_MAP = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  'space-between': 'space-between',
} as const;

const sanitizeClassName = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'node';
};

const toClassName = (node: SceneNode): string => {
  return `nova-${sanitizeClassName(node.name)}-${sanitizeClassName(node.id.slice(0, 8))}`;
};

const toPixel = (value: number): string => {
  return `${Math.round(value * 1000) / 1000}px`;
};

const isFrameLike = (node: SceneNode): node is FrameNode => {
  return node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance';
};

const asTransform = (node: SceneNode): string | null => {
  const transforms: string[] = [];
  if (Math.abs(node.rotation) > 0.001) transforms.push(`rotate(${node.rotation}deg)`);
  if (Math.abs(node.scaleX - 1) > 0.001 || Math.abs(node.scaleY - 1) > 0.001) {
    transforms.push(`scale(${node.scaleX}, ${node.scaleY})`);
  }

  return transforms.length > 0 ? transforms.join(' ') : null;
};

const getVisibleFills = (node: SceneNode) => {
  const visible = (node.fills || []).filter((paint) => paint.visible !== false);
  if (visible.length > 0) return visible;
  if (node.fill && node.fill !== 'transparent') {
    return [{ type: 'solid' as const, color: node.fill, opacity: 1, visible: true, id: `${node.id}-fallback` }];
  }
  return [];
};

const getVisibleStrokes = (node: SceneNode) => {
  const visible = (node.strokes || []).filter((paint) => paint.visible !== false);
  if (visible.length > 0) return visible;
  if (node.stroke && node.strokeWidth > 0) {
    return [{ type: 'solid' as const, color: node.stroke, opacity: 1, visible: true, id: `${node.id}-fallback` }];
  }
  return [];
};

const paintToBackground = (paint: ReturnType<typeof getVisibleFills>[number]): string | null => {
  if (paint.type === 'solid') {
    return paint.color || null;
  }

  if (paint.type === 'gradient-linear') {
    const angle = Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 90;
    const stops = (paint.gradientStops || [])
      .map((stop) => `${stop.color} ${Math.round((stop.offset || 0) * 100)}%`)
      .join(', ');
    return `linear-gradient(${angle}deg, ${stops || '#fff 0%, #000 100%'})`;
  }

  if (paint.type === 'gradient-radial') {
    const center = paint.gradientCenter || { x: 0.5, y: 0.5 };
    const radius = Math.round((paint.gradientRadius || 0.5) * 100);
    const stops = (paint.gradientStops || [])
      .map((stop) => `${stop.color} ${Math.round((stop.offset || 0) * 100)}%`)
      .join(', ');
    return `radial-gradient(circle ${radius}% at ${Math.round(center.x * 100)}% ${Math.round(center.y * 100)}%, ${stops || '#fff 0%, #000 100%'})`;
  }

  return null;
};

const styleDeclarationsForNode = (
  node: SceneNode,
  parent: SceneNode | undefined,
  hasAutoLayoutParent: boolean
): string[] => {
  const declarations: string[] = [];

  const isAbsolute = !hasAutoLayoutParent || node.isAbsolute;
  declarations.push(`position: ${isAbsolute ? 'absolute' : 'relative'}`);
  declarations.push(`left: ${toPixel(node.x)}`);
  declarations.push(`top: ${toPixel(node.y)}`);
  declarations.push(`width: ${toPixel(node.width)}`);
  declarations.push(`height: ${toPixel(node.height)}`);
  declarations.push(`opacity: ${node.opacity}`);
  declarations.push(`box-sizing: border-box`);

  const fills = getVisibleFills(node);
  const backgrounds = fills
    .map((paint) => paintToBackground(paint))
    .filter((value): value is string => Boolean(value));

  if (backgrounds.length > 0) {
    declarations.push(`background: ${backgrounds.join(', ')}`);
  } else if (node.type === 'text') {
    declarations.push('background: transparent');
  }

  const strokes = getVisibleStrokes(node);
  if (node.strokeWidth > 0 && strokes.length > 0) {
    const topStroke = strokes[strokes.length - 1];
    const strokeColor = topStroke.type === 'solid' ? topStroke.color || node.stroke : node.stroke;
    declarations.push(`border: ${toPixel(node.strokeWidth)} solid ${strokeColor}`);
  } else {
    declarations.push('border: none');
  }

  const hasIndividualCorners = node.individualCornerRadius && (
    node.individualCornerRadius.topLeft !== node.individualCornerRadius.topRight ||
    node.individualCornerRadius.topLeft !== node.individualCornerRadius.bottomRight ||
    node.individualCornerRadius.topLeft !== node.individualCornerRadius.bottomLeft
  );

  if (hasIndividualCorners && node.individualCornerRadius) {
    declarations.push(
      `border-radius: ${toPixel(node.individualCornerRadius.topLeft)} ${toPixel(node.individualCornerRadius.topRight)} ${toPixel(node.individualCornerRadius.bottomRight)} ${toPixel(node.individualCornerRadius.bottomLeft)}`
    );
  } else {
    declarations.push(`border-radius: ${toPixel(node.cornerRadius || 0)}`);
  }

  const transform = asTransform(node);
  if (transform) declarations.push(`transform: ${transform}`);

  if (node.type === 'text') {
    const text = node as TextNode;
    declarations.push(`color: ${node.fill || '#111111'}`);
    declarations.push(`font-family: ${text.fontFamily}`);
    declarations.push(`font-size: ${toPixel(text.fontSize)}`);
    declarations.push(`font-style: ${text.fontStyle || 'normal'}`);
    declarations.push(`text-align: ${text.align}`);
    if (text.lineHeight) declarations.push(`line-height: ${toPixel(text.lineHeight)}`);
    declarations.push('white-space: pre-wrap');
  }

  if (isFrameLike(node)) {
    if (node.layoutMode === 'horizontal' || node.layoutMode === 'vertical') {
      declarations.push('display: flex');
      declarations.push(`flex-direction: ${node.layoutMode === 'vertical' ? 'column' : 'row'}`);
      declarations.push(`justify-content: ${LAYOUT_VALUE_MAP[node.justifyContent] || 'flex-start'}`);
      declarations.push(`align-items: ${LAYOUT_VALUE_MAP[node.alignItems] || 'flex-start'}`);
      declarations.push(`flex-wrap: ${node.layoutWrap === 'wrap' ? 'wrap' : 'nowrap'}`);
      const rowGap = typeof node.rowGap === 'number' ? node.rowGap : node.gap;
      const columnGap = typeof node.columnGap === 'number' ? node.columnGap : node.gap;
      declarations.push(`row-gap: ${toPixel(rowGap)}`);
      declarations.push(`column-gap: ${toPixel(columnGap)}`);
    }

    if (node.layoutMode === 'grid') {
      declarations.push('display: grid');
      if (typeof node.gridColumns === 'number') {
        declarations.push(`grid-template-columns: repeat(${Math.max(1, Math.floor(node.gridColumns))}, minmax(0, 1fr))`);
      } else if (typeof node.gridColumns === 'string' && node.gridColumns.trim().length > 0) {
        declarations.push(`grid-template-columns: ${node.gridColumns}`);
      }

      if (typeof node.gridRows === 'number') {
        declarations.push(`grid-template-rows: repeat(${Math.max(1, Math.floor(node.gridRows))}, minmax(0, 1fr))`);
      } else if (typeof node.gridRows === 'string' && node.gridRows.trim().length > 0) {
        declarations.push(`grid-template-rows: ${node.gridRows}`);
      }

      const rowGap = typeof node.rowGap === 'number' ? node.rowGap : node.gap;
      const columnGap = typeof node.columnGap === 'number' ? node.columnGap : node.gap;
      declarations.push(`row-gap: ${toPixel(rowGap)}`);
      declarations.push(`column-gap: ${toPixel(columnGap)}`);
    }

    declarations.push(
      `padding: ${toPixel(node.padding.top)} ${toPixel(node.padding.right)} ${toPixel(node.padding.bottom)} ${toPixel(node.padding.left)}`
    );
    if (node.clipsContent) declarations.push('overflow: hidden');
  }

  if (!isAbsolute && parent && isFrameLike(parent)) {
    if (node.horizontalResizing === 'fill') declarations.push('flex: 1 1 0%');
    if (node.horizontalResizing === 'hug') declarations.push('width: max-content');
    if (node.verticalResizing === 'hug' && node.type === 'text') declarations.push('height: max-content');
    if (node.layoutAlignSelf && node.layoutAlignSelf !== 'auto') {
      declarations.push(`align-self: ${LAYOUT_VALUE_MAP[node.layoutAlignSelf] || 'auto'}`);
    }
  }

  if (node.isMask) {
    declarations.push('pointer-events: none');
    declarations.push('mix-blend-mode: normal');
  }

  return declarations;
};

const htmlEscape = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const exportNodesToCss = (nodes: SceneNode[]): CssExportResult => {
  const orderedNodes = [...nodes];
  const childrenByParent = new Map<string | undefined, SceneNode[]>();
  const classById = new Map<string, string>();
  const cssRules: string[] = [];

  orderedNodes.forEach((node) => {
    const key = node.parentId;
    const children = childrenByParent.get(key) || [];
    children.push(node);
    childrenByParent.set(key, children);
    classById.set(node.id, toClassName(node));
  });

  const buildCss = (parentId: string | undefined, parentNode: SceneNode | undefined) => {
    const children = childrenByParent.get(parentId) || [];

    children.forEach((node) => {
      const className = classById.get(node.id) || toClassName(node);
      const hasAutoLayoutParent = Boolean(parentNode && isFrameLike(parentNode) && parentNode.layoutMode !== 'none');
      const declarations = styleDeclarationsForNode(node, parentNode, hasAutoLayoutParent);
      cssRules.push(`.${className} { ${declarations.join('; ')}; }`);
      buildCss(node.id, node);
    });
  };

  const renderNode = (node: SceneNode): string => {
    const className = classById.get(node.id) || toClassName(node);
    const children = childrenByParent.get(node.id) || [];

    if (node.type === 'text') {
      const textNode = node as TextNode;
      return `<div class="${className}">${htmlEscape(textNode.text || '')}</div>`;
    }

    if (children.length === 0) {
      if (node.type === 'image') {
        const src = 'src' in node ? htmlEscape(node.src || '') : '';
        return `<div class="${className}">${src ? `<img src="${src}" alt="" />` : ''}</div>`;
      }
      return `<div class="${className}"></div>`;
    }

    const childRuns = buildMaskingRuns(children);
    const childHtml = childRuns
      .map((run) => {
        if (run.type === 'normal') return renderNode(run.node);

        const maskClass = classById.get(run.mask.id) || toClassName(run.mask);
        const runClass = `${maskClass}__mask-run`;
        const maskedChildren = run.maskedNodes.map((child) => renderNode(child)).join('');
        const radius = run.mask.cornerRadius || 0;
        cssRules.push(`.${runClass} { position: absolute; left: ${toPixel(run.mask.x)}; top: ${toPixel(run.mask.y)}; width: ${toPixel(run.mask.width)}; height: ${toPixel(run.mask.height)}; overflow: hidden; border-radius: ${toPixel(radius)}; }`);
        return `<div class="${runClass}" data-mask-source="${maskClass}">${maskedChildren}</div>`;
      })
      .join('');

    return `<div class="${className}">${childHtml}</div>`;
  };

  buildCss(undefined, undefined);

  const topLevel = childrenByParent.get(undefined) || [];
  const html = topLevel.map((node) => renderNode(node)).join('');

  const prelude = [
    '.nova-root { position: relative; width: 100%; min-height: 100%; overflow: auto; }',
    '.nova-root * { box-sizing: border-box; }',
  ];

  return {
    css: [...prelude, ...cssRules].join('\n'),
    html: `<div class="nova-root">${html}</div>`,
  };
};