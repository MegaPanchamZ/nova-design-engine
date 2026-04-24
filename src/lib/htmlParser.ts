import { SceneNode, createDefaultNode, FrameNode, TextNode, RectNode, ImageNode, Paint } from '../types';
import { v4 as uuidv4 } from 'uuid';

const splitTopLevel = (value: string): string[] => {
  const result: string[] = [];
  let depth = 0;
  let token = '';

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      if (token.trim()) result.push(token.trim());
      token = '';
      continue;
    }
    token += ch;
  }

  if (token.trim()) result.push(token.trim());
  return result;
};

const splitStopToken = (stop: string): { color: string; offset?: number } => {
  let depth = 0;
  let splitIndex = -1;
  for (let i = stop.length - 1; i >= 0; i--) {
    const ch = stop[i];
    if (ch === ')') depth += 1;
    if (ch === '(') depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ' ') {
      splitIndex = i;
      break;
    }
  }

  if (splitIndex === -1) return { color: stop.trim() };
  const color = stop.slice(0, splitIndex).trim();
  const offsetToken = stop.slice(splitIndex + 1).trim();
  const pct = offsetToken.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) {
    return { color, offset: Math.min(1, Math.max(0, Number(pct[1]) / 100)) };
  }

  const normalized = Number(offsetToken);
  if (Number.isFinite(normalized)) {
    return { color, offset: Math.min(1, Math.max(0, normalized)) };
  }

  return { color: stop.trim() };
};

const extractAlpha = (color: string): { color: string; opacity: number } => {
  const rgba = color.replace(/\s+/g, '').match(/^rgba\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/i);
  if (rgba) {
    const r = Math.min(255, Math.max(0, Number(rgba[1])));
    const g = Math.min(255, Math.max(0, Number(rgba[2])));
    const b = Math.min(255, Math.max(0, Number(rgba[3])));
    const a = Math.min(1, Math.max(0, Number(rgba[4])));
    return { color: `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`, opacity: a };
  }

  const hex = color.trim().match(/^#([\da-fA-F]{8})$/);
  if (hex) {
    const raw = hex[1];
    const base = `#${raw.slice(0, 6)}`;
    const alpha = parseInt(raw.slice(6, 8), 16) / 255;
    return { color: base, opacity: alpha };
  }

  return { color, opacity: 1 };
};

const parseGradientStops = (tokens: string[]): { offset: number; color: string }[] => {
  const parsed = tokens.map((token) => splitStopToken(token));
  if (parsed.length === 0) {
    return [
      { offset: 0, color: '#FFFFFF' },
      { offset: 1, color: '#000000' },
    ];
  }

  const withOffsets = parsed.map((stop, index) => {
    if (stop.offset !== undefined) return { offset: stop.offset, color: stop.color };
    if (parsed.length === 1) return { offset: 0, color: stop.color };
    return { offset: index / (parsed.length - 1), color: stop.color };
  });

  return withOffsets.map((stop) => ({
    offset: Math.min(1, Math.max(0, stop.offset)),
    color: stop.color,
  }));
};

const parseLinearGradientAngle = (token: string): number => {
  const trimmed = token.trim().toLowerCase();
  const deg = trimmed.match(/^(-?\d+(?:\.\d+)?)deg$/);
  if (deg) return Number(deg[1]);

  if (trimmed.startsWith('to ')) {
    const direction = trimmed.replace(/^to\s+/, '');
    if (direction === 'right') return 0;
    if (direction === 'bottom') return 90;
    if (direction === 'left') return 180;
    if (direction === 'top') return -90;
    if (direction === 'bottom right' || direction === 'right bottom') return 45;
    if (direction === 'bottom left' || direction === 'left bottom') return 135;
    if (direction === 'top left' || direction === 'left top') return -135;
    if (direction === 'top right' || direction === 'right top') return -45;
  }

  return 0;
};

const parseBackgroundPaints = (style: CSSStyleDeclaration): Paint[] => {
  const paints: Paint[] = [];

  const bgColor = style.backgroundColor;
  const { color: normalizedBgColor, opacity: bgOpacity } = extractAlpha(bgColor);
  if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)' && bgOpacity > 0) {
    paints.push({
      id: uuidv4(),
      type: 'solid',
      color: normalizedBgColor,
      opacity: bgOpacity,
      visible: true,
    });
  }

  const bgImage = style.backgroundImage;
  if (!bgImage || bgImage === 'none') return paints;

  const layers = splitTopLevel(bgImage);
  const parsedLayers: Paint[] = [];

  layers.forEach((layer) => {
    const linearMatch = layer.match(/^linear-gradient\((.*)\)$/i);
    if (linearMatch) {
      const parts = splitTopLevel(linearMatch[1]);
      const looksLikeAngle = parts[0] && (parts[0].includes('deg') || parts[0].trim().toLowerCase().startsWith('to '));
      const angle = looksLikeAngle ? parseLinearGradientAngle(parts[0]) : 0;
      const stopTokens = looksLikeAngle ? parts.slice(1) : parts;
      parsedLayers.push({
        id: uuidv4(),
        type: 'gradient-linear',
        gradientAngle: angle,
        gradientStops: parseGradientStops(stopTokens),
        opacity: 1,
        visible: true,
      });
      return;
    }

    const radialMatch = layer.match(/^radial-gradient\((.*)\)$/i);
    if (radialMatch) {
      const parts = splitTopLevel(radialMatch[1]);
      let center = { x: 0.5, y: 0.5 };
      let radius = 0.5;
      let stopStart = 0;

      const first = parts[0]?.toLowerCase() || '';
      if (first.includes(' at ')) {
        stopStart = 1;
        const atMatch = first.match(/at\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
        if (atMatch) {
          center = {
            x: Math.min(1, Math.max(0, Number(atMatch[1]) / 100)),
            y: Math.min(1, Math.max(0, Number(atMatch[2]) / 100)),
          };
        }
        const radiusMatch = first.match(/(\d+(?:\.\d+)?)%/);
        if (radiusMatch) {
          radius = Math.min(1, Math.max(0.05, Number(radiusMatch[1]) / 100));
        }
      }

      parsedLayers.push({
        id: uuidv4(),
        type: 'gradient-radial',
        gradientCenter: center,
        gradientRadius: radius,
        gradientStops: parseGradientStops(parts.slice(stopStart)),
        opacity: 1,
        visible: true,
      });
    }
  });

  // CSS renders first background layer on top. In Nova, last fill is top-most.
  return [...paints, ...parsedLayers.reverse()];
};

export const parseHTMLToNodes = (html: string, basePosition: { x: number, y: number }): SceneNode[] => {
  // Use a temporary hidden container in the real DOM for accurate style/layout calculation
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = '1440px'; // Set a default width for layout calculation
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.innerHTML = html;
  document.body.appendChild(container);

  const nodes: SceneNode[] = [];
  const parentToChildren = new Map<string, SceneNode[]>();

  const parseElement = (element: HTMLElement, parentNodeId?: string): string | undefined => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const localX = rect.left - containerRect.left;
    const localY = rect.top - containerRect.top;

    let node: SceneNode | null = null;
    const tagName = element.tagName.toLowerCase();

    // Check if this is a text-heavy element that should be a single TextNode
    const textTags = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a', 'b', 'strong', 'i', 'em', 'label'];
    const isTextTag = textTags.includes(tagName);

    if (tagName === 'div' || tagName === 'section' || tagName === 'header' || tagName === 'footer' || tagName === 'nav' || tagName === 'main' || tagName === 'article' || tagName === 'aside' || tagName === 'body') {
      const frame = createDefaultNode('frame', localX, localY, element.id) as FrameNode;
      frame.width = rect.width;
      frame.height = rect.height;
      const nameFromId = element.id && !element.id.includes('-') && element.id.length < 32 ? element.id : null;
      frame.name = nameFromId || (element.getAttribute('class')?.split(' ')[0]) || tagName;
      
      const bgColor = style.backgroundColor;
      frame.fill = (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') ? '#FFFFFF00' : bgColor;

    frame.cornerRadius = parseFloat(style.borderTopLeftRadius) || 0;
    frame.individualCornerRadius = {
      topLeft: parseFloat(style.borderTopLeftRadius) || 0,
      topRight: parseFloat(style.borderTopRightRadius) || 0,
      bottomRight: parseFloat(style.borderBottomRightRadius) || 0,
      bottomLeft: parseFloat(style.borderBottomLeftRadius) || 0
    };
    frame.clipsContent = style.overflow === 'hidden';
    
    // Parse rotation from matrix or rotate
    const transform = style.transform;
    if (transform && transform !== 'none') {
        if (transform.includes('matrix')) {
            const values = transform.split('(')[1].split(')')[0].split(',');
            const a = parseFloat(values[0]);
            const b = parseFloat(values[1]);
            frame.rotation = Math.round(Math.atan2(b, a) * (180 / Math.PI));
        } else if (transform.includes('rotate')) {
            const val = transform.split('(')[1].split(')')[0];
            if (val.includes('deg')) {
                frame.rotation = parseFloat(val);
            } else if (val.includes('rad')) {
                frame.rotation = parseFloat(val) * (180 / Math.PI);
            } else {
                frame.rotation = parseFloat(val) || 0;
            }
        }
    }

    const borderWidth = parseFloat(style.borderWidth) || 0;
    frame.strokeWidth = borderWidth;
    if (borderWidth > 0) frame.stroke = style.borderColor;
      
      if (element.getAttribute('data-mask') === 'true') {
        frame.isMask = true;
      }

      if (style.display === 'flex') {
        frame.layoutMode = style.flexDirection === 'column' ? 'vertical' : 'horizontal';
        frame.gap = parseFloat(style.gap) || 0;
        frame.padding = {
            top: parseFloat(style.paddingTop) || 0,
            right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
            left: parseFloat(style.paddingLeft) || 0
        };
        const jc = style.justifyContent;
        frame.justifyContent = jc.includes('start') ? 'start' : jc.includes('end') ? 'end' : jc.includes('center') ? 'center' : jc.includes('between') ? 'space-between' : 'start';
        const ai = style.alignItems;
        frame.alignItems = ai.includes('start') ? 'start' : ai.includes('end') ? 'end' : ai.includes('center') ? 'center' : ai.includes('stretch') ? 'stretch' : 'start';
      }
      node = frame;
    } else if (isTextTag) {
      const text = createDefaultNode('text', localX, localY, element.id) as TextNode;
      text.text = element.innerText?.trim() || element.textContent?.trim() || '';
      text.width = Math.ceil(rect.width + 4);
      text.height = Math.ceil(rect.height + 2);
      text.fontSize = parseFloat(style.fontSize) || 16;
      text.fontFamily = style.fontFamily.replace(/['"]/g, '');
      text.fill = style.color;
      const lhRaw = style.lineHeight;
      const parsedLh = parseFloat(lhRaw);
      text.lineHeight = !isNaN(parsedLh) ? parsedLh : Math.round(text.fontSize * 1.4);

    const nameFromId = element.id && !element.id.includes('-') && element.id.length < 32 ? element.id : null;
    text.name = nameFromId || (element.getAttribute('class')?.split(' ')[0]) || (text.text.length > 20 ? text.text.substring(0, 20) + '...' : text.text) || tagName;
    text.strokeWidth = 0;
    text.fontStyle = style.fontStyle;
    
    // Parse rotation from matrix or rotate
    const transform = style.transform;
    if (transform && transform !== 'none') {
        if (transform.includes('matrix')) {
            const values = transform.split('(')[1].split(')')[0].split(',');
            const a = parseFloat(values[0]);
            const b = parseFloat(values[1]);
            text.rotation = Math.round(Math.atan2(b, a) * (180 / Math.PI));
        } else if (transform.includes('rotate')) {
            const val = transform.split('(')[1].split(')')[0];
            if (val.includes('deg')) {
                text.rotation = parseFloat(val);
            } else if (val.includes('rad')) {
                text.rotation = parseFloat(val) * (180 / Math.PI);
            } else {
                text.rotation = parseFloat(val) || 0;
            }
        }
    }

    const textAlign = style.textAlign;
    text.align = textAlign.includes('center') ? 'center' : (textAlign.includes('right') || textAlign.includes('end')) ? 'right' : 'left';
    
    const writingMode = style.writingMode;
    if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr' || writingMode === 'horizontal-tb') {
      text.writingMode = writingMode;
    }

    if (element.getAttribute('data-mask') === 'true') text.isMask = true;
      node = text;
    } else if (tagName === 'img') {
        const img = createDefaultNode('image', localX, localY, element.id) as ImageNode;
        img.width = rect.width;
        img.height = rect.height;
        const nameFromId = element.id && !element.id.includes('-') && element.id.length < 32 ? element.id : null;
        img.name = nameFromId || 'Image';
        img.src = element.getAttribute('src') || '';
        img.strokeWidth = 0;
        if (element.getAttribute('data-mask') === 'true') img.isMask = true;
        node = img;
    } else if (tagName === 'svg') {
        const rectNode = createDefaultNode('rect', localX, localY) as RectNode;
        rectNode.width = rect.width;
        rectNode.height = rect.height;
        const nameFromId = element.id && !element.id.includes('-') && element.id.length < 32 ? element.id : null;
        rectNode.name = nameFromId || 'Vector';
        rectNode.fill = style.color || '#E5E7EB';
        rectNode.strokeWidth = 0;
        if (element.getAttribute('data-mask') === 'true') rectNode.isMask = true;
        node = rectNode;
    }

    if (node) {
      // Sync background paints into the multi-layer fill model.
      const parsedPaints = parseBackgroundPaints(style);
      if (parsedPaints.length > 0) {
        node.fills = parsedPaints;
        const topSolid = [...parsedPaints].reverse().find((paint) => paint.type === 'solid');
        if (topSolid?.color) node.fill = topSolid.color;
      } else if (node.fill) {
        node.fills = [{ id: uuidv4(), type: 'solid', color: node.fill, opacity: node.opacity || 1, visible: true }];
      }

      if (node.stroke && node.strokeWidth > 0) {
        node.strokes = [{ id: uuidv4(), type: 'solid', color: node.stroke, opacity: 1, visible: true }];
      }

      if (parentNodeId) {
          node.parentId = parentNodeId;
          const sibs = parentToChildren.get(parentNodeId) || [];
          sibs.push(node);
          parentToChildren.set(parentNodeId, sibs);
      }
      nodes.push(node);

      if (!isTextTag) {
        Array.from(element.childNodes).forEach(child => {
            if (child.nodeType === 1) { // Element
              parseElement(child as HTMLElement, node!.id);
            } else if (child.nodeType === 3 && child.textContent?.trim()) { // Text Node
                const range = document.createRange();
                range.selectNodeContents(child);
                const textRect = range.getBoundingClientRect();
                
                const tNode = createDefaultNode('text', textRect.left - containerRect.left, textRect.top - containerRect.top) as TextNode;
                tNode.text = child.textContent.trim();
                tNode.width = Math.ceil(textRect.width + 4);
                tNode.height = Math.ceil(textRect.height + 2);
                tNode.fontSize = parseFloat(style.fontSize) || 16;
                const innerLhRaw = style.lineHeight;
                const innerParsedLh = parseFloat(innerLhRaw);
                tNode.lineHeight = !isNaN(innerParsedLh) ? innerParsedLh : Math.round(tNode.fontSize * 1.4);
                
                tNode.fill = style.color;
                tNode.name = 'text';
                tNode.strokeWidth = 0;
                tNode.parentId = node!.id;
                nodes.push(tNode);

                const sibs = parentToChildren.get(node!.id) || [];
                sibs.push(tNode);
                parentToChildren.set(node!.id, sibs);
            }
        });
      }
      
      // Convert absolute to relative for children
      if (node.type === 'frame') {
          const children = parentToChildren.get(node.id) || [];
          children.forEach(child => {
              child.x -= node!.x;
              child.y -= node!.y;
          });
      }
    }

    return node?.id;
  };

  Array.from(container.children).forEach(child => {
    parseElement(child as HTMLElement);
  });

  // Cleanup
  document.body.removeChild(container);

  // Offset all top-level generated nodes to requested basePosition
  if (nodes.length > 0) {
      const topLevelNodes = nodes.filter(n => !n.parentId);
      topLevelNodes.forEach(n => {
          n.x += basePosition.x;
          n.y += basePosition.y;
      });
  }

  return nodes;
};
