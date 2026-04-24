import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/novaAIService', () => ({
  generateUI: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock('./lib/measureText', () => ({
  measureText: vi.fn(() => ({ width: 120, height: 24 })),
}));

import { useStore } from './store';
import { createDefaultNode, NodeType, Paint } from './types';

const TEST_PAGE_ID = 'test-page';

type HierarchyMode = 'root' | 'frame-child' | 'nested-frame-child';

const paintableNodeTypes: NodeType[] = [
  'rect',
  'circle',
  'ellipse',
  'text',
  'path',
  'image',
  'frame',
  'section',
  'group',
  'component',
  'instance',
];

const hierarchyModes: HierarchyMode[] = ['root', 'frame-child', 'nested-frame-child'];

const createSolidPaint = (color: string): Paint => ({
  id: `solid-${color}`,
  type: 'solid',
  color,
  opacity: 1,
  visible: true,
});

const createGradientPaint = (): Paint => ({
  id: 'gradient-1',
  type: 'gradient-linear',
  gradientAngle: 45,
  gradientStops: [
    { offset: 0, color: '#FF0000' },
    { offset: 1, color: '#00FF00' },
  ],
  opacity: 1,
  visible: true,
});

const resetStore = () => {
  useStore.setState({
    pages: [{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [] }],
    currentPageId: TEST_PAGE_ID,
    selectedIds: [],
    history: [[{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [] }]],
    historyIndex: 0,
  });
};

const getCurrentNodes = () => {
  const state = useStore.getState();
  return state.pages.find((page) => page.id === state.currentPageId)?.nodes || [];
};

const getNodeById = (id: string) => {
  const node = getCurrentNodes().find((entry) => entry.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
};

const addNode = (type: NodeType, parentId?: string) => {
  const node = createDefaultNode(type, 24, 24);
  node.parentId = parentId;
  useStore.getState().addNode(node);
  return node.id;
};

const buildHierarchy = (mode: HierarchyMode): string | undefined => {
  if (mode === 'root') return undefined;

  const outerFrameId = addNode('frame');
  if (mode === 'frame-child') {
    return outerFrameId;
  }

  const innerFrameId = addNode('frame', outerFrameId);
  return innerFrameId;
};

describe('Store Paint Propagation Matrix', () => {
  beforeEach(() => {
    resetStore();
  });

  describe.each(hierarchyModes)('Hierarchy: %s', (hierarchy) => {
    describe.each(paintableNodeTypes)('Node Type: %s', (nodeType) => {
      it('propagates solid, gradient, and empty fill states consistently', () => {
        const parentId = buildHierarchy(hierarchy);
        const nodeId = addNode(nodeType, parentId);

        useStore.getState().updateNode(nodeId, { fills: [createSolidPaint('#3366FF')] });
        let updated = getNodeById(nodeId);
        expect(updated.fill).toBe('#3366FF');
        expect(updated.fills?.[0]?.type).toBe('solid');

        useStore.getState().updateNode(nodeId, { fills: [createGradientPaint()] });
        updated = getNodeById(nodeId);
        expect(updated.fills?.[0]?.type).toBe('gradient-linear');
        expect(updated.fill).toBe('#00FF00');

        useStore.getState().updateNode(nodeId, { fills: [] });
        updated = getNodeById(nodeId);
        expect(updated.fills).toEqual([]);
        expect(updated.fill).toBe('transparent');
      });
    });
  });

  it('does not mutate parent frame fills when child fills change', () => {
    const parentId = addNode('frame');
    const childId = addNode('text', parentId);

    useStore.getState().updateNode(parentId, { fills: [createSolidPaint('#111111')] });
    useStore.getState().updateNode(childId, { fills: [createSolidPaint('#FF44AA')] });

    const parent = getNodeById(parentId);
    const child = getNodeById(childId);

    expect(parent.fill).toBe('#111111');
    expect(child.fill).toBe('#FF44AA');
  });
});
