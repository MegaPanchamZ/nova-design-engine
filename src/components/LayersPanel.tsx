import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, Layers, ChevronDown, Frame, MousePointer2, Type, Circle, Square, Diamond, Component } from 'lucide-react';
import { useStore } from '../store';
import { SceneNode, createDefaultNode, Page } from '../types';
import {
  DndContext,
  closestCenter,
        DragCancelEvent,
        DragOverEvent,
    DragEndEvent,
    DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getLayerDropPosition, isHierarchyContainerNode, LayerDropPosition } from '../lib/layerHierarchy';

interface SortableLayerProps {
    key?: React.Key;
    node: SceneNode;
    depth: number;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onToggleVisibility: (id: string, visible: boolean) => void;
    onToggleLock: (id: string, locked: boolean) => void;
    onToggleCollapse: (id: string, collapsed: boolean) => void;
    dropPosition: LayerDropPosition | null;
}

const SortableLayer = ({ node, depth, isSelected, onSelect, onToggleVisibility, onToggleLock, onToggleCollapse, dropPosition }: SortableLayerProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(node.name || node.type);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: node.id, disabled: isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${depth * 16 + 12}px`,
        opacity: isDragging ? 0.3 : 1,
    };

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleRename = () => {
        setIsEditing(false);
        if (name.trim() && name !== node.name) {
            useStore.getState().updateNode(node.id, { name: name.trim() });
            useStore.getState().pushHistory();
        } else {
            setName(node.name || node.type);
        }
    };

    const getIcon = () => {
        if (node.isMask) return <Circle size={10} className="text-zinc-400 stroke-dasharray-2" />;
        switch (node.type) {
            case 'frame': return <Frame size={10} className="text-indigo-400" />;
            case 'component': return <Component size={10} className="text-purple-400" />;
            case 'instance': return <Diamond size={10} className="text-purple-400" />;
            case 'text': return <Type size={10} className="text-blue-400" />;
            case 'circle': return <Circle size={10} className="text-orange-400 fill-orange-400/20" />;
            case 'rect': return <Square size={10} className="text-green-400 fill-green-400/20" />;
            default: return <MousePointer2 size={10} />;
        }
    };

    const hasChildren = useStore.getState().pages.find(p => p.id === useStore.getState().currentPageId)?.nodes.some(n => n.parentId === node.id);
    const dropIndicatorLeft = `${depth * 16 + 30}px`;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => setIsEditing(true)}
            onMouseEnter={() => useStore.getState().setHoveredId(node.id)}
            onMouseLeave={() => useStore.getState().setHoveredId(null)}
            className={`group py-1 flex items-center gap-2 cursor-pointer border-r-2 transition-all relative ${
                dropPosition === 'inside'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-100'
                    :
                isSelected
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100'
                    : 'border-transparent text-[#A1A1A1] hover:bg-[#2A2A2A]/50 hover:text-[#EDEDED]'
            }`}
        >
            {dropPosition === 'before' && (
                <div className="absolute top-0 right-2 h-0.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" style={{ left: dropIndicatorLeft }} />
            )}
            {dropPosition === 'after' && (
                <div className="absolute bottom-0 right-2 h-0.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" style={{ left: dropIndicatorLeft }} />
            )}
            {dropPosition === 'inside' && (
                <>
                    <div className="absolute inset-y-0 right-2 rounded-sm border border-indigo-500/60 bg-indigo-500/5 pointer-events-none" style={{ left: dropIndicatorLeft }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-indigo-200 pointer-events-none">
                        Nest
                    </span>
                </>
            )}
            {depth > 0 && (
                <div 
                    className="absolute top-0 bottom-0 w-px bg-[#2A2A2A]" 
                    style={{ left: `${(depth - 1) * 16 + 21}px` }}
                />
            )}
            
            <div className="flex items-center gap-1 min-w-[32px]">
                {node.type === 'frame' || hasChildren ? (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id, !!node.collapsed); }}
                        className={`p-0.5 hover:bg-white/10 rounded transition-transform ${node.collapsed ? '-rotate-90' : ''}`}
                    >
                        <ChevronDown size={10} className="text-[#555]" />
                    </button>
                ) : (
                    <div className="w-4" />
                )}
                <div className="flex items-center justify-center w-4 h-4">
                    {getIcon()}
                </div>
            </div>
            
            {isEditing ? (
                <input 
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                            setName(node.name || node.type);
                        }
                    }}
                    className="flex-1 bg-indigo-600 text-white text-[11px] px-1 h-4 border-none outline-none rounded"
                />
            ) : (
                <span className={`text-[11px] flex-1 truncate ${isSelected ? 'font-bold' : ''}`}>
                    {node.name || node.type}
                </span>
            )}

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 px-2 transition-opacity">
               <button 
                onClick={(e) => { e.stopPropagation(); onToggleLock(node.id, node.locked); }}
                className={`p-1 transition-colors ${node.locked ? 'text-indigo-400' : 'text-[#555] hover:text-white'}`}
               >
                 {node.locked ? <Lock size={10} /> : <Unlock size={10} />}
               </button>
               <button 
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id, node.visible); }}
                className={`p-1 transition-colors ${node.visible ? 'text-[#555] hover:text-white' : 'text-red-500'}`}
               >
                 {node.visible ? <Eye size={10} /> : <EyeOff size={10} />}
               </button>
            </div>
        </div>
    );
};

interface SortablePageProps {
    key?: React.Key;
    page: Page;
    isActive: boolean;
    onSelect: (id: string) => void;
    onRename: (id: string, name: string) => void;
}

const SortablePage = ({ page, isActive, onSelect, onRename }: SortablePageProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(page.name);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: page.id, disabled: isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleRename = () => {
        setIsEditing(false);
        if (name.trim() && name !== page.name) {
            onRename(page.id, name.trim());
        } else {
            setName(page.name);
        }
    };

    return (
        <div 
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onSelect(page.id)}
            onDoubleClick={() => setIsEditing(true)}
            className={`px-3 py-1.5 rounded text-[11px] cursor-pointer truncate transition-colors ${
                isActive ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-[#A1A1A1] hover:bg-[#2A2A2A]'
            }`}
        >
            {isEditing ? (
                <input 
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                            setName(page.name);
                        }
                    }}
                    className="w-full bg-indigo-600 text-white text-[11px] px-1 h-4 border-none outline-none rounded"
                />
            ) : page.name}
        </div>
    );
};

export interface LayersPanelProps {
    className?: string;
    showFooterMeta?: boolean;
}

export const LayersPanel = ({ className, showFooterMeta = false }: LayersPanelProps) => {
  const { pages, setPages, updatePage, currentPageId, setPage, addPage, selectedIds, setSelectedIds, updateNode, addNode, pushHistory, moveNodeHierarchy } = useStore();
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ targetId: string; position: LayerDropPosition } | null>(null);

  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleVisibility = (id: string, current: boolean) => {
    updateNode(id, { visible: !current });
    pushHistory();
  };

  const toggleLock = (id: string, current: boolean) => {
    updateNode(id, { locked: !current });
    pushHistory();
  };

  const toggleCollapse = (id: string, current: boolean) => {
    updateNode(id, { collapsed: !current });
  };

  // Flattened hierarchy for sortable
  const getFlattenedNodes = (parentId?: string, depth = 0): { node: SceneNode, depth: number }[] => {
    let result: { node: SceneNode, depth: number }[] = [];
    const children = nodes.filter(n => n.parentId === parentId).reverse();
    children.forEach(child => {
        result.push({ node: child, depth });
        if (!child.collapsed) {
            result = [...result, ...getFlattenedNodes(child.id, depth + 1)];
        }
    });
    return result;
  };

  const flattened = getFlattenedNodes();

    const isNodeDescendant = (ancestorId: string, candidateId: string | undefined): boolean => {
        let currentId = candidateId;
        while (currentId) {
            if (currentId === ancestorId) return true;
            currentId = nodes.find((node) => node.id === currentId)?.parentId;
        }
        return false;
    };

    const handleDragStartAll = (event: DragStartEvent) => {
        const id = String(event.active.id);
        setDropIndicator(null);
    if (pages.some(p => p.id === id)) {
        setActivePageId(id);
    } else {
        setActiveLayerId(id);
    }
  };

    const handleDragOverAll = (event: DragOverEvent) => {
        if (!activeLayerId || !event.over) {
            setDropIndicator(null);
            return;
        }

        const overId = String(event.over.id);
        const targetNode = nodes.find((node) => node.id === overId);
        if (!targetNode) {
            setDropIndicator(null);
            return;
        }

        const translatedRect = event.active.rect.current.translated;
        const activeCenterY = translatedRect
            ? translatedRect.top + translatedRect.height / 2
            : event.over.rect.top + event.over.rect.height / 2;

        let position = getLayerDropPosition(targetNode, event.over.rect.top, event.over.rect.height, activeCenterY);
        if (position === 'inside' && isNodeDescendant(activeLayerId, overId)) {
            position = activeCenterY < event.over.rect.top + event.over.rect.height / 2 ? 'before' : 'after';
        }

        if (overId === activeLayerId) {
            setDropIndicator(null);
            return;
        }

        setDropIndicator({ targetId: overId, position });
    };

    const clearDragState = (_event?: DragCancelEvent | DragEndEvent) => {
        setActiveLayerId(null);
        setActivePageId(null);
        setDropIndicator(null);
    };

    const handleDragEndAll = (event: DragEndEvent) => {
    const { active, over } = event;
    const nextDropIndicator = dropIndicator;
    clearDragState(event);

    if (!over) return;

    if (pages.some(p => p.id === active.id)) {
        // Page Reordering
        if (active.id !== over.id) {
            const activeId = String(active.id);
            const overId = String(over.id);
            const oldIdx = pages.findIndex(p => p.id === activeId);
            const newIdx = pages.findIndex(p => p.id === overId);
            setPages(arrayMove(pages, oldIdx, newIdx));
            pushHistory();
        }
    } else {
        // Layer Reordering
        if (active.id !== over.id || nextDropIndicator?.position === 'inside') {
            const dragId = String(active.id);
            const targetId = nextDropIndicator?.targetId || String(over.id);
            const position = nextDropIndicator?.position;
            const targetNode = nodes.find(n => n.id === targetId);

            if (position) {
                moveNodeHierarchy(dragId, targetId, position);
            } else {
                if (targetNode && isHierarchyContainerNode(targetNode)) {
                    moveNodeHierarchy(dragId, targetId, 'inside');
                } else {
                    const oldIdx = nodes.findIndex(n => n.id === dragId);
                    const newIdx = nodes.findIndex(n => n.id === targetId);
                    moveNodeHierarchy(dragId, targetId, oldIdx < newIdx ? 'after' : 'before');
                }
            }
            pushHistory();
        }
    }
  };

  const dropTargetNode = dropIndicator ? nodes.find((node) => node.id === dropIndicator.targetId) : undefined;
  const dropSummary = dropIndicator && dropTargetNode
    ? `${dropIndicator.position === 'inside' ? 'Nest inside' : dropIndicator.position === 'before' ? 'Insert before' : 'Insert after'} ${dropTargetNode.name || dropTargetNode.type}`
    : null;

  return (
    <aside id="layers-panel" className={`bg-[#141414] flex flex-col h-full w-full select-none overflow-hidden ${className || ''}`.trim()}>
      <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStartAll}
                    onDragOver={handleDragOverAll}
                    onDragCancel={clearDragState}
          onDragEnd={handleDragEndAll}
        >
      {/* Pages Section */}
      <div className="border-b border-[#2A2A2A]">
        <div className="h-10 px-4 flex items-center justify-between">
           <span className="text-[10px] uppercase tracking-widest font-black text-[#666]">Pages</span>
           <button 
            onClick={() => addPage(`Page ${pages.length + 1}`)}
            className="text-[14px] text-[#A1A1A1] hover:text-white"
           >+</button>
        </div>
        <div className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto custom-scrollbar">
            <SortableContext
                items={pages.map(p => p.id)}
                strategy={verticalListSortingStrategy}
            >
                {pages.map(page => (
                    <SortablePage 
                        key={page.id}
                        page={page}
                        isActive={page.id === currentPageId}
                        onSelect={setPage}
                        onRename={(id, name) => {
                            updatePage(id, { name });
                            pushHistory();
                        }}
                    />
                ))}
            </SortableContext>
        </div>
      </div>

      <div className="h-10 px-4 flex items-center justify-between border-b border-[#2A2A2A] bg-[#0F0F0F]">
        <span className="text-[11px] uppercase tracking-wider font-bold text-[#A1A1A1] flex items-center gap-2">
          <Layers size={12} className="text-indigo-500" />
          Layers
        </span>
        <button 
          onClick={() => {
            const newNode = createDefaultNode('frame', 0, 0);
            addNode(newNode);
            pushHistory();
          }}
          className="text-[10px] text-indigo-400 font-bold cursor-pointer hover:text-indigo-300 transition-colors uppercase tracking-tight"
        >
          + Frame
        </button>
      </div>

            {dropSummary && (
                <div className="px-4 py-2 border-b border-indigo-500/20 bg-indigo-500/5 text-[10px] uppercase tracking-widest text-indigo-200 font-bold">
                    {dropSummary}
                </div>
            )}

      <div className="flex-1 py-1 text-sm overflow-y-auto custom-scrollbar">
          <SortableContext
            items={flattened.map(f => f.node.id)}
            strategy={verticalListSortingStrategy}
          >
            {flattened.map((f) => (
              <SortableLayer 
                key={f.node.id} 
                node={f.node} 
                depth={f.depth}
                isSelected={selectedIds.includes(f.node.id)}
                dropPosition={dropIndicator?.targetId === f.node.id ? dropIndicator.position : null}
                onSelect={(id) => setSelectedIds([id])}
                onToggleVisibility={toggleVisibility}
                onToggleLock={toggleLock}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                  styles: {
                      active: {
                          opacity: '0.5',
                      },
                  },
              }),
          }}>
            {activeLayerId ? (
              <div className="py-2 px-4 bg-[#2A2A2A] rounded shadow-2xl border border-indigo-500/50 text-[11px] text-white flex items-center gap-3">
                 <Layers size={10} className="text-indigo-400" />
                 {nodes.find(n => n.id === activeLayerId)?.name || 'Layer'}
              </div>
            ) : activePageId ? (
                <div className="py-2 px-4 bg-[#2A2A2A] rounded shadow-2xl border border-indigo-500/50 text-[11px] text-white flex items-center gap-3">
                 <Layers size={10} className="text-[#666]" />
                 {pages.find(p => p.id === activePageId)?.name || 'Page'}
              </div>
            ) : null}
          </DragOverlay>

        {nodes.length === 0 && (
          <div className="mt-8 px-6 py-4 rounded-lg mx-4 border border-dashed border-[#2A2A2A] text-center text-[#555] text-[10px] uppercase font-bold tracking-widest">
            No Layers
          </div>
        )}
      </div>
      </DndContext>

            {showFooterMeta ? (
                <div className="p-3 border-t border-[#2A2A2A] bg-[#0A0A0A]">
                    <div className="flex items-center gap-2 text-[9px] text-[#666] font-mono tracking-tighter uppercase overflow-hidden">
                        <span className="truncate">Page: {currentPage?.name || 'Untitled'}</span>
                    </div>
                </div>
            ) : null}
    </aside>
  );
};
