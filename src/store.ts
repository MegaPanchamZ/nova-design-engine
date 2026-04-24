import { create } from 'zustand';
import { DesignState, SceneNode, ToolType, Viewport, createDefaultNode, FrameNode, Page, Variable, Style, TextNode, SnapLine } from './types';
import { calculateLayout } from './lib/layoutUtils';
import { measureText } from './lib/measureText';
import { v4 as uuidv4 } from 'uuid';
import { generateUI, generateImage } from './services/novaAIService';
import { parseHTMLToNodes } from './lib/htmlParser';

interface DesignStore extends DesignState {
  setTool: (tool: ToolType) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setMode: (mode: DesignState['mode']) => void;
  setHoveredId: (id: string | null) => void;
  toggleRulers: () => void;
  addGuide: (type: 'horizontal' | 'vertical', position: number) => void;
  removeGuide: (id: string) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  // Page Actions
  addPage: (name: string) => void;
  updatePage: (id: string, updates: Partial<Page>) => void;
  setPage: (id: string) => void;
  setPages: (pages: Page[]) => void;
  // Node Actions
  addNode: (node: SceneNode) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  deleteNodes: (ids: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  sendAIChat: (message: string) => Promise<void>;
  generateUIFromPrompt: (prompt: string) => Promise<void>;
  groupSelected: () => void;
  alignSelected: (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v') => void;
  selectMatching: () => void;
  reorderNode: (id: string, index: number) => void;
  moveNodeHierarchy: (dragId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  // Variables & Styles
  addVariable: (variable: Omit<Variable, 'id'>) => void;
  addStyle: (style: Omit<Style, 'id'>) => void;
  // History
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

const initialPageId = uuidv4();

export const useStore = create<DesignStore>((set, get) => ({
  pages: [{ id: initialPageId, name: 'Page 1', nodes: [] }],
  currentPageId: initialPageId,
  variables: [],
  styles: [],
  selectedIds: [],
  hoveredId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  tool: 'select',
  history: [[{ id: initialPageId, name: 'Page 1', nodes: [] }]],
  historyIndex: 0,
  mode: 'design',
  showRulers: false,
  aiHistory: [],
  aiTweaks: [],
  guides: [],
  snapLines: [],

  setTool: (tool) => set({ tool }),
  setMode: (mode) => set({ mode }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  toggleRulers: () => set(s => ({ showRulers: !s.showRulers })),
  addGuide: (type, position) => set(s => ({ guides: [...s.guides, { id: uuidv4(), type, position }] })),
  removeGuide: (id) => set(s => ({ guides: s.guides.filter(g => g.id !== id) })),
  setSnapLines: (snapLines) => set({ snapLines }),
  
  setViewport: (viewport) => set((state) => ({ 
    viewport: { ...state.viewport, ...viewport } 
  })),

  setSelectedIds: (selectedIds) => set({ selectedIds }),

  sendAIChat: async (message: string) => {
    const { aiHistory, pages, currentPageId, selectedIds } = get();
    const currentPage = pages.find(p => p.id === currentPageId);
    if (!currentPage) return;

    const userMessage = { role: 'user' as const, content: message };
    set(s => ({ aiHistory: [...s.aiHistory, userMessage] }));

    const contextNodes = selectedIds.length > 0 
        ? currentPage.nodes.filter(n => selectedIds.includes(n.id) || (n.parentId && selectedIds.includes(n.parentId)))
        : currentPage.nodes.slice(0, 100);

    const rawResponse = await generateUI(message, aiHistory, contextNodes);
    
    if (!rawResponse) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "I'm sorry, I couldn't generate a response. Please try again." }] }));
        return;
    }

    // Parse structured sections with robust logic
    const extractBlock = (tag: string, str: string) => {
        const start = str.indexOf(`[${tag}]`);
        const end = str.indexOf(`[/${tag}]`);
        if (start !== -1 && end !== -1) {
            return str.substring(start + tag.length + 2, end).trim();
        }
        return null;
    };

    const aiText = extractBlock('MESSAGE', rawResponse) || "I have updated the design.";
    let html = extractBlock('HTML', rawResponse) || "";
    const tweaksStr = extractBlock('TWEAKS', rawResponse);

    // Handle Image Generation in HTML
    const imgRegex = /<img[^>]+src="GENERATE:([^"]+)"[^>]*>/g;
    let match;
    const pendingGenerations: { tag: string, prompt: string }[] = [];
    while ((match = imgRegex.exec(html)) !== null) {
        pendingGenerations.push({ tag: match[0], prompt: match[1] });
    }

    if (pendingGenerations.length > 0) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "Generating images for your design..." }] }));
        for (const gen of pendingGenerations) {
            const dataUrl = await generateImage(gen.prompt);
            if (dataUrl) {
                html = html.replace(gen.tag, gen.tag.replace(`src="GENERATE:${gen.prompt}"`, `src="${dataUrl}"`));
            } else {
                html = html.replace(gen.tag, gen.tag.replace(`src="GENERATE:${gen.prompt}"`, `src="https://placehold.co/600x400?text=Failed+to+Generate"`));
            }
        }
    }
    
    let tweaks: any[] = [];
    if (tweaksStr) {
        try {
            const rawTweaks = JSON.parse(tweaksStr);
            tweaks = rawTweaks.map((t: any) => ({
                id: uuidv4(),
                ...t,
                targetNodeId: t.targetId === 'Selection' ? selectedIds[0] : t.targetId,
                targetProperty: t.property,
                value: t.value || 0
            }));
        } catch (e) {
            console.error("Tweak parse error", e);
        }
    }

    if (!html) {
         set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: aiText || "Design updated." }] }));
         return;
    }

    const viewport = get().viewport;
    const basePosition = { 
        x: -viewport.x / viewport.zoom + 100, 
        y: -viewport.y / viewport.zoom + 100 
    };

    const newNodes = parseHTMLToNodes(html, basePosition);
    if (!newNodes || newNodes.length === 0) {
        set(s => ({ aiHistory: [...s.aiHistory, { role: 'assistant', content: "I generated some code but couldn't parse it into design elements." }] }));
        return;
    }
    
    set((state) => {
        const pages = state.pages.map(p => {
            if (p.id === state.currentPageId) {
                const newNodeIdSet = new Set(newNodes.map(n => n.id));
                const isIterative = newNodes.some(nn => p.nodes.some(en => en.id === nn.id));
                
                let filteredNodes = p.nodes;
                if (isIterative) {
                    filteredNodes = p.nodes.filter(n => !newNodeIdSet.has(n.id));
                } else if (state.selectedIds.length > 0) {
                    const selectedSet = new Set(state.selectedIds);
                    filteredNodes = p.nodes.filter(n => !selectedSet.has(n.id) && !selectedSet.has(n.parentId || ''));
                }

                return { ...p, nodes: [...filteredNodes, ...newNodes] };
            }
            return p;
        });

        return { 
            pages,
            selectedIds: newNodes.filter(n => !n.parentId).map(n => n.id),
            aiHistory: [...state.aiHistory, { role: 'assistant' as const, content: aiText }],
            aiTweaks: tweaks
        };
    });
    get().pushHistory();
  },

  generateUIFromPrompt: async (prompt: string) => {
    await get().sendAIChat(prompt);
  },

  addPage: (name) => set((state) => {
      const newPage = { id: uuidv4(), name, nodes: [] };
      return { 
          pages: [...state.pages, newPage],
          currentPageId: newPage.id
      };
  }),

  setPages: (pages) => set({ pages }),

  updatePage: (id, updates) => set((state) => ({
      pages: state.pages.map(p => p.id === id ? { ...p, ...updates } : p)
  })),

  setPage: (id) => set({ currentPageId: id, selectedIds: [] }),

  addNode: (node) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage) return state;

    let newNodes = [...currentPage.nodes, node];
    
    // Initial measurement for text nodes
    if (node.type === 'text') {
        const textNode = node as TextNode;
        const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
        const metrics = measureText(textNode.text, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);
        if (textNode.horizontalResizing === 'hug') (node as any).width = metrics.width;
        if (textNode.verticalResizing === 'hug') (node as any).height = metrics.height;
    }

    // Recursive Layout Trigger for New Node
    const runLayoutRecursively = (targetId: string, nodes: SceneNode[]): SceneNode[] => {
        const n = nodes.find(x => x.id === targetId);
        if (!n) return nodes;

        const frameId = n.type === 'frame' ? n.id : n.parentId;
        if (!frameId) return nodes;

        const frame = nodes.find(x => x.id === frameId);
        if (frame && frame.type === 'frame' && frame.layoutMode !== 'none') {
            const children = nodes.filter(x => x.parentId === frameId);
            const { frame: updatedFrame, children: updatedChildren } = calculateLayout(frame, children);
            
            let nextNodes = nodes.map(x => {
                if (x.id === updatedFrame.id) return updatedFrame;
                const updatedChild = updatedChildren.find(uc => uc.id === x.id);
                return updatedChild || x;
            });

            if (updatedFrame.parentId) {
                return runLayoutRecursively(updatedFrame.parentId, nextNodes);
            }
            return nextNodes;
        }
        
        if (n.parentId) {
            return runLayoutRecursively(n.parentId, nodes);
        }

        return nodes;
    };

    newNodes = runLayoutRecursively(node.id, newNodes);

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    return { pages, selectedIds: [node.id] };
  }),

  updateNode: (id, updates) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage) return state;

    let newNodes = currentPage.nodes.map((n) => {
        if (n.id === id) {
            let updated = { ...n, ...updates } as SceneNode;
            
            // Sync legacy fill/stroke updates with multi-paint system
            if (updates.fill !== undefined) {
                updated.fills = [{ id: uuidv4(), type: 'solid', color: updates.fill, opacity: updated.opacity || 1, visible: true }];
            }
            if (updates.stroke !== undefined) {
                updated.strokes = [{ id: uuidv4(), type: 'solid', color: updates.stroke, opacity: 1, visible: true }];
            }

            // Text sync logic
            if (updates.text !== undefined && updated.isAutoName) {
                updated.name = updates.text || 'Text';
            }
            if (updates.name !== undefined) {
                if (updates.name.trim() === '') {
                    updated.isAutoName = true;
                    if (updated.type === 'text') updated.name = (updated as any).text || 'Text';
                } else {
                    updated.isAutoName = false;
                }
            }

            // Self-resize HUG text nodes
            if (updated.type === 'text') {
                const textNode = updated as TextNode;
                // Important: Use current width as maxWidth ONLY if it's fixed/fill.
                // If it's HUG, we want the natural width (no wrapping unless there are hard breaks).
                const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
                const metrics = measureText(textNode.text, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);
                
                if (textNode.horizontalResizing === 'hug') updated.width = metrics.width;
                if (textNode.verticalResizing === 'hug') updated.height = metrics.height;
            }
            return updated;
        }
        return n;
    });

    // Handle spatial reordering for Auto Layout
    const node = newNodes.find(n => n.id === id);
    const hasSpatialUpdate = updates.x !== undefined || updates.y !== undefined;
    if (node && node.parentId && !node.isAbsolute && hasSpatialUpdate) {
        const parent = newNodes.find(n => n.id === node.parentId);
        if (parent && parent.type === 'frame' && parent.layoutMode !== 'none') {
            // Only consider non-absolute siblings for reordering
            const layoutSiblings = newNodes.filter(n => n.parentId === node.parentId && !n.isAbsolute && n.id !== node.id);
            let newIndex = layoutSiblings.length;

            if (parent.layoutMode === 'horizontal') {
                newIndex = layoutSiblings.findIndex(s => node.x < s.x + s.width / 2);
            } else if (parent.layoutMode === 'vertical') {
                newIndex = layoutSiblings.findIndex(s => node.y < s.y + s.height / 2);
            }

            if (newIndex === -1) newIndex = layoutSiblings.length;

            // Extract all children of this parent (including absolute ones)
            const allParentChildren = newNodes.filter(n => n.parentId === node.parentId);
            const otherNodes = newNodes.filter(n => n.parentId !== node.parentId);
            
            // Re-order the layout nodes specifically
            const reorderedLayoutNodes = [...layoutSiblings];
            reorderedLayoutNodes.splice(newIndex, 0, node);

            // Merge back absolute nodes into their original relative positions if possible, 
            // but for simplicity and stability in auto-layout, layout nodes should follow index.
            // Absolute nodes stay in their previous array positions.
            
            const finalChildren: SceneNode[] = [];
            let layoutIdx = 0;
            allParentChildren.forEach(origChild => {
                if (origChild.isAbsolute) {
                    finalChildren.push(origChild.id === id ? node : origChild);
                } else {
                    finalChildren.push(reorderedLayoutNodes[layoutIdx++]);
                }
            });
            
            // Sync newNodes array
            const mergedNodes: SceneNode[] = [];
            let childIdx = 0;
            newNodes.forEach(n => {
                if (n.parentId === node.parentId) {
                    mergedNodes.push(finalChildren[childIdx++]);
                } else {
                    mergedNodes.push(n);
                }
            });
            newNodes = mergedNodes;
        }
    }
    
    // Recursive Auto Layout Trigger
    const runLayoutRecursively = (targetId: string, nodes: SceneNode[]): SceneNode[] => {
        const node = nodes.find(n => n.id === targetId);
        if (!node) return nodes;

        const frameId = node.type === 'frame' ? node.id : node.parentId;
        if (!frameId) return nodes;

        const frame = nodes.find(n => n.id === frameId);
        if (frame && frame.type === 'frame' && frame.layoutMode !== 'none') {
            const children = nodes.filter(n => n.parentId === frameId);
            const { frame: updatedFrame, children: updatedChildren } = calculateLayout(frame, children);
            
            let nextNodes = nodes.map(n => {
                if (n.id === updatedFrame.id) return updatedFrame;
                const updatedChild = updatedChildren.find(uc => uc.id === n.id);
                return updatedChild || n;
            });

            // If the frame itself changed (e.g., due to 'Hug'), propagate up to its parent
            if (updatedFrame.parentId) {
                return runLayoutRecursively(updatedFrame.parentId, nextNodes);
            }
            return nextNodes;
        }
        
        // If node has parent but no layout on parent, maybe parent's parent has layout?
        // Actually, Figma only reflows if parent has layout.
        if (node.parentId) {
            return runLayoutRecursively(node.parentId, nodes);
        }

        return nodes;
    };

    newNodes = runLayoutRecursively(id, newNodes);

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    return { pages };
  }),

  groupSelected: () => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage || state.selectedIds.length === 0) return state;

    const selectedNodes = currentPage.nodes.filter(n => state.selectedIds.includes(n.id));
    const minX = Math.min(...selectedNodes.map(n => n.x));
    const minY = Math.min(...selectedNodes.map(n => n.y));
    const maxX = Math.max(...selectedNodes.map(n => n.x + n.width));
    const maxY = Math.max(...selectedNodes.map(n => n.y + n.height));

    const frame = createDefaultNode('frame', minX, minY) as FrameNode;
    frame.width = maxX - minX;
    frame.height = maxY - minY;
    frame.name = 'Group';

    const groupedNodes = currentPage.nodes.map(n => {
        if (state.selectedIds.includes(n.id)) {
            return {
                ...n,
                parentId: frame.id,
                x: n.x - minX,
                y: n.y - minY
            } as SceneNode;
        }
        return n;
    });

    const newNodes = [...groupedNodes, frame];
    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    
    return {
        pages,
        selectedIds: [frame.id]
    };
  }),

  reorderNode: (id, index) => set((state) => {
      const currentPage = state.pages.find(p => p.id === state.currentPageId);
      if (!currentPage) return state;

      const newNodes = [...currentPage.nodes];
      const oldIndex = newNodes.findIndex(n => n.id === id);
      const node = newNodes.splice(oldIndex, 1)[0];
      newNodes.splice(index, 0, node);
      
      const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
      return { pages };
  }),

  moveNodeHierarchy: (dragId, targetId, position: 'before' | 'after' | 'inside') => set((state) => {
      const currentPage = state.pages.find(p => p.id === state.currentPageId);
      if (!currentPage) return state;

      let newNodes = [...currentPage.nodes];
      const dragNode = newNodes.find(n => n.id === dragId);
      if (!dragNode) return state;

      // Calculate new parent and index
      let newParentId: string | undefined;
      let newIndex: number;

      const targetNode = newNodes.find(n => n.id === targetId);
      if (!targetNode && targetId !== 'root') return state;

      if (position === 'inside') {
          newParentId = targetId === 'root' ? undefined : targetId;
          newIndex = newNodes.length; // Place at end of list (visually top if reversed)
      } else {
          newParentId = targetNode?.parentId;
          const targetIdx = newNodes.findIndex(n => n.id === targetId);
          newIndex = position === 'before' ? targetIdx : targetIdx + 1;
      }

      // 1. Remove node
      newNodes = newNodes.filter(n => n.id !== dragId);
      
      // 2. Adjust coordinates if parent changed
      // (This is skipped here for simplicity as the user specifically asked for SIDEBAR dragging,
      // and usually you don't want items to jump in the canvas just because you moved them in layers)
      // Actually, if we change parent, we MUST adjust coordinates to keep visual pos
      // unless the user EXPECTS it to snap to the frame.
      // For sidebar drag, usually position preservation is key.

      const getGlobalPos = (id: string | undefined, list: SceneNode[]): {x: number, y: number} => {
          if (!id) return {x: 0, y: 0};
          const n = list.find(x => x.id === id);
          if (!n) return {x: 0, y: 0};
          const parentPos = getGlobalPos(n.parentId, list);
          return { x: n.x + parentPos.x, y: n.y + parentPos.y };
      };

      const oldGlobal = getGlobalPos(dragNode.parentId, currentPage.nodes);
      const newGlobal = getGlobalPos(newParentId, newNodes);

      const movedNode = {
          ...dragNode,
          parentId: newParentId,
          x: (dragNode.x + oldGlobal.x) - newGlobal.x,
          y: (dragNode.y + oldGlobal.y) - newGlobal.y
      };

      // 3. Insert at new index
      newNodes.splice(Math.min(newIndex, newNodes.length), 0, movedNode);

      const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
      return { pages };
  }),

  addVariable: (v) => set(s => ({ variables: [...s.variables, { ...v, id: uuidv4() }] })),
  addStyle: (st) => set(s => ({ styles: [...s.styles, { ...st, id: uuidv4() }] })),

  pushHistory: () => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(state.pages)));
    if (newHistory.length > 50) newHistory.shift();
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  deleteNodes: (ids) => set((state) => {
    const pages = state.pages.map(p => {
        if (p.id === state.currentPageId) {
            return { ...p, nodes: p.nodes.filter((n) => !ids.includes(n.id)) };
        }
        return p;
    });
    return { pages, selectedIds: [] };
  }),

  // Multi-Edit Logic
  selectMatching: () => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage || state.selectedIds.length === 0) return state;

    const firstSelected = currentPage.nodes.find(n => n.id === state.selectedIds[0]);
    if (!firstSelected) return state;

    const matchingIds = currentPage.nodes
        .filter(n => n.name === firstSelected.name && n.type === firstSelected.type)
        .map(n => n.id);
    
    return { selectedIds: matchingIds };
  }),

  alignSelected: (alignment) => set((state) => {
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage || state.selectedIds.length < 2) return state;

    const selectedNodes = currentPage.nodes.filter(n => state.selectedIds.includes(n.id));
    
    // Bounds calculation for the selection
    const left = Math.min(...selectedNodes.map(n => n.x));
    const right = Math.max(...selectedNodes.map(n => n.x + n.width));
    const top = Math.min(...selectedNodes.map(n => n.y));
    const bottom = Math.max(...selectedNodes.map(n => n.y + n.height));
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;

    let newNodes = [...currentPage.nodes];

    if (alignment === 'distribute-h' || alignment === 'distribute-v') {
        const sorted = [...selectedNodes].sort((a, b) => alignment === 'distribute-h' ? a.x - b.x : a.y - b.y);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        
        if (alignment === 'distribute-h') {
            const availableSpace = (last.x + last.width) - first.x;
            const totalWidths = sorted.reduce((sum, n) => sum + (n.width || 0), 0);
            const gap = (availableSpace - totalWidths) / (sorted.length - 1);
            let currentX = first.x;
            sorted.forEach(sn => {
                const nodeIdx = newNodes.findIndex(node => node.id === sn.id);
                if (nodeIdx !== -1) {
                  newNodes[nodeIdx] = { ...newNodes[nodeIdx], x: currentX };
                  currentX += (newNodes[nodeIdx].width || 0) + gap;
                }
            });
        } else {
            const availableSpace = (last.y + last.height) - first.y;
            const totalHeights = sorted.reduce((sum, n) => sum + (n.height || 0), 0);
            const gap = (availableSpace - totalHeights) / (sorted.length - 1);
            let currentY = first.y;
            sorted.forEach(sn => {
                const nodeIdx = newNodes.findIndex(node => node.id === sn.id);
                if (nodeIdx !== -1) {
                  newNodes[nodeIdx] = { ...newNodes[nodeIdx], y: currentY };
                  currentY += (newNodes[nodeIdx].height || 0) + gap;
                }
            });
        }
    } else {
        newNodes = newNodes.map(n => {
          if (!state.selectedIds.includes(n.id)) return n;
          
          let newX = n.x;
          let newY = n.y;

          switch (alignment) {
            case 'left': newX = left; break;
            case 'right': newX = right - (n.width || 0); break;
            case 'center-h': newX = centerX - (n.width || 0) / 2; break;
            case 'top': newY = top; break;
            case 'bottom': newY = bottom - (n.height || 0); break;
            case 'center-v': newY = centerY - (n.height || 0) / 2; break;
          }
          return { ...n, x: newX, y: newY };
        });
    }

    const pages = state.pages.map(p => p.id === state.currentPageId ? { ...p, nodes: newNodes } : p);
    return { pages };
  }),

  // Prototyping Mutation
  mutateVariable: (id: string, newValue: any) => set((state) => {
      const variables = state.variables.map(v => v.id === id ? { ...v, value: newValue } : v);
      return { variables };
  }),

  undo: () => set((state) => {
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      return {
        pages: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),

  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      return {
        pages: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),
}));
