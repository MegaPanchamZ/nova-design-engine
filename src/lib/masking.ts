import { SceneNode } from '../types';

export interface MaskRun {
  type: 'mask';
  mask: SceneNode;
  maskedNodes: SceneNode[];
}

export interface NormalRun {
  type: 'normal';
  node: SceneNode;
}

export type MaskingRun = MaskRun | NormalRun;

export const buildMaskingRuns = (orderedNodes: SceneNode[]): MaskingRun[] => {
  const runs: MaskingRun[] = [];
  let activeMask: SceneNode | null = null;
  let activeNodes: SceneNode[] = [];

  const flush = () => {
    if (!activeMask) return;
    runs.push({
      type: 'mask',
      mask: activeMask,
      maskedNodes: [...activeNodes],
    });
    activeMask = null;
    activeNodes = [];
  };

  orderedNodes.forEach((node) => {
    if (node.isMask) {
      flush();
      activeMask = node;
      return;
    }

    if (activeMask) {
      activeNodes.push(node);
      return;
    }

    runs.push({ type: 'normal', node });
  });

  flush();
  return runs;
};

export const isMaskTargetNode = (node: SceneNode): boolean => {
  return !node.isMask;
};

export const maskNodeToCssClipPath = (node: SceneNode): string | undefined => {
  if (node.type === 'circle') {
    return 'circle(50% at 50% 50%)';
  }

  if (node.type === 'ellipse') {
    return 'ellipse(50% 50% at 50% 50%)';
  }

  if (node.type === 'path' && node.data) {
    const escaped = node.data.replace(/'/g, "\\'");
    return `path('${escaped}')`;
  }

  if (node.type === 'rect' || node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance' || node.type === 'image') {
    return undefined;
  }

  return undefined;
};