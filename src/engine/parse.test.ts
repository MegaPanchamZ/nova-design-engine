import { describe, expect, it } from 'vitest';
import { parseNovaResponse } from './parse';

describe('parseNovaResponse', () => {
  it('extracts message, html and tweak entries from structured response', () => {
    const raw = [
      '[MESSAGE]',
      'hello',
      '[/MESSAGE]',
      '[HTML]',
      '<div id="card"></div>',
      '[/HTML]',
      '[TWEAKS]',
      '[{"label":"Opacity","targetId":"card","property":"opacity","type":"slider","value":0.8}]',
      '[/TWEAKS]',
    ].join('\n');

    const parsed = parseNovaResponse(raw, []);
    expect(parsed.message).toBe('hello');
    expect(parsed.html).toBe('<div id="card"></div>');
    expect(parsed.tweaks).toHaveLength(1);
    expect(parsed.tweaks[0]?.targetNodeId).toBe('card');
  });
});
