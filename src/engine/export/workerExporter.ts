import { SceneNode } from '../../types';

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

export const createHeadlessExporter = (): HeadlessExporter => {
  return {
    async export(payload) {
      const serialized = JSON.stringify({
        format: payload.format,
        width: payload.width,
        height: payload.height,
        nodeCount: payload.nodes.length,
      });

      const blob = new Blob([serialized], { type: payload.format === 'svg' ? 'image/svg+xml' : 'application/octet-stream' });
      return { format: payload.format, blob };
    },
  };
};
