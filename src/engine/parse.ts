import { v4 as uuidv4 } from 'uuid';
import { AITweak } from '../types';
import { NovaParsedResponse } from './types';

const extractBlock = (tag: string, value: string): string => {
  const start = value.indexOf(`[${tag}]`);
  const end = value.indexOf(`[/${tag}]`);
  if (start === -1 || end === -1 || end <= start) return '';
  return value.slice(start + tag.length + 2, end).trim();
};

export const parseAiTweaks = (rawTweaks: unknown, selectedIds: string[]): AITweak[] => {
  if (!Array.isArray(rawTweaks)) return [];

  return rawTweaks
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const targetIdValue = typeof item.targetId === 'string' ? item.targetId : '';
      const targetNodeId = targetIdValue === 'Selection' ? selectedIds[0] : targetIdValue;

      return {
        id: uuidv4(),
        label: typeof item.label === 'string' ? item.label : 'Tweak',
        type:
          item.type === 'slider' || item.type === 'color' || item.type === 'toggle' || item.type === 'action'
            ? item.type
            : 'slider',
        targetNodeId: targetNodeId || selectedIds[0] || '',
        targetProperty: typeof item.property === 'string' ? item.property : '',
        min: typeof item.min === 'number' ? item.min : undefined,
        max: typeof item.max === 'number' ? item.max : undefined,
        value: item.value ?? 0,
      } as AITweak;
    })
    .filter((tweak) => tweak.targetNodeId.length > 0 && tweak.targetProperty.length > 0);
};

export const parseNovaResponse = (rawResponse: string, selectedIds: string[] = []): NovaParsedResponse => {
  const message = extractBlock('MESSAGE', rawResponse) || 'I have updated the design.';
  const html = extractBlock('HTML', rawResponse);
  const tweaksRaw = extractBlock('TWEAKS', rawResponse);

  let tweaks: AITweak[] = [];
  if (tweaksRaw) {
    try {
      tweaks = parseAiTweaks(JSON.parse(tweaksRaw), selectedIds);
    } catch {
      tweaks = [];
    }
  }

  return {
    message,
    html,
    tweaks,
  };
};
