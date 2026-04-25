import { SceneNode } from '../../types';
import { generateVectorPdf, PdfVectorPath } from './pdfVector';

export interface ExportPayload {
  nodes: SceneNode[];
  format: 'png' | 'svg' | 'pdf';
  width: number;
  height: number;
}

export interface ExportResult {
  format: ExportPayload['format'];
  blob: Blob;
}

export interface HeadlessExporter {
  export: (payload: ExportPayload) => Promise<ExportResult>;
}

type CanvasLike = OffscreenCanvas | HTMLCanvasElement;
type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const createCanvas = (width: number, height: number): CanvasLike | null => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  return null;
};

const canvasToBlob = async (canvas: CanvasLike, mimeType: string): Promise<Blob> => {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mimeType });
  }

  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve) => {
    htmlCanvas.toBlob((blob) => {
      resolve(blob || new Blob([], { type: mimeType }));
    }, mimeType);
  });
};

const resolveGlobalPositions = (nodes: SceneNode[]): Map<string, { x: number; y: number }> => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, { x: number; y: number }>();

  const resolve = (nodeId: string): { x: number; y: number } => {
    const cached = cache.get(nodeId);
    if (cached) return cached;

    const node = byId.get(nodeId);
    if (!node) return { x: 0, y: 0 };

    if (!node.parentId) {
      const root = { x: node.x, y: node.y };
      cache.set(nodeId, root);
      return root;
    }

    const parent = resolve(node.parentId);
    const value = { x: parent.x + node.x, y: parent.y + node.y };
    cache.set(nodeId, value);
    return value;
  };

  nodes.forEach((node) => {
    resolve(node.id);
  });

  return cache;
};

const buildSvg = (nodes: SceneNode[], width: number, height: number): string => {
  const positions = resolveGlobalPositions(nodes);
  let output = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  nodes
    .filter((node) => node.visible !== false)
    .forEach((node) => {
      const pos = positions.get(node.id) || { x: node.x, y: node.y };
      const opacity = Number.isFinite(node.opacity) ? node.opacity : 1;
      const fill = node.fill || 'transparent';
      const stroke = node.stroke || 'none';

      if (node.type === 'rect' || node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
        output += `<rect x="${pos.x}" y="${pos.y}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${node.strokeWidth}" opacity="${opacity}" rx="${node.cornerRadius || 0}" />`;
        return;
      }

      if (node.type === 'circle') {
        output += `<circle cx="${pos.x + node.width / 2}" cy="${pos.y + node.width / 2}" r="${Math.max(0, node.width / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${node.strokeWidth}" opacity="${opacity}" />`;
        return;
      }

      if (node.type === 'ellipse') {
        output += `<ellipse cx="${pos.x + node.width / 2}" cy="${pos.y + node.height / 2}" rx="${Math.max(0, node.width / 2)}" ry="${Math.max(0, node.height / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${node.strokeWidth}" opacity="${opacity}" />`;
        return;
      }

      if (node.type === 'text') {
        const safeText = (node.text || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        output += `<text x="${pos.x}" y="${pos.y + node.fontSize}" font-family="${node.fontFamily}" font-size="${node.fontSize}" fill="${fill}" opacity="${opacity}">${safeText}</text>`;
        return;
      }

      if (node.type === 'path') {
        output += `<path d="${node.data}" transform="translate(${pos.x}, ${pos.y})" fill="${fill}" stroke="${stroke}" stroke-width="${node.strokeWidth}" opacity="${opacity}" />`;
        return;
      }

      if (node.type === 'image') {
        output += `<image href="${node.src}" x="${pos.x}" y="${pos.y}" width="${node.width}" height="${node.height}" opacity="${opacity}" />`;
      }
    });

  output += '</svg>';
  return output;
};

const drawNodesToCanvas = async (
  ctx: Canvas2DContext,
  nodes: SceneNode[]
) => {
  const positions = resolveGlobalPositions(nodes);
  const imageCache = new Map<string, CanvasImageSource>();

  const resolveImage = async (src: string): Promise<CanvasImageSource | null> => {
    const cached = imageCache.get(src);
    if (cached) return cached;

    if (typeof Image !== 'undefined') {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = src;
      await new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
      imageCache.set(src, image);
      return image;
    }

    return null;
  };

  for (const node of nodes) {
    if (node.visible === false) continue;

    const pos = positions.get(node.id) || { x: node.x, y: node.y };
    const opacity = Number.isFinite(node.opacity) ? node.opacity : 1;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(pos.x, pos.y);
    if (node.rotation) {
      ctx.translate(node.width / 2, node.height / 2);
      ctx.rotate((node.rotation * Math.PI) / 180);
      ctx.translate(-node.width / 2, -node.height / 2);
    }

    if (node.type === 'rect' || node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
      const radius = Math.max(0, node.cornerRadius || 0);
      if (radius > 0 && 'roundRect' in ctx) {
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D).roundRect(0, 0, node.width, node.height, radius);
        ctx.fillStyle = node.fill || 'transparent';
        ctx.fill();
      } else {
        ctx.fillStyle = node.fill || 'transparent';
        ctx.fillRect(0, 0, node.width, node.height);
      }
      if (node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke || 'transparent';
        ctx.lineWidth = node.strokeWidth;
        ctx.strokeRect(0, 0, node.width, node.height);
      }
      ctx.restore();
      continue;
    }

    if (node.type === 'circle') {
      ctx.beginPath();
      const radius = Math.max(0, node.width / 2);
      ctx.arc(radius, radius, radius, 0, Math.PI * 2);
      ctx.fillStyle = node.fill || 'transparent';
      ctx.fill();
      if (node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke || 'transparent';
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (node.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(node.width / 2, node.height / 2, Math.max(0, node.width / 2), Math.max(0, node.height / 2), 0, 0, Math.PI * 2);
      ctx.fillStyle = node.fill || 'transparent';
      ctx.fill();
      if (node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke || 'transparent';
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (node.type === 'text') {
      ctx.fillStyle = node.fill || '#111111';
      ctx.font = `${node.fontStyle} ${node.fontSize}px ${node.fontFamily}`;
      ctx.textBaseline = 'alphabetic';
      const lines = (node.text || '').split('\n');
      const lineHeight = node.lineHeight || node.fontSize * 1.2;
      lines.forEach((line, index) => {
        ctx.fillText(line, 0, node.fontSize + index * lineHeight);
      });
      ctx.restore();
      continue;
    }

    if (node.type === 'path') {
      if (typeof Path2D !== 'undefined') {
        const path = new Path2D(node.data);
        ctx.fillStyle = node.fill || 'transparent';
        ctx.strokeStyle = node.stroke || 'transparent';
        ctx.lineWidth = node.strokeWidth;
        ctx.fill(path);
        if (node.strokeWidth > 0) ctx.stroke(path);
      }
      ctx.restore();
      continue;
    }

    if (node.type === 'image') {
      const image = await resolveImage(node.src);
      if (image) {
        ctx.drawImage(image, 0, 0, node.width, node.height);
      }
      ctx.restore();
      continue;
    }

    ctx.restore();
  }
};

const buildPdfPaths = (nodes: SceneNode[]): PdfVectorPath[] => {
  const positions = resolveGlobalPositions(nodes);

  return nodes
    .filter((node) => node.visible !== false)
    .map((node) => {
      const pos = positions.get(node.id) || { x: node.x, y: node.y };

      if (node.type === 'path') {
        return { d: node.data, stroke: node.stroke, fill: node.fill };
      }

      if (node.type === 'rect' || node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
        const x = pos.x;
        const y = pos.y;
        const w = node.width;
        const h = node.height;
        return { d: `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} L ${x} ${y}`, stroke: node.stroke, fill: node.fill };
      }

      if (node.type === 'ellipse' || node.type === 'circle') {
        const cx = pos.x + node.width / 2;
        const cy = pos.y + node.height / 2;
        const rx = node.width / 2;
        const ry = node.type === 'circle' ? rx : node.height / 2;
        const left = cx - rx;
        const right = cx + rx;
        return { d: `M ${left} ${cy} L ${cx} ${cy - ry} L ${right} ${cy} L ${cx} ${cy + ry} L ${left} ${cy}`, stroke: node.stroke, fill: node.fill };
      }

      return { d: '', stroke: node.stroke, fill: node.fill };
    })
    .filter((path) => path.d.length > 0);
};

export const createHeadlessExporter = (): HeadlessExporter => {
  return {
    async export(payload) {
      if (payload.format === 'svg') {
        const svg = buildSvg(payload.nodes, payload.width, payload.height);
        return {
          format: 'svg',
          blob: new Blob([svg], { type: 'image/svg+xml' }),
        };
      }

      if (payload.format === 'pdf') {
        const doc = generateVectorPdf({
          width: payload.width,
          height: payload.height,
          paths: buildPdfPaths(payload.nodes),
        });
        const blob = doc.output('blob');
        return { format: 'pdf', blob };
      }

      const canvas = createCanvas(payload.width, payload.height);
      if (!canvas) {
        return {
          format: payload.format,
          blob: new Blob([], { type: 'image/png' }),
        };
      }

      const rawContext = canvas.getContext('2d');
      if (!rawContext || !('clearRect' in rawContext)) {
        return {
          format: payload.format,
          blob: new Blob([], { type: 'image/png' }),
        };
      }

      const ctx = rawContext as Canvas2DContext;

      ctx.clearRect(0, 0, payload.width, payload.height);
      await drawNodesToCanvas(ctx, payload.nodes);
      const blob = await canvasToBlob(canvas, 'image/png');
      return { format: 'png', blob };
    },
  };
};
