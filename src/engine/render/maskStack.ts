import { RenderMaskLayer } from './types';

export interface MaskTraversalNode {
  id: string;
  parentId?: string;
  isMask?: boolean;
  opacity?: number;
  blendMode?: GlobalCompositeOperation;
}

export interface MaskRun {
  rootMask?: RenderMaskLayer;
  nodeIds: string[];
}

const defaultBlendMode: GlobalCompositeOperation = 'source-over';

export const buildMaskRuns = (nodes: MaskTraversalNode[]): MaskRun[] => {
  const ordered = [...nodes];
  const runs: MaskRun[] = [];
  let currentRun: MaskRun = { nodeIds: [] };

  ordered.forEach((node) => {
    if (node.isMask) {
      if (currentRun.nodeIds.length > 0) runs.push(currentRun);
      currentRun = {
        rootMask: {
          id: node.id,
          alpha: typeof node.opacity === 'number' ? node.opacity : 1,
          blendMode: node.blendMode || defaultBlendMode,
          clipPathId: node.id,
        },
        nodeIds: [],
      };
      return;
    }

    currentRun.nodeIds.push(node.id);
  });

  if (currentRun.nodeIds.length > 0 || currentRun.rootMask) runs.push(currentRun);
  return runs;
};
