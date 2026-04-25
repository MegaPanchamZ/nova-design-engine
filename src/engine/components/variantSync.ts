import { SceneNode } from '../../types';

export interface VariantSyncInput {
  instanceNode: SceneNode;
  masterNode: SceneNode;
  touchedFields: string[];
}

const INSTANCE_SYNC_EXCLUDED_FIELDS = new Set([
  'id',
  'parentId',
  'masterId',
  'instanceOverrides',
]);

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

export const syncVariantWithTouchedFields = ({ instanceNode, masterNode, touchedFields }: VariantSyncInput): SceneNode => {
  const touched = new Set(touchedFields);
  const instanceData = instanceNode as unknown as Record<string, unknown>;
  const masterData = masterNode as unknown as Record<string, unknown>;
  const nextData: Record<string, unknown> = { ...instanceData };

  Object.entries(masterData).forEach(([key, value]) => {
    if (INSTANCE_SYNC_EXCLUDED_FIELDS.has(key) || touched.has(key)) return;
    nextData[key] = cloneValue(value);
  });

  return {
    ...(nextData as unknown as SceneNode),
    id: instanceNode.id,
    parentId: instanceNode.parentId,
  };
};
