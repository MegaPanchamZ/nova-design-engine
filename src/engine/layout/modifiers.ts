import { LayoutBounds } from './bounds';

export interface LayoutModifier {
  type: 'padding' | 'minSize' | 'maxSize' | 'align';
  value: number | { horizontal?: 'start' | 'center' | 'end'; vertical?: 'start' | 'center' | 'end' };
}

export const applyLayoutModifiers = (bounds: LayoutBounds, modifiers: LayoutModifier[]): LayoutBounds => {
  return modifiers.reduce((acc, modifier) => {
    if (modifier.type === 'padding' && typeof modifier.value === 'number') {
      return {
        x: acc.x + modifier.value,
        y: acc.y + modifier.value,
        width: Math.max(0, acc.width - modifier.value * 2),
        height: Math.max(0, acc.height - modifier.value * 2),
      };
    }

    if (modifier.type === 'minSize' && typeof modifier.value === 'number') {
      return {
        ...acc,
        width: Math.max(acc.width, modifier.value),
        height: Math.max(acc.height, modifier.value),
      };
    }

    if (modifier.type === 'maxSize' && typeof modifier.value === 'number') {
      return {
        ...acc,
        width: Math.min(acc.width, modifier.value),
        height: Math.min(acc.height, modifier.value),
      };
    }

    return acc;
  }, bounds);
};
