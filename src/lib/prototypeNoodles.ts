import { v4 as uuidv4 } from 'uuid';

import { Interaction, SceneNode } from '../types';

export type PrototypeNavigateAnimation = 'instant' | 'slide-in' | 'dissolve';

export interface PrototypeConnection {
  sourceId: string;
  targetId: string;
  trigger: Interaction['trigger'];
  animation: PrototypeNavigateAnimation;
  interactionId: string;
  actionIndex: number;
}

interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PROTOTYPE_TARGET_TYPES = new Set(['frame', 'section', 'component', 'instance']);

export const isPrototypeTargetNode = (node: SceneNode): boolean => {
  return PROTOTYPE_TARGET_TYPES.has(node.type);
};

export const upsertPrototypeNavigation = (
  interactions: Interaction[] | undefined,
  targetId: string,
  animation: PrototypeNavigateAnimation = 'slide-in',
  trigger: Interaction['trigger'] = 'onClick'
): Interaction[] => {
  const nextInteractions = (interactions || []).map((interaction) => ({
    ...interaction,
    actions: interaction.actions.map((action) => ({ ...action })),
  }));

  const interactionIndex = nextInteractions.findIndex((interaction) => (
    interaction.trigger === trigger && interaction.actions.some((action) => action.type === 'navigate')
  ));

  if (interactionIndex >= 0) {
    const nextActions = [...nextInteractions[interactionIndex].actions];
    const actionIndex = nextActions.findIndex((action) => action.type === 'navigate');
    nextActions[actionIndex] = {
      ...nextActions[actionIndex],
      type: 'navigate',
      targetId,
      animation,
      value: targetId,
    };
    nextInteractions[interactionIndex] = {
      ...nextInteractions[interactionIndex],
      actions: nextActions,
    };
    return nextInteractions;
  }

  return [
    ...nextInteractions,
    {
      id: uuidv4(),
      trigger,
      actions: [{ type: 'navigate', targetId, animation, value: targetId }],
    },
  ];
};

export const collectPrototypeConnections = (nodes: SceneNode[]): PrototypeConnection[] => {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return nodes.flatMap((node) => {
    if (!isPrototypeTargetNode(node)) return [];

    return (node.interactions || []).flatMap((interaction) => {
      return interaction.actions.flatMap((action, actionIndex) => {
        if (action.type !== 'navigate' || typeof action.targetId !== 'string') return [];
        if (!nodeIds.has(action.targetId)) return [];

        return [{
          sourceId: node.id,
          targetId: action.targetId,
          trigger: interaction.trigger,
          animation: action.animation || 'slide-in',
          interactionId: interaction.id,
          actionIndex,
        }];
      });
    });
  });
};

export const buildPrototypeNoodlePoints = (sourceRect: NodeRect, targetRect: NodeRect): number[] => {
  const sourceOnLeft = sourceRect.x <= targetRect.x;
  const sourceX = sourceOnLeft ? sourceRect.x + sourceRect.width : sourceRect.x;
  const targetX = sourceOnLeft ? targetRect.x : targetRect.x + targetRect.width;
  const sourceY = sourceRect.y + sourceRect.height / 2;
  const targetY = targetRect.y + targetRect.height / 2;
  const horizontalGap = Math.max(48, Math.abs(targetX - sourceX) * 0.35);
  const controlOneX = sourceOnLeft ? sourceX + horizontalGap : sourceX - horizontalGap;
  const controlTwoX = sourceOnLeft ? targetX - horizontalGap : targetX + horizontalGap;

  return [sourceX, sourceY, controlOneX, sourceY, controlTwoX, targetY, targetX, targetY];
};