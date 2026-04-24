import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { SceneNode, FrameNode } from '../types';

export const triggerDownload = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToSVG = (nodes: SceneNode[]): string => {
  if (nodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (n.parentId) return;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  });

  if (minX === Infinity) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const width = maxX - minX;
  const height = maxY - minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`;
  
  const processNode = (node: SceneNode, level: number = 0): string => {
    let str = '';
    const indent = '  '.repeat(level);
    
    if (!node.visible) return '';

    const w = node.width;
    const h = node.height;
    const fill = node.fill || 'transparent';
    const stroke = node.stroke || 'none';
    const sw = node.strokeWidth || 0;
    const opacity = node.opacity || 1;
    const rotation = node.rotation || 0;
    
    // Transform specifically for SVG
    const transform = `transform="translate(${node.x || 0}, ${node.y || 0}) rotate(${rotation}, ${w/2}, ${h/2})"`;

    switch (node.type) {
      case 'rect':
        str += `${indent}<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" rx="${node.cornerRadius || 0}" ${transform} />\n`;
        break;
      case 'frame':
      case 'group':
      case 'component':
      case 'instance':
      case 'section':
      case 'boolean':
        str += `${indent}<g ${transform}>\n`;
        // Frame/Section background
        if ((node.type === 'frame' || node.type === 'section' || node.type === 'component') && node.fill && node.fill !== 'transparent') {
          str += `${indent}  <rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" rx="${node.cornerRadius || 0}" />\n`;
        }
        const children = nodes.filter(n => n.parentId === node.id);
        children.forEach(c => {
          str += processNode(c, level + 1);
        });
        str += `${indent}</g>\n`;
        break;
      case 'circle':
        str += `${indent}<circle cx="${w/2}" cy="${h/2}" r="${w/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
        break;
      case 'ellipse':
        str += `${indent}<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
        break;
      case 'text':
        // Improved text rendering with dominant-baseline
        const fontSize = node.fontSize || 12;
        str += `${indent}<text x="0" y="${fontSize}" font-family="${node.fontFamily || 'Inter'}" font-size="${fontSize}" fill="${fill}" opacity="${opacity}" style="dominant-baseline: alphabetic;" ${transform}>${node.text}</text>\n`;
        break;
      case 'path':
        str += `${indent}<path d="${node.data}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
        break;
      case 'image':
        str += `${indent}<image href="${node.src}" x="0" y="0" width="${w}" height="${h}" opacity="${opacity}" ${transform} />\n`;
        break;
    }
    return str;
  };

  nodes.forEach(n => {
    if (!n.parentId) svg += processNode(n, 1);
  });

  svg += `</svg>`;
  return svg;
};

export const exportToPDF = async (allNodes: SceneNode[], options: { type: 'digital' | 'print', scale?: number }) => {
  const frames = allNodes.filter(n => n.type === 'frame' && !n.parentId) as FrameNode[];
  if (frames.length === 0) return;

  // Create PDF
  const pdf = new jsPDF({
    orientation: frames[0].width > frames[0].height ? 'l' : 'p',
    unit: 'pt',
    format: [frames[0].width, frames[0].height]
  });

  const parser = new DOMParser();

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (i > 0) {
      pdf.addPage([frame.width, frame.height], frame.width > frame.height ? 'l' : 'p');
    }

    // Generate SVG specifically for this frame
    // We need to set the viewBox to the frame's internal space (0,0 to w,h)
    // and process its children relative to it.
    let frameSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">\n`;
    
    // Internal recursive helper that knows the context of 'allNodes'
    const processFrameChildren = (parentId: string, level: number = 0): string => {
      let str = '';
      const indent = '  '.repeat(level);
      const children = allNodes.filter(n => n.parentId === parentId);
      
      children.forEach(node => {
        if (!node.visible) return;

        const w = node.width;
        const h = node.height;
        const fill = node.fill || 'transparent';
        const stroke = node.stroke || 'none';
        const sw = node.strokeWidth || 0;
        const opacity = node.opacity || 1;
        const rotation = node.rotation || 0;
        
        const transform = `transform="translate(${node.x || 0}, ${node.y || 0}) rotate(${rotation}, ${w/2}, ${h/2})"`;

        switch (node.type) {
          case 'rect':
            str += `${indent}<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" rx="${node.cornerRadius || 0}" ${transform} />\n`;
            break;
          case 'frame':
          case 'group':
          case 'component':
          case 'instance':
          case 'section':
          case 'boolean':
            str += `${indent}<g ${transform}>\n`;
            if ((node.type === 'frame' || node.type === 'section' || node.type === 'component') && node.fill && node.fill !== 'transparent') {
              str += `${indent}  <rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" rx="${node.cornerRadius || 0}" />\n`;
            }
            str += processFrameChildren(node.id, level + 1);
            str += `${indent}</g>\n`;
            break;
          case 'circle':
            str += `${indent}<circle cx="${w/2}" cy="${h/2}" r="${w/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
            break;
          case 'ellipse':
            str += `${indent}<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
            break;
          case 'text':
            const fontSize = node.fontSize || 12;
            str += `${indent}<text x="0" y="${fontSize}" font-family="${node.fontFamily || 'Inter'}" font-size="${fontSize}" fill="${fill}" opacity="${opacity}" style="dominant-baseline: alphabetic;" ${transform}>${node.text}</text>\n`;
            break;
          case 'path':
            str += `${indent}<path d="${node.data}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${transform} />\n`;
            break;
          case 'image':
            str += `${indent}<image href="${node.src}" x="0" y="0" width="${w}" height="${h}" opacity="${opacity}" ${transform} />\n`;
            break;
        }
      });
      return str;
    };

    // Add frame background if needed
    if (frame.fill && frame.fill !== 'transparent') {
        frameSvgStr += `  <rect x="0" y="0" width="${frame.width}" height="${frame.height}" fill="${frame.fill}" rx="${frame.cornerRadius || 0}" />\n`;
    }
    
    frameSvgStr += processFrameChildren(frame.id, 1);
    frameSvgStr += `</svg>`;

    const svgDoc = parser.parseFromString(frameSvgStr, 'image/svg+xml');
    const svgElement = svgDoc.documentElement as unknown as SVGElement;

    // Use svg2pdf for high quality vector conversion
    await svg2pdf(svgElement, pdf, {
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
    });

    if (options.type === 'print') {
      const bleed = 9; 
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      // Crop marks
      pdf.line(-bleed, 0, -2, 0); pdf.line(0, -bleed, 0, -2);
      pdf.line(frame.width + 2, 0, frame.width + bleed, 0); pdf.line(frame.width, -bleed, frame.width, -2);
      pdf.line(-bleed, frame.height, -2, frame.height); pdf.line(0, frame.height + 2, 0, frame.height + bleed);
      pdf.line(frame.width + 2, frame.height, frame.width + bleed, frame.height); pdf.line(frame.width, frame.height + 2, frame.width, frame.height + bleed);
    }
  }

  pdf.save(`export_${options.type}.pdf`);
};
