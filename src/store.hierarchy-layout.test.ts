import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/novaAIService', () => ({
  generateUI: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock('./lib/measureText', () => ({
  measureText: vi.fn(() => ({ width: 120, height: 24 })),
}));

import { useStore } from './store';
import { createDefaultNode, FrameNode, SceneNode } from './types';

const TEST_PAGE_ID = 'hierarchy-layout-page';

const resetStore = () => {
  useStore.setState({
    pages: [{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [] }],
    currentPageId: TEST_PAGE_ID,
    selectedIds: [],
  });
};

const getCurrentNodes = (): SceneNode[] => {
  const state = useStore.getState();
  return state.pages.find((page) => page.id === state.currentPageId)?.nodes || [];
};

describe('store hierarchy layout reflow', () => {
  beforeEach(() => {
    resetStore();
  });

  it('reflows auto-layout siblings after moving a child in the hierarchy', () => {
    const frame = createDefaultNode('frame', 0, 0) as FrameNode;
    frame.layoutMode = 'horizontal';
    frame.width = 320;
    frame.height = 120;
    frame.padding = { top: 10, right: 10, bottom: 10, left: 10 };
    frame.gap = 10;

    const a = createDefaultNode('rect', 0, 0);
    a.parentId = frame.id;
    a.width = 40;
    a.height = 20;
    a.name = 'A';

    const b = createDefaultNode('rect', 0, 0);
    b.parentId = frame.id;
    b.width = 40;
    b.height = 20;
    b.name = 'B';

    const c = createDefaultNode('rect', 0, 0);
    c.parentId = frame.id;
    c.width = 40;
    c.height = 20;
    c.name = 'C';

    useStore.setState({
      pages: [{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [frame, a, b, c] }],
    });

    useStore.getState().moveNodeHierarchy(c.id, a.id, 'before');

    const children = getCurrentNodes().filter((node) => node.parentId === frame.id);
    expect(children.map((node) => node.id)).toEqual([c.id, a.id, b.id]);
    expect(children.map((node) => node.x)).toEqual([10, 60, 110]);
    expect(children.map((node) => node.y)).toEqual([10, 10, 10]);
  });
});