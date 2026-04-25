export type RenderBackendKind = 'react-konva' | 'canvaskit' | 'pixi-webgl' | 'webgpu';

export interface RenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderTile {
  id: string;
  bounds: RenderBounds;
  nodeIds: string[];
}

export interface RenderMaskLayer {
  id: string;
  alpha: number;
  blendMode: GlobalCompositeOperation;
  clipPathId?: string;
}

export interface RendererFrameInput {
  viewport: RenderBounds;
  dirtyRegions: RenderBounds[];
  nodeIds: string[];
}

export interface RenderStats {
  frameTimeMs: number;
  drawCalls: number;
  visibleNodes: number;
  tilesDrawn: number;
}

export interface RendererAdapter {
  readonly kind: RenderBackendKind;
  initialize: (canvas: HTMLCanvasElement | OffscreenCanvas) => Promise<void>;
  renderFrame: (input: RendererFrameInput) => Promise<RenderStats>;
  dispose: () => void;
}
