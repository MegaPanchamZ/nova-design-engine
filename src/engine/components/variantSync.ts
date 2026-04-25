import { SceneNode } from '../../types';

export interface VariantSyncInput {
  instanceNode: SceneNode;
  masterNode: SceneNode;
  touchedFields: string[];
}

const stripOverriddenFields = <T extends Record<string, unknown>>(source: T, touchedFields: string[]): T => {
  const next: Record<string, unknown> = { ...source };
  touchedFields.forEach((field) => {
    if (field in next) delete next[field];
  });
  return next as T;
};

export const syncVariantWithTouchedFields = ({ instanceNode, masterNode, touchedFields }: VariantSyncInput): SceneNode => {
  const masterData = stripOverriddenFields(masterNode as unknown as Record<string, unknown>, touchedFields);
  const instanceData = instanceNode as unknown as Record<string, unknown>;

  return {
    ...(masterData as unknown as SceneNode),
    ...instanceData,
    id: instanceNode.id,
    parentId: instanceNode.parentId,
  };
};
