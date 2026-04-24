import { SceneNode, createDefaultNode, FrameNode, TextNode, RectNode, ImageNode } from '../types';
import { v4 as uuidv4 } from 'uuid';

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
      // Sync legacy fill/stroke with new multi-paint system
      if (node.fill) {
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
