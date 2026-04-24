import { describe, expect, it } from 'vitest';
import { createDefaultNode } from '../types';
import { mergeGeneratedNodes, runNovaTurn } from './engine';

describe('runNovaTurn', () => {
  it('runs completion and parses nodes via injected htmlToNodes', async () => {
    const result = await runNovaTurn(
      {
        complete: async () =>
          ['[MESSAGE]ok[/MESSAGE]', '[HTML]<div id="hero"></div>[/HTML]', '[TWEAKS][][/TWEAKS]'].join('\n'),
      },
      {
        prompt: 'make hero',
        selectedIds: [],
        htmlToNodes: () => [createDefaultNode('frame', 10, 20)],
      }
    );

    expect(result.parsed.message).toBe('ok');
    expect(result.nodes).toHaveLength(1);
  });
});

describe('mergeGeneratedNodes', () => {
  it('adds generated nodes and selects top-level generated ids', () => {
    const existing = [createDefaultNode('rect', 0, 0)];
    const generated = [createDefaultNode('frame', 10, 10)];
    const merged = mergeGeneratedNodes({ existingNodes: existing, generatedNodes: generated });

    expect(merged.nodes).toHaveLength(2);
    expect(merged.selectedIds).toEqual([generated[0].id]);
  });
});
