import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from './store';
import { createDefaultNode, FrameNode, Page } from './types';

const TEST_PAGE_ID = 'history-page';

const createPage = (nodes: FrameNode[] = []): Page => ({
  id: TEST_PAGE_ID,
  name: 'Page 1',
  nodes,
});

describe('store history batching', () => {
  beforeEach(() => {
    const page = createPage();
    useStore.setState({
      pages: [page],
      currentPageId: TEST_PAGE_ID,
      selectedIds: [],
      history: [[page]],
      historyIndex: 0,
    });
  });

  it('merges repeated history pushes with the same source into one undo frame', () => {
    const node = createDefaultNode('frame', 0, 0) as FrameNode;
    const initialPage = createPage([node]);

    useStore.setState({
      pages: [initialPage],
      history: [[createPage()], [initialPage]],
      historyIndex: 1,
    });

    useStore.getState().updateNode(node.id, { x: 10 });
    useStore.getState().pushHistory('nudge');

    useStore.getState().updateNode(node.id, { x: 20 });
    useStore.getState().pushHistory('nudge');

    const { history, historyIndex } = useStore.getState();
    const latestNode = history[historyIndex][0].nodes.find((entry) => entry.id === node.id);

    expect(history).toHaveLength(3);
    expect(latestNode?.x).toBe(20);
  });
});