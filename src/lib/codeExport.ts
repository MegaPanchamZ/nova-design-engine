import { SceneNode, FrameNode, TextNode } from '../types';

export const exportToCode = (nodes: SceneNode[]): string => {
    const buildJSX = (id?: string): string => {
        const children = nodes.filter(n => n.parentId === id);
        return children.map(n => {
            let classes = ``;
            let style: any = {};
            
            // Basic layout
            if (n.parentId) {
                style.position = 'absolute';
                style.left = `${n.x}px`;
                style.top = `${n.y}px`;
            } else {
                style.position = 'relative';
            }
            
            style.width = `${n.width}px`;
            style.height = `${n.height}px`;
            style.backgroundColor = n.fill;
            style.borderRadius = `${n.cornerRadius}px`;
            style.opacity = n.opacity;
            
            if (n.strokeWidth > 0) {
                style.border = `${n.strokeWidth}px solid ${n.stroke}`;
            }

            if (n.type === 'text') {
                const tn = n as TextNode;
                style.fontSize = `${tn.fontSize}px`;
                style.fontFamily = tn.fontFamily;
                style.textAlign = tn.align;
                style.display = 'flex';
                style.alignItems = 'center';
                
                return `      <div style={${JSON.stringify(style)}}>\n        ${tn.text}\n      </div>`;
            }

            if (n.type === 'frame') {
                const fn = n as FrameNode;
                if (fn.layoutMode !== 'none') {
                    style.display = 'flex';
                    style.flexDirection = fn.layoutMode === 'vertical' ? 'column' : 'row';
                    style.gap = `${fn.gap}px`;
                    style.padding = `${fn.padding.top}px ${fn.padding.right}px ${fn.padding.bottom}px ${fn.padding.left}px`;
                    style.justifyContent = fn.justifyContent;
                    style.alignItems = fn.alignItems;
                    // Auto layout elements often don't need absolute positioning if nested
                    delete style.position;
                    delete style.left;
                    delete style.top;
                }
                
                return `      <div style={${JSON.stringify(style)}}>\n  ${buildJSX(n.id)}\n      </div>`;
            }

            return `      <div style={${JSON.stringify(style)}} />`;
        }).join('\n');
    };

    const jsx = buildJSX();
    
    return `import React from 'react';

export const GeneratedComponent = () => {
  return (
    <div className="relative w-full h-full overflow-hidden">
${jsx}
    </div>
  );
};
`;
};
