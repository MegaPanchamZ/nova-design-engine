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
    });
  });

  it('replays undo/redo from command groups', () => {
    const node = createDefaultNode('frame', 0, 0) as FrameNode;
    const initialPage = createPage([node]);

    useStore.setState({
      pages: [initialPage],
    });

    useStore.getState().updateNode(node.id, { x: 10 });
    useStore.getState().updateNode(node.id, { x: 20 });

    let currentNode = useStore.getState().pages[0].nodes.find((entry) => entry.id === node.id) as FrameNode;
    expect(currentNode.x).toBe(20);

    useStore.getState().undo();
    currentNode = useStore.getState().pages[0].nodes.find((entry) => entry.id === node.id) as FrameNode;
    expect(currentNode.x).toBe(10);

    useStore.getState().undo();
    currentNode = useStore.getState().pages[0].nodes.find((entry) => entry.id === node.id) as FrameNode;
    expect(currentNode.x).toBe(0);

    useStore.getState().redo();
    currentNode = useStore.getState().pages[0].nodes.find((entry) => entry.id === node.id) as FrameNode;
    expect(currentNode.x).toBe(10);

    useStore.getState().redo();
    currentNode = useStore.getState().pages[0].nodes.find((entry) => entry.id === node.id) as FrameNode;
    expect(currentNode.x).toBe(20);
  });
});