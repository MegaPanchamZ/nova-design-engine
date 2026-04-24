import { SceneNode, FrameNode, TextNode } from '../types';
import { measureText } from './measureText';

export const calculateLayout = (frame: FrameNode, children: SceneNode[]): { frame: FrameNode, children: SceneNode[] } => {
  if (frame.layoutMode === 'none') return { frame, children };

  const { padding, gap } = frame;
  const layoutChildren = children.filter(c => !c.isAbsolute);
  const absoluteChildren = children.filter(c => c.isAbsolute);

  const updatedLayoutChildren = layoutChildren.map(c => ({ ...c }));
  const updatedFrame = { ...frame };

  // Pass 1: Determine Widths
  if (frame.layoutMode === 'horizontal') {
    // 1a. Identify non-fill widths
    updatedLayoutChildren.forEach(child => {
      if (child.horizontalResizing !== 'fill') {
        if (child.type === 'text') {
          const text = child as TextNode;
          const maxWidth = child.horizontalResizing === 'fixed' ? child.width : undefined;
          const metrics = measureText(text.text, text.fontSize, text.fontFamily, maxWidth, text.lineHeight);
          if (child.horizontalResizing === 'hug') child.width = metrics.width;
        }
      }
    });

    // 1b. Handle Frame Width if Hug
    if (frame.horizontalResizing === 'hug') {
      const childrenW = updatedLayoutChildren.filter(c => c.horizontalResizing !== 'fill').reduce((sum, c) => sum + c.width, 0);
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      updatedFrame.width = childrenW + totalGap + padding.left + padding.right;
    }

    // 1c. Handle Fill Widths
    const fillableW = updatedLayoutChildren.filter(c => c.horizontalResizing === 'fill');
    if (fillableW.length > 0) {
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      const fixedW = updatedLayoutChildren.filter(c => c.horizontalResizing !== 'fill').reduce((sum, c) => sum + c.width, 0);
      const availableW = Math.max(0, updatedFrame.width - padding.left - padding.right - fixedW - totalGap);
      const fillW = availableW / fillableW.length;
      updatedLayoutChildren.forEach(child => {
        if (child.horizontalResizing === 'fill') child.width = fillW;
      });
    }
  } else if (frame.layoutMode === 'vertical') {
    // 1a. Handle non-fill widths (simple: Hug text or Fixed)
    updatedLayoutChildren.forEach(child => {
      if (child.horizontalResizing === 'hug' && child.type === 'text') {
        const text = child as TextNode;
        const metrics = measureText(text.text, text.fontSize, text.fontFamily, undefined, text.lineHeight);
        child.width = metrics.width;
      } else if (child.horizontalResizing === 'fill') {
        child.width = Math.max(0, updatedFrame.width - padding.left - padding.right);
      }
    });

    // 1b. Frame Width if Hug
    if (frame.horizontalResizing === 'hug') {
      updatedFrame.width = Math.max(0, ...updatedLayoutChildren.map(c => c.width)) + padding.left + padding.right;
    }
    
    // Re-sync fill widths if frame width changed
    if (frame.horizontalResizing === 'hug') {
      updatedLayoutChildren.forEach(child => {
        if (child.horizontalResizing === 'fill') {
          child.width = Math.max(0, updatedFrame.width - padding.left - padding.right);
        }
      });
    }
  }

  // Pass 2: Determine Heights (now that widths are stable)
  if (frame.layoutMode === 'vertical') {
    // 2a. Identify non-fill heights
    updatedLayoutChildren.forEach(child => {
      if (child.verticalResizing !== 'fill') {
        if (child.type === 'text') {
          const text = child as TextNode;
          // Wrap text based on determined width
          const maxWidth = child.width; 
          const metrics = measureText(text.text, text.fontSize, text.fontFamily, maxWidth, text.lineHeight);
          if (child.verticalResizing === 'hug') child.height = metrics.height;
        }
      }
    });

    // 2b. Frame Height if Hug
    if (frame.verticalResizing === 'hug') {
      const childrenH = updatedLayoutChildren.filter(c => c.verticalResizing !== 'fill').reduce((sum, c) => sum + c.height, 0);
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      updatedFrame.height = childrenH + totalGap + padding.top + padding.bottom;
    }

    // 2c. Handle Fill Heights
    const fillableH = updatedLayoutChildren.filter(c => c.verticalResizing === 'fill');
    if (fillableH.length > 0) {
      const totalGap = Math.max(0, updatedLayoutChildren.length - 1) * gap;
      const fixedH = updatedLayoutChildren.filter(c => c.verticalResizing !== 'fill').reduce((sum, c) => sum + c.height, 0);
      const availableH = Math.max(0, updatedFrame.height - padding.top - padding.bottom - fixedH - totalGap);
      const fillH = availableH / fillableH.length;
      updatedLayoutChildren.forEach(child => {
        if (child.verticalResizing === 'fill') child.height = fillH;
      });
    }
  } else if (frame.layoutMode === 'horizontal') {
    // 2a. Determine heights
    updatedLayoutChildren.forEach(child => {
      if (child.verticalResizing === 'fill') {
        child.height = Math.max(0, updatedFrame.height - padding.top - padding.bottom);
      } else if (child.verticalResizing === 'hug' && child.type === 'text') {
        const text = child as TextNode;
        const metrics = measureText(text.text, text.fontSize, text.fontFamily, child.width, text.lineHeight);
        child.height = metrics.height;
      }
    });

    // 2b. Frame Height if Hug
    if (frame.verticalResizing === 'hug') {
      updatedFrame.height = Math.max(0, ...updatedLayoutChildren.map(c => c.height)) + padding.top + padding.bottom;
    }

    // Re-sync fill heights if frame height changed
    if (frame.verticalResizing === 'hug') {
      updatedLayoutChildren.forEach(child => {
        if (child.verticalResizing === 'fill') {
          child.height = Math.max(0, updatedFrame.height - padding.top - padding.bottom);
        }
      });
    }
  }

  // Pass 3: Positioning
  const totalW = updatedLayoutChildren.reduce((sum, c) => sum + c.width, 0);
  const totalH = updatedLayoutChildren.reduce((sum, c) => sum + c.height, 0);
  const totalG = Math.max(0, updatedLayoutChildren.length - 1) * gap;

  if (frame.layoutMode === 'horizontal') {
    let x = padding.left;
    const availW = updatedFrame.width - padding.left - padding.right;
    
    if (frame.justifyContent === 'center') x = padding.left + (availW - totalW - totalG) / 2;
    else if (frame.justifyContent === 'end') x = padding.left + (availW - totalW - totalG);

    updatedLayoutChildren.forEach(child => {
      child.x = x;
      if (frame.alignItems === 'center') child.y = padding.top + (updatedFrame.height - padding.top - padding.bottom - child.height) / 2;
      else if (frame.alignItems === 'end') child.y = updatedFrame.height - padding.bottom - child.height;
      else child.y = padding.top;
      x += child.width + gap;
    });
  } else if (frame.layoutMode === 'vertical') {
    let y = padding.top;
    const availH = updatedFrame.height - padding.top - padding.bottom;
    
    if (frame.justifyContent === 'center') y = padding.top + (availH - totalH - totalG) / 2;
    else if (frame.justifyContent === 'end') y = padding.top + (availH - totalH - totalG);

    updatedLayoutChildren.forEach(child => {
      child.y = y;
      if (frame.alignItems === 'center') child.x = padding.left + (updatedFrame.width - padding.left - padding.right - child.width) / 2;
      else if (frame.alignItems === 'end') child.x = updatedFrame.width - padding.right - child.width;
      else child.x = padding.left;
      y += child.height + gap;
    });
  }

  // Merge back
  const resultMap = new Map<string, SceneNode>();
  updatedLayoutChildren.forEach(c => resultMap.set(c.id, c));
  absoluteChildren.forEach(c => resultMap.set(c.id, c));

  const finalChildren = children.map(c => resultMap.get(c.id) || c);

  return { frame: updatedFrame, children: finalChildren };
};
