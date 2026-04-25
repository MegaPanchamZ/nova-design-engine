import { describe, expect, it } from 'vitest';
import { createDefaultNode, FrameNode, TextNode } from '../types';
import { exportNodesToCss } from './cssExport';

describe('exportNodesToCss', () => {
  it('generates css and html for auto-layout frame trees', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.name = 'Card';
    frame.layoutMode = 'vertical';
    frame.gap = 12;
    frame.padding = { top: 16, right: 16, bottom: 16, left: 16 };
    frame.width = 320;
    frame.height = 200;

    const title = createDefaultNode('text', 0, 0) as TextNode;
    title.parentId = frame.id;
    title.text = 'Hello';
    title.name = 'Title';

    const result = exportNodesToCss([frame, title]);

    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('flex-direction: column');
    expect(result.css).toContain('row-gap: 12px');
    expect(result.html).toContain('nova-root');
    expect(result.html).toContain('Hello');
  });

  it('creates mask runs for mask nodes followed by siblings', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.name = 'Root';

    const mask = createDefaultNode('rect', 10, 10);
    mask.parentId = frame.id;
    mask.isMask = true;
    mask.name = 'Mask';

    const child = createDefaultNode('rect', 0, 0);
    child.parentId = frame.id;
    child.name = 'Masked';

    const result = exportNodesToCss([frame, mask, child]);
    expect(result.html).toContain('data-mask-source');
  });
});