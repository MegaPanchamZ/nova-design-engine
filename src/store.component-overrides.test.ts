import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/novaAIService', () => ({
  generateUI: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock('./lib/measureText', () => ({
  measureText: vi.fn(() => ({ width: 120, height: 24 })),
}));

import { useStore } from './store';
import { createDefaultNode, FrameNode, Paint, SceneNode, TextNode } from './types';

const TEST_PAGE_ID = 'component-override-page';

const solidPaint = (id: string, color: string): Paint => ({
  id,
  type: 'solid',
  color,
  opacity: 1,
  visible: true,
});

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

const getNode = <T extends SceneNode = SceneNode>(id: string): T => {
  const node = getCurrentNodes().find((entry) => entry.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node as T;
};

describe('store component overrides', () => {
  beforeEach(() => {
    resetStore();
  });

  it('preserves local instance fill and text overrides when the master updates', () => {
    const component = createDefaultNode('component', 20, 20) as FrameNode;
    component.width = 140;
    component.height = 48;
    component.fills = [solidPaint('component-blue', '#2563EB')];
    component.fill = '#2563EB';

    const label = createDefaultNode('text', 16, 12) as TextNode;
    label.parentId = component.id;
    label.text = 'Buy now';
    label.name = 'Button Label';

    useStore.setState({
      pages: [{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [component, label] }],
    });

    useStore.getState().createInstanceFromComponent(component.id);

    const instanceRoot = getCurrentNodes().find((node) => node.type === 'instance' && node.masterId === component.id) as FrameNode;
    const instanceLabel = getCurrentNodes().find((node) => node.masterId === label.id) as TextNode;

    useStore.getState().updateNode(instanceRoot.id, {
      fills: [solidPaint('instance-red', '#DC2626')],
      fill: '#DC2626',
    });
    useStore.getState().updateNode(instanceLabel.id, { text: 'Subscribe' });

    useStore.getState().updateNode(component.id, { width: 220 });
    useStore.getState().updateNode(label.id, { fontSize: 28 });

    const nextInstanceRoot = getNode<FrameNode>(instanceRoot.id);
    const nextInstanceLabel = getNode<TextNode>(instanceLabel.id);

    expect(nextInstanceRoot.width).toBe(220);
    expect(nextInstanceRoot.fill).toBe('#DC2626');
    expect(nextInstanceRoot.instanceOverrides?.fills).toBeDefined();
    expect(nextInstanceLabel.text).toBe('Subscribe');
    expect(nextInstanceLabel.fontSize).toBe(28);
    expect(nextInstanceLabel.instanceOverrides?.text).toBe('Subscribe');
  });

  it('preserves local instance overrides across variant switches', () => {
    const variantGroupId = 'button-variants';

    const primary = createDefaultNode('component', 20, 20) as FrameNode;
    primary.name = 'Button / Primary';
    primary.variantGroupId = variantGroupId;
    primary.variantName = 'Primary';
    primary.width = 140;
    primary.height = 48;
    primary.fills = [solidPaint('primary-fill', '#2563EB')];
    primary.fill = '#2563EB';

    const primaryLabel = createDefaultNode('text', 16, 12) as TextNode;
    primaryLabel.parentId = primary.id;
    primaryLabel.text = 'Primary';

    const secondary = createDefaultNode('component', 220, 20) as FrameNode;
    secondary.name = 'Button / Secondary';
    secondary.variantGroupId = variantGroupId;
    secondary.variantName = 'Secondary';
    secondary.width = 180;
    secondary.height = 52;
    secondary.fills = [solidPaint('secondary-fill', '#0F172A')];
    secondary.fill = '#0F172A';

    const secondaryLabel = createDefaultNode('text', 18, 14) as TextNode;
    secondaryLabel.parentId = secondary.id;
    secondaryLabel.text = 'Secondary';

    useStore.setState({
      pages: [{ id: TEST_PAGE_ID, name: 'Page 1', nodes: [primary, primaryLabel, secondary, secondaryLabel] }],
    });

    useStore.getState().createInstanceFromComponent(primary.id);

    const instanceRoot = getCurrentNodes().find((node) => node.type === 'instance' && node.masterId === primary.id) as FrameNode;
    const instanceLabel = getCurrentNodes().find((node) => node.masterId === primaryLabel.id) as TextNode;

    useStore.getState().updateNode(instanceRoot.id, {
      fills: [solidPaint('instance-override', '#DC2626')],
      fill: '#DC2626',
    });
    useStore.getState().updateNode(instanceLabel.id, { text: 'Custom CTA' });

    useStore.getState().switchInstanceVariant(instanceRoot.id, secondary.id);

    const switchedRoot = getNode<FrameNode>(instanceRoot.id);
    const switchedChildren = getCurrentNodes().filter((node) => node.parentId === instanceRoot.id);
    const switchedLabel = switchedChildren.find((node) => node.type === 'text') as TextNode;

    expect(switchedRoot.masterId).toBe(secondary.id);
    expect(switchedRoot.width).toBe(180);
    expect(switchedRoot.fill).toBe('#DC2626');
    expect(switchedLabel.masterId).toBe(secondaryLabel.id);
    expect(switchedLabel.text).toBe('Custom CTA');
  });
});