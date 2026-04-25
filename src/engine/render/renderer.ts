import { RendererAdapter, RenderStats, RendererFrameInput, RenderBackendKind } from './types';

const createNoopRenderer = (kind: RenderBackendKind): RendererAdapter => {
  return {
    kind,
    async initialize() {
      return;
    },
    async renderFrame(input: RendererFrameInput): Promise<RenderStats> {
      return {
        frameTimeMs: 0,
        drawCalls: input.nodeIds.length,
        visibleNodes: input.nodeIds.length,
        tilesDrawn: 1,
      };
    },
    dispose() {
      return;
    },
  };
};

export interface RendererCreationOptions {
  preferredBackend?: RenderBackendKind;
}

export const createRendererAdapter = (options: RendererCreationOptions = {}): RendererAdapter => {
  const preferred = options.preferredBackend || 'react-konva';

  if (preferred === 'canvaskit') {
    return createNoopRenderer('canvaskit');
  }
  if (preferred === 'pixi-webgl') {
    return createNoopRenderer('pixi-webgl');
  }
  if (preferred === 'webgpu') {
    return createNoopRenderer('webgpu');
  }

  return createNoopRenderer('react-konva');
};
