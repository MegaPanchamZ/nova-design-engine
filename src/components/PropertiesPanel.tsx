import React, { useState, useCallback, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Settings2, Type, Move, Palette, Combine, Scissors, BoxSelect, Layers, AlignVerticalSpaceAround, AlignHorizontalSpaceAround, ChevronDown, Database, Minus, MousePointer2, Square, AlignLeft, AlignCenter as AlignCenterHorizontal, AlignRight, AlignStartVertical as AlignTop, AlignCenterVertical, AlignEndVertical as AlignBottom, ArrowLeftRight, ArrowUpDown, RotateCw, Maximize2, Monitor, Plus, Eye, EyeOff, Trash2, GripVertical, Component as ComponentIcon, Diamond } from 'lucide-react';
import { useStore } from '../store';
import { Effect, FrameNode, Interaction, Paint, PathNode, SceneNode, TextNode, createDefaultNode } from '../types';
import { performBooleanOperation } from '../lib/boolean';
import { GOOGLE_FONTS, loadFont } from '../services/fontService';
import { v4 as uuidv4 } from 'uuid';
import { exportToCode } from '../lib/codeExport';
import { ColorPickerDialog, FillEditorDialog } from './FillEditorDialog';
import { ModeTabs } from './ModeTabs';

export interface PropertiesPanelProps {
    className?: string;
    modeTabsAccentColor?: string;
}

interface ColorDialogState {
    isOpen: boolean;
    title: string;
    color: string;
}

const ScrubLabel = ({ label, value, onChange, onBlur, icon: Icon, step = 1, suffix = "" }: { label: string, value: number, onChange: (val: number) => void, onBlur?: () => void, icon?: LucideIcon | React.ComponentType<{ size: number; strokeWidth?: number; className?: string }>; step?: number, suffix?: string }) => {
    const isDragging = useRef(false);
    const startX = useRef(0);
    const startValue = useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        startX.current = e.clientX;
        startValue.current = value || 0;
        document.body.style.cursor = 'ew-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = e.clientX - startX.current;
        const multiplier = e.shiftKey ? 10 : 1;
        onChange(Math.round((startValue.current + delta * step * multiplier) * 100) / 100);
    }, [onChange, step]);

    const handleMouseUp = useCallback(() => {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (onBlur) onBlur();
    }, [onBlur]);

    return (
        <label 
            onMouseDown={handleMouseDown}
            className="w-8 flex items-center justify-center text-[10px] text-[#888] hover:text-indigo-400 cursor-ew-resize select-none transition-colors"
        >
            {Icon ? <Icon size={12} strokeWidth={2.5} /> : <span className="font-mono">{label}</span>}
        </label>
    );
};

const SectionHeader = ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div className="flex items-center justify-between h-10 px-4 group">
        <span className="text-[11px] font-bold text-[#EDEDED]">{title}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
        </div>
    </div>
);

const PropertyRow = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`flex items-center gap-2 px-4 mb-3 ${className}`}>
        {children}
    </div>
);

const InputField = ({ value, onChange, onBlur, disabled = false, prefix, suffix, className = "" }: { value: string | number; onChange: (val: string) => void; onBlur?: () => void; disabled?: boolean; prefix?: React.ReactNode; suffix?: React.ReactNode; className?: string }) => (
    <div className={`flex-1 flex items-center bg-[#2C2C2C] border border-transparent focus-within:border-indigo-500/50 rounded-sm px-1.5 h-7 transition-all ${disabled ? 'opacity-40' : ''} ${className}`}>
        {prefix}
        <input 
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={`w-full min-w-0 bg-transparent border-none outline-none text-[11px] text-[#EDEDED] font-mono px-1 h-full ${suffix ? 'text-right' : ''}`}
        />
        {suffix && (typeof suffix === 'string' ? <span className="ml-1 shrink-0 text-[9px] text-[#888] font-mono pr-1">{suffix}</span> : suffix)}
    </div>
);

const CenterHorizontalIcon = ({ size, className, strokeWidth = 2 }: { size: number; className?: string; strokeWidth?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M7 1V13" stroke="currentColor" strokeWidth={strokeWidth} />
        <rect x="4" y="3.5" width="6" height="7" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
);

const CenterVerticalIcon = ({ size, className, strokeWidth = 2 }: { size: number; className?: string; strokeWidth?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M1 7H13" stroke="currentColor" strokeWidth={strokeWidth} />
        <rect x="3.5" y="4" width="7" height="6" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
);

export const PropertiesPanel = ({ className, modeTabsAccentColor }: PropertiesPanelProps) => {
    const { pages, currentPageId, selectedIds, updateNode, addNode, deleteNodes, pushHistory, setSelectedIds, mode, setMode, variables, addVariable, selectMatching, alignSelected, groupSelected, createComponentFromSelection, createInstanceFromComponent, createVariantFromComponent, switchInstanceVariant } = useStore();
  const [expandedPadding, setExpandedPadding] = useState(false);
  const [expandedRadius, setExpandedRadius] = useState(false);
    const [exportScale, setExportScale] = useState('1x');
    const [exportFormat, setExportFormat] = useState('TSX');
        const [isFillEditorOpen, setIsFillEditorOpen] = useState(false);
        const [fillEditorStartIndex, setFillEditorStartIndex] = useState(0);
                const [colorDialog, setColorDialog] = useState<ColorDialogState>({ isOpen: false, title: 'Color', color: '#D9D9D9' });
                const colorApplyRef = useRef<((nextColor: string) => void) | null>(null);

  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const selectedNode = selectedNodes[0];
    const selectedComponentNode = selectedNode?.type === 'component' ? (selectedNode as FrameNode) : null;
    const selectedInstanceNode = selectedNode?.type === 'instance' ? (selectedNode as FrameNode) : null;
    const selectedInstanceMaster = selectedInstanceNode?.masterId
        ? nodes.find((node) => node.id === selectedInstanceNode.masterId && node.type === 'component') as FrameNode | undefined
        : undefined;
    const activeVariantGroupId = selectedComponentNode?.variantGroupId || selectedInstanceMaster?.variantGroupId;
    const variantOptions = activeVariantGroupId
        ? nodes.filter((node) => node.type === 'component' && (node as FrameNode).variantGroupId === activeVariantGroupId) as FrameNode[]
        : [];
    const instanceCountForSelectedComponent = selectedComponentNode
        ? nodes.filter((node) => node.type === 'instance' && node.masterId === selectedComponentNode.id).length
        : 0;
    const selectedFrameNode = selectedNode && ['frame', 'section', 'group', 'component', 'instance'].includes(selectedNode.type) ? (selectedNode as FrameNode) : null;
    const selectedTextNode = selectedNode?.type === 'text' ? (selectedNode as TextNode) : null;

    const isFrameLikeNode = (node: SceneNode) => ['frame', 'section', 'group', 'component', 'instance'].includes(node.type);
    const normalizeHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#D9D9D9';
    const getNodeDisplayColor = (node: SceneNode) => {
        const visibleSolid = [...(node.fills || [])].reverse().find((paint) => paint.type === 'solid' && paint.visible !== false);
        return normalizeHexColor(String(visibleSolid?.color || node.fill || '#D9D9D9'));
    };

    const isDescendantOf = (node: SceneNode, ancestorId: string): boolean => {
        let parentId = node.parentId;
        while (parentId) {
            if (parentId === ancestorId) return true;
            parentId = nodes.find((n) => n.id === parentId)?.parentId;
        }
        return false;
    };

    const frameColorTargets = selectedFrameNode
        ? nodes.filter((node) => isDescendantOf(node, selectedFrameNode.id) && !isFrameLikeNode(node))
        : [];

    const frameFillColorGroups = selectedFrameNode
        ? (() => {
            const grouped = new Map<string, { color: string; count: number }>();
            frameColorTargets.forEach((target) => {
                const solidFills = (target.fills || []).filter((paint) => paint.type === 'solid');
                if (solidFills.length === 0) {
                    const color = getNodeDisplayColor(target);
                    const existing = grouped.get(color);
                    grouped.set(color, { color, count: (existing?.count || 0) + 1 });
                    return;
                }

                solidFills.forEach((paint) => {
                    const color = normalizeHexColor(String(paint.color || '#D9D9D9'));
                    const existing = grouped.get(color);
                    grouped.set(color, { color, count: (existing?.count || 0) + 1 });
                });
            });

            return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
        })()
        : [];

  const handleBoolean = (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => {
    const pathData = performBooleanOperation(selectedNodes, operation);
    if (pathData) {
        // Create new path node
        const newNode = createDefaultNode('path', 0, 0) as PathNode;
        newNode.data = pathData;
        newNode.name = `${operation.charAt(0).toUpperCase() + operation.slice(1)} Result`;
        
        // Remove old nodes and add new one
        deleteNodes(selectedIds);
        addNode(newNode);
        setSelectedIds([newNode.id]);
        pushHistory();
    }
  };

    const handleChange = (key: string, value: unknown) => {
    selectedIds.forEach(id => {
                updateNode(id, { [key]: value } as Partial<SceneNode>);
    });
  };

    const updateVariableBinding = (bindingKey: 'fill' | 'stroke' | 'opacity' | 'text', variableId: string) => {
        const currentBindings = selectedNode.variableBindings || {};
        const nextBindings = { ...currentBindings };
        if (!variableId) {
            delete nextBindings[bindingKey];
        } else {
            nextBindings[bindingKey] = variableId;
        }
        handleChange('variableBindings', nextBindings);
    };

    const updateInteractions = (next: Interaction[]) => {
        handleChange('interactions', next);
    };

    const updateInteraction = (interactionId: string, patch: Partial<Interaction>) => {
        const next = (selectedNode?.interactions || []).map((interaction) =>
            interaction.id === interactionId ? { ...interaction, ...patch } : interaction
        );
        updateInteractions(next);
    };

    const updateInteractionAction = (
        interactionId: string,
        actionIndex: number,
        patch: Partial<Interaction['actions'][number]>
    ) => {
        const next = (selectedNode?.interactions || []).map((interaction) => {
            if (interaction.id !== interactionId) return interaction;
            const actions = interaction.actions.map((action, index) =>
                index === actionIndex ? { ...action, ...patch } : action
            );
            return { ...interaction, actions };
        });
        updateInteractions(next);
    };

    const removeInteractionAction = (interactionId: string, actionIndex: number) => {
        const next = (selectedNode?.interactions || []).map((interaction) => {
            if (interaction.id !== interactionId) return interaction;
            return { ...interaction, actions: interaction.actions.filter((_, index) => index !== actionIndex) };
        });
        updateInteractions(next);
    };

    const addInteractionAction = (interactionId: string) => {
        const next = (selectedNode?.interactions || []).map((interaction) => {
            if (interaction.id !== interactionId) return interaction;
            return {
                ...interaction,
                actions: [...interaction.actions, { type: 'setVariable' as const, targetId: variables[0]?.id, value: 0 }],
            };
        });
        updateInteractions(next);
    };

    const applySelectedFills = (nextFills: Paint[]) => {
        const lastSolid = [...nextFills].reverse().find((paint) => paint.type === 'solid');
        selectedIds.forEach((id) => {
            updateNode(
                id,
                {
                    fills: nextFills,
                    ...(lastSolid ? { fill: lastSolid.color } : { fill: 'transparent' })
                } as Partial<SceneNode>
            );
        });
    };

    const applySelectedStrokes = (nextStrokes: Paint[]) => {
        const lastSolid = [...nextStrokes].reverse().find((paint) => paint.type === 'solid');
        selectedIds.forEach((id) => {
            updateNode(id, { strokes: nextStrokes, ...(lastSolid ? { stroke: lastSolid.color } : {}) } as Partial<SceneNode>);
        });
    };

    const paintSwatchBackground = (paint: Paint): string => {
        if (paint.type === 'solid') {
            return paint.color || '#D9D9D9';
        }

        const stops = (paint.gradientStops || [
            { offset: 0, color: '#FFFFFF' },
            { offset: 1, color: '#000000' },
        ]).map((stop) => `${stop.color} ${Math.round((stop.offset || 0) * 100)}%`);

        if (paint.type === 'gradient-radial') {
            const centerX = Math.round((paint.gradientCenter?.x ?? 0.5) * 100);
            const centerY = Math.round((paint.gradientCenter?.y ?? 0.5) * 100);
            const radius = Math.round((paint.gradientRadius ?? 0.5) * 100);
            return `radial-gradient(circle ${radius}% at ${centerX}% ${centerY}%, ${stops.join(', ')})`;
        }

        const angle = Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 90;
        return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
    };

    const openColorDialog = (title: string, color: string, onApply: (nextColor: string) => void) => {
        colorApplyRef.current = onApply;
        setColorDialog({ isOpen: true, title, color: normalizeHexColor(color) });
    };

    const closeColorDialog = () => {
        setColorDialog((prev) => ({ ...prev, isOpen: false }));
        colorApplyRef.current = null;
        pushHistory();
    };

    const applyFrameColorGroup = (sourceColor: string, nextColor: string) => {
        if (!selectedFrameNode || frameColorTargets.length === 0) return;
        const source = normalizeHexColor(sourceColor);
        const target = normalizeHexColor(nextColor);

        frameColorTargets.forEach((frameChild) => {
            const childFills = frameChild.fills || [];

            if (childFills.length === 0) {
                if (normalizeHexColor(frameChild.fill || '#D9D9D9') === source) {
                    updateNode(frameChild.id, { fill: target });
                }
                return;
            }

            const nextFills = childFills.map((paint) => {
                if (paint.type !== 'solid') return paint;
                const paintColor = normalizeHexColor(String(paint.color || '#D9D9D9'));
                if (paintColor !== source) return paint;
                return { ...paint, color: target };
            });

            const lastSolid = [...nextFills].reverse().find((paint) => paint.type === 'solid');
            updateNode(frameChild.id, {
                fills: nextFills,
                ...(lastSolid ? { fill: String(lastSolid.color) } : {})
            });
        });
    };

  const handleFontChange = async (font: string) => {
    await loadFont(font);
    handleChange('fontFamily', font);
    pushHistory();
  };

  const handleBlur = () => {
    pushHistory();
  };

        const openFillEditor = (index = 0) => {
                setFillEditorStartIndex(index);
                setIsFillEditorOpen(true);
        };

        const closeFillEditor = () => {
                setIsFillEditorOpen(false);
                pushHistory();
        };

    const clampNonNegative = (value: number) => Math.max(0, value);
    const parseNonNegativeInt = (value: string) => clampNonNegative(parseInt(value) || 0);

  if (selectedNodes.length === 0) {
    return (
                        <aside id="properties-panel" className={`bg-[#141414] flex flex-col h-full w-full overflow-hidden select-none ${className || ''}`.trim()}>
                <ModeTabs mode={mode} onModeChange={setMode} accentColor={modeTabsAccentColor} />
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-4">
          <div className="w-12 h-12 rounded-full border border-[#2A2A2A] flex items-center justify-center text-[#2A2A2A]">
            <Settings2 size={24} />
          </div>
          <p className="text-[11px] text-[#555] uppercase font-bold tracking-widest leading-relaxed">Select a layer to adjust its properties</p>
        </div>
      </aside>
    );
  }

    const isFrame = ['frame', 'section', 'group', 'component', 'instance'].includes(selectedNode.type);

  return (
                <aside id="properties-panel" className={`bg-[#141414] flex flex-col h-full w-full overflow-hidden select-none ${className || ''}`.trim()}>
            <ModeTabs mode={mode} onModeChange={setMode} accentColor={modeTabsAccentColor} />

        {/* Selection Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#2A2A2A] bg-[#1E1E1E]">
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-indigo-500/20 flex items-center justify-center">
                    {isFrame ? <Square size={10} className="text-indigo-400" /> : <Layers size={10} className="text-indigo-400" />}
                </div>
                <span className="text-[11px] font-bold text-[#EDEDED] truncate max-w-[100px]">{selectedNode.name}</span>
                <ChevronDown size={10} className="text-[#888]" />
            </div>
            <div className="flex items-center gap-1">
                <button 
                    onClick={selectMatching}
                    title="Select Matching Layers"
                    className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                >
                    <BoxSelect size={14} strokeWidth={2} />
                </button>
                <button 
                    onClick={() => {
                        if (selectedNodes.length > 1) handleBoolean('subtract');
                        else {
                            deleteNodes(selectedIds);
                            pushHistory();
                        }
                    }}
                    title={selectedNodes.length > 1 ? 'Boolean Subtract' : 'Delete Selection'}
                    className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                >
                    <Scissors size={14} />
                </button>
                <button 
                    onClick={() => {
                        if (selectedNodes.length > 1) handleBoolean('union');
                        else {
                            groupSelected();
                            pushHistory();
                        }
                    }}
                    title={selectedNodes.length > 1 ? 'Boolean Union' : 'Group Selection'}
                    className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                >
                    <Combine size={14} />
                </button>
                {selectedNodes.length > 1 && (
                    <>
                        <button
                            onClick={() => handleBoolean('intersect')}
                            title="Boolean Intersect"
                            className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                        >
                            <Minus size={14} />
                        </button>
                        <button
                            onClick={() => handleBoolean('exclude')}
                            title="Boolean Exclude"
                            className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                        >
                            <Plus size={14} />
                        </button>
                    </>
                )}
                {selectedNodes.length >= 1 && (
                    <button
                        onClick={() => {
                            createComponentFromSelection();
                            pushHistory();
                        }}
                        title="Create Component"
                        className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                    >
                        <ComponentIcon size={14} />
                    </button>
                )}
                {selectedNodes.length === 1 && selectedNode.type === 'component' && (
                    <button
                        onClick={() => {
                            createInstanceFromComponent(selectedNode.id);
                            pushHistory();
                        }}
                        title="Create Instance"
                        className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                    >
                        <Diamond size={14} />
                    </button>
                )}
                {selectedNodes.length === 1 && selectedNode.type === 'component' && (
                    <button
                        onClick={() => {
                            createVariantFromComponent(selectedNode.id);
                            pushHistory();
                        }}
                        title="Create Variant"
                        className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                    >
                        <Plus size={14} />
                    </button>
                )}
            </div>
        </div>

      <div className="flex-1 overflow-y-auto space-y-0 custom-scrollbar bg-[#1E1E1E]">
        {mode === 'inspect' ? (
            <section className="space-y-4">
                <div className="bg-[#0A0A0A] p-4 rounded-lg border border-[#2A2A2A]">
                    <span className="text-[10px] font-mono text-[#555] uppercase">CSS Output</span>
                    <pre className="text-[10px] text-green-500 font-mono mt-4 leading-relaxed overflow-x-auto">
{`.layer-${selectedNode.id.slice(0, 4)} {
  position: absolute;
  width: ${Math.round(selectedNode.width)}px;
  height: ${Math.round(selectedNode.height)}px;
  background: ${selectedNode.fill};
  opacity: ${selectedNode.opacity};
}`}
                    </pre>
                </div>

                <div className="bg-[#0A0A0A] p-4 rounded-lg border border-[#2A2A2A] relative group">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-mono text-[#555] uppercase">React / Tailwind Export</span>
                        <button 
                            onClick={() => {
                                const code = exportToCode(selectedNodes);
                                navigator.clipboard.writeText(code);
                            }}
                            className="text-[9px] text-indigo-400 font-black uppercase hover:text-white transition-colors"
                        >Copy</button>
                    </div>
                    <div className="h-48 overflow-y-auto custom-scrollbar">
                        <pre className="text-[9px] text-[#A1A1A1] font-mono leading-tight whitespace-pre-wrap">
                            {exportToCode(selectedNodes)}
                        </pre>
                    </div>
                </div>
            </section>
        ) : mode === 'prototype' ? (
            <div className="p-4 space-y-6">
                <div className="flex flex-col items-center justify-center py-6 text-[#555] gap-2 border-b border-[#2A2A2A]">
                    <Combine size={24} className="text-indigo-500" />
                    <span className="text-[9px] uppercase font-black tracking-widest">Interactions</span>
                </div>

                <section className="space-y-4">
                  <div className="flex flex-col gap-3">
                    {selectedNode.interactions?.map((it, idx) => (
                      <div key={it.id} className="bg-[#0A0A0A] p-3 rounded-lg border border-[#2A2A2A] space-y-3">
                        <div className="flex justify-between items-center">
                                                     <select
                                                        value={it.trigger}
                                                        onChange={(e) => {
                                                                updateInteraction(it.id, { trigger: e.target.value as Interaction['trigger'] });
                                                                pushHistory();
                                                        }}
                                                        className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-indigo-300 font-bold uppercase outline-none"
                                                     >
                                                        <option value="onClick">onClick</option>
                                                        <option value="onHover">onHover</option>
                                                        <option value="onDrag">onDrag</option>
                                                     </select>
                           <button 
                            onClick={() => {
                                const next = (selectedNode.interactions || []).filter(i => i.id !== it.id);
                                handleChange('interactions', next);
                                pushHistory();
                            }}
                            className="text-[10px] text-red-500/50 hover:text-red-500"
                           >
                            Remove
                           </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <select
                                value={it.condition?.variableId || ''}
                                onChange={(e) => {
                                    const variableId = e.target.value;
                                    if (!variableId) {
                                        updateInteraction(it.id, { condition: undefined });
                                        pushHistory();
                                        return;
                                    }
                                    updateInteraction(it.id, {
                                        condition: {
                                            variableId,
                                            operator: it.condition?.operator || '==',
                                            value: it.condition?.value ?? '',
                                        },
                                    });
                                    pushHistory();
                                }}
                                className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                            >
                                <option value="">No condition</option>
                                {variables.map((variable) => (
                                    <option key={variable.id} value={variable.id}>
                                        {variable.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={it.condition?.operator || '=='}
                                disabled={!it.condition}
                                onChange={(e) => {
                                    if (!it.condition) return;
                                    updateInteraction(it.id, {
                                        condition: {
                                            ...it.condition,
                                            operator: e.target.value as NonNullable<Interaction['condition']>['operator'],
                                        },
                                    });
                                    pushHistory();
                                }}
                                className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none disabled:opacity-40"
                            >
                                <option value="==">==</option>
                                <option value="!=">!=</option>
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                            </select>
                            <InputField
                                value={String(it.condition?.value ?? '')}
                                disabled={!it.condition}
                                onChange={(nextValue) => {
                                    if (!it.condition) return;
                                    updateInteraction(it.id, {
                                        condition: {
                                            ...it.condition,
                                            value: nextValue,
                                        },
                                    });
                                }}
                                onBlur={handleBlur}
                            />
                        </div>

                        {it.actions.map((action, aidx) => (
                          <div key={aidx} className="flex flex-col gap-2 border border-[#202020] rounded-md p-2">
                             <div className="flex items-center justify-between">
                                <span className="text-[8px] text-[#555] uppercase font-black tracking-tighter">Action {aidx + 1}</span>
                                <button
                                    onClick={() => {
                                        removeInteractionAction(it.id, aidx);
                                        pushHistory();
                                    }}
                                    className="text-[9px] text-red-400/70 hover:text-red-400"
                                >
                                    Remove
                                </button>
                             </div>
                             <select
                                value={action.type}
                                onChange={(e) => {
                                    const nextType = e.target.value as Interaction['actions'][number]['type'];
                                    if (nextType === 'navigate') {
                                      updateInteractionAction(it.id, aidx, { type: nextType, targetId: pages[0]?.id, value: undefined });
                                    } else if (nextType === 'toggleVisibility') {
                                      updateInteractionAction(it.id, aidx, { type: nextType, targetId: nodes[0]?.id, value: true });
                                    } else {
                                      updateInteractionAction(it.id, aidx, { type: nextType, targetId: variables[0]?.id, value: 0 });
                                    }
                                    pushHistory();
                                }}
                                className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                             >
                                <option value="navigate">navigate</option>
                                <option value="setVariable">setVariable</option>
                                <option value="toggleVisibility">toggleVisibility</option>
                             </select>
                             {action.type === 'navigate' && (
                                <select
                                    value={action.targetId || ''}
                                    onChange={(e) => {
                                      updateInteractionAction(it.id, aidx, { targetId: e.target.value });
                                      pushHistory();
                                    }}
                                    className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                                >
                                    {pages.map((page) => (
                                      <option key={page.id} value={page.id}>{page.name}</option>
                                    ))}
                                </select>
                             )}
                             {action.type === 'setVariable' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={action.targetId || variables[0]?.id || ''}
                                        onChange={(e) => {
                                          updateInteractionAction(it.id, aidx, { targetId: e.target.value });
                                          pushHistory();
                                        }}
                                        className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                                    >
                                        {variables.map((variable) => (
                                          <option key={variable.id} value={variable.id}>{variable.name}</option>
                                        ))}
                                    </select>
                                    <InputField
                                        value={String(action.value ?? '')}
                                        onChange={(nextValue) => updateInteractionAction(it.id, aidx, { value: nextValue })}
                                        onBlur={handleBlur}
                                    />
                                </div>
                             )}
                             {action.type === 'toggleVisibility' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={action.targetId || nodes[0]?.id || ''}
                                        onChange={(e) => {
                                          updateInteractionAction(it.id, aidx, { targetId: e.target.value });
                                          pushHistory();
                                        }}
                                        className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                                    >
                                        {nodes.map((node) => (
                                          <option key={node.id} value={node.id}>{node.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={String(action.value ?? true)}
                                        onChange={(e) => {
                                          updateInteractionAction(it.id, aidx, { value: e.target.value === 'true' });
                                          pushHistory();
                                        }}
                                        className="h-7 bg-[#141414] border border-[#2A2A2A] rounded px-2 text-[10px] text-[#EDEDED] outline-none"
                                    >
                                        <option value="true">Show</option>
                                        <option value="false">Hide</option>
                                    </select>
                                </div>
                             )}
                          </div>
                        ))}

                        <button
                          onClick={() => {
                            addInteractionAction(it.id);
                            pushHistory();
                          }}
                          className="w-full py-1.5 border border-dashed border-[#2A2A2A] text-[9px] text-[#666] uppercase font-bold hover:text-indigo-300 hover:border-indigo-500/50 rounded"
                        >
                          + Add Action
                        </button>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => {
                      const newInteraction: Interaction = {
                        id: uuidv4(),
                        trigger: 'onClick',
                                                actions: [{ type: 'setVariable', targetId: variables[0]?.id, value: 10 }]
                      };
                      handleChange('interactions', [...(selectedNode.interactions || []), newInteraction]);
                                            pushHistory();
                    }}
                    className="w-full py-2 border border-dashed border-[#2A2A2A] text-[10px] text-[#555] uppercase font-bold hover:border-indigo-500/50 hover:text-indigo-400 transition-colors rounded-lg"
                  >
                    + Add Interaction
                  </button>
                </section>

                <section className="space-y-4 pt-4 border-t border-[#2A2A2A]">
                   <span className="text-[10px] text-[#555] uppercase font-black">Conditional Logic</span>
                   <div className="p-4 bg-indigo-600/5 border border-indigo-500/20 rounded-lg">
                      <p className="text-[9px] text-indigo-300 leading-relaxed italic">"If Cart_Total {'>'} 50 then Show Banner"</p>
                   </div>
                </section>
            </div>
        ) : (
            <>
        {selectedNode.type === 'instance' && variantOptions.length > 0 && (
            <div className="px-4 py-3 border-b border-[#2A2A2A] space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-[#666] font-black">Variant</div>
                <select
                    value={selectedInstanceNode?.masterId || ''}
                    onChange={(e) => {
                        switchInstanceVariant(selectedNode.id, e.target.value);
                        pushHistory();
                    }}
                    className="w-full h-8 bg-[#2C2C2C] border border-[#3A3A3A] rounded-sm px-2 text-[11px] text-[#EDEDED] outline-none focus:border-indigo-500/50"
                >
                    {variantOptions.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                            {variant.variantName || variant.name}
                        </option>
                    ))}
                </select>
            </div>
        )}

        {(selectedNode.type === 'component' || selectedNode.type === 'instance') && (
            <div className="px-4 py-3 border-b border-[#2A2A2A] space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-[#666] font-black">Component</div>
                    <span className="text-[9px] px-2 py-0.5 rounded border border-[#3A3A3A] text-[#AFAFAF] uppercase tracking-wide">
                        {selectedNode.type === 'component' ? 'Master' : 'Instance'}
                    </span>
                </div>

                {selectedNode.type === 'instance' ? (
                    <>
                        <div className="text-[10px] text-[#9B9B9B] leading-relaxed">
                            Linked to: <span className="text-[#EDEDED]">{selectedInstanceMaster?.name || 'Missing component master'}</span>
                        </div>
                        <button
                            onClick={() => {
                                if (!selectedInstanceMaster) return;
                                setSelectedIds([selectedInstanceMaster.id]);
                            }}
                            disabled={!selectedInstanceMaster}
                            className="w-full h-8 rounded-sm border border-[#3A3A3A] text-[10px] uppercase tracking-wider text-[#D5D5D5] disabled:opacity-40 hover:bg-[#2C2C2C]"
                        >
                            Go To Master Component
                        </button>
                    </>
                ) : (
                    <>
                        <div className="text-[10px] text-[#9B9B9B] leading-relaxed">
                            Instances on canvas: <span className="text-[#EDEDED]">{instanceCountForSelectedComponent}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => {
                                    createInstanceFromComponent(selectedNode.id);
                                    pushHistory();
                                }}
                                className="h-8 rounded-sm border border-[#3A3A3A] text-[10px] uppercase tracking-wider text-[#D5D5D5] hover:bg-[#2C2C2C]"
                            >
                                New Instance
                            </button>
                            <button
                                onClick={() => {
                                    createVariantFromComponent(selectedNode.id);
                                    pushHistory();
                                }}
                                className="h-8 rounded-sm border border-[#3A3A3A] text-[10px] uppercase tracking-wider text-[#D5D5D5] hover:bg-[#2C2C2C]"
                            >
                                New Variant
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                const instanceIds = nodes
                                    .filter((node) => node.type === 'instance' && node.masterId === selectedNode.id)
                                    .map((node) => node.id);
                                if (instanceIds.length > 0) {
                                    setSelectedIds(instanceIds);
                                }
                            }}
                            disabled={instanceCountForSelectedComponent === 0}
                            className="w-full h-8 rounded-sm border border-[#3A3A3A] text-[10px] uppercase tracking-wider text-[#D5D5D5] disabled:opacity-40 hover:bg-[#2C2C2C]"
                        >
                            Select All Instances
                        </button>
                    </>
                )}
            </div>
        )}

        {variables.length > 0 && (
            <div className="px-4 py-3 border-b border-[#2A2A2A] space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-[#666] font-black">Variable Bindings</div>
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={selectedNode.variableBindings?.fill || ''}
                        onChange={(e) => {
                            updateVariableBinding('fill', e.target.value);
                            pushHistory();
                        }}
                        className="h-7 bg-[#2C2C2C] border border-[#3A3A3A] rounded-sm px-2 text-[10px] text-[#EDEDED] outline-none"
                    >
                        <option value="">Fill: none</option>
                        {variables.filter((variable) => variable.type === 'color').map((variable) => (
                            <option key={variable.id} value={variable.id}>Fill: {variable.name}</option>
                        ))}
                    </select>
                    <select
                        value={selectedNode.variableBindings?.stroke || ''}
                        onChange={(e) => {
                            updateVariableBinding('stroke', e.target.value);
                            pushHistory();
                        }}
                        className="h-7 bg-[#2C2C2C] border border-[#3A3A3A] rounded-sm px-2 text-[10px] text-[#EDEDED] outline-none"
                    >
                        <option value="">Stroke: none</option>
                        {variables.filter((variable) => variable.type === 'color').map((variable) => (
                            <option key={variable.id} value={variable.id}>Stroke: {variable.name}</option>
                        ))}
                    </select>
                    <select
                        value={selectedNode.variableBindings?.opacity || ''}
                        onChange={(e) => {
                            updateVariableBinding('opacity', e.target.value);
                            pushHistory();
                        }}
                        className="h-7 bg-[#2C2C2C] border border-[#3A3A3A] rounded-sm px-2 text-[10px] text-[#EDEDED] outline-none"
                    >
                        <option value="">Opacity: none</option>
                        {variables.filter((variable) => variable.type === 'number').map((variable) => (
                            <option key={variable.id} value={variable.id}>Opacity: {variable.name}</option>
                        ))}
                    </select>
                    {selectedNode.type === 'text' ? (
                        <select
                            value={selectedNode.variableBindings?.text || ''}
                            onChange={(e) => {
                                updateVariableBinding('text', e.target.value);
                                pushHistory();
                            }}
                            className="h-7 bg-[#2C2C2C] border border-[#3A3A3A] rounded-sm px-2 text-[10px] text-[#EDEDED] outline-none"
                        >
                            <option value="">Text: none</option>
                            {variables.filter((variable) => variable.type === 'string').map((variable) => (
                                <option key={variable.id} value={variable.id}>Text: {variable.name}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="h-7 rounded-sm border border-[#2A2A2A] bg-[#171717] text-[9px] text-[#666] flex items-center justify-center uppercase tracking-wider">
                            Text binding (text nodes only)
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Alignment & Distribution Bar */}
        <div id="alignment-controls" className="grid grid-cols-6 border-b border-[#2A2A2A] h-10 divide-x divide-[#2A2A2A]">
            {[
                { icon: AlignLeft, action: () => alignSelected('left'), label: 'Align Left' },
                { icon: CenterHorizontalIcon, action: () => alignSelected('center-h'), label: 'Align Horizontal Center' },
                { icon: AlignRight, action: () => alignSelected('right'), label: 'Align Right' },
                { icon: AlignTop, action: () => alignSelected('top'), label: 'Align Top' },
                { icon: CenterVerticalIcon, action: () => alignSelected('center-v'), label: 'Align Vertical Center' },
                { icon: AlignBottom, action: () => alignSelected('bottom'), label: 'Align Bottom' },
            ].map((item, i) => (
                <button 
                    key={i} 
                    onClick={() => {
                        item.action();
                        pushHistory();
                    }}
                    title={item.label}
                    className="flex items-center justify-center text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] transition-all"
                >
                    <item.icon size={14} strokeWidth={2} />
                </button>
            ))}
        </div>

        {/* Position & Size */}
        <div id="geometry-controls" className="py-4 border-b border-[#2A2A2A] space-y-3">
            <div className="flex items-center gap-2 px-4">
                <InputField 
                    value={Math.round(selectedNode.x)} 
                    onChange={(val) => handleChange('x', parseInt(val) || 0)}
                    onBlur={handleBlur}
                    prefix={<ScrubLabel label="X" value={selectedNode.x} onChange={(v) => handleChange('x', v)} onBlur={handleBlur} />}
                />
                <InputField 
                    value={Math.round(selectedNode.y)} 
                    onChange={(val) => handleChange('y', parseInt(val) || 0)}
                    onBlur={handleBlur}
                    prefix={<ScrubLabel label="Y" value={selectedNode.y} onChange={(v) => handleChange('y', v)} onBlur={handleBlur} />}
                />
            </div>
            <div className="flex items-center gap-2 px-4 relative group">
                <InputField 
                    value={Math.round(selectedNode.width)} 
                    onChange={(val) => handleChange('width', parseInt(val) || 0)}
                    onBlur={handleBlur}
                    prefix={<ScrubLabel label="W" value={selectedNode.width} onChange={(v) => handleChange('width', v)} onBlur={handleBlur} />}
                />
                <InputField 
                    value={Math.round(selectedNode.height)} 
                    onChange={(val) => handleChange('height', parseInt(val) || 0)}
                    onBlur={handleBlur}
                    prefix={<ScrubLabel label="H" value={selectedNode.height} onChange={(v) => handleChange('height', v)} onBlur={handleBlur} />}
                />
                <button 
                    onClick={() => {
                        const next = Math.max(1, Math.round((selectedNode.width + selectedNode.height) / 2));
                        handleChange('width', next);
                        handleChange('height', next);
                        pushHistory();
                    }}
                    title="Make Square"
                    className="absolute -right-1 group-hover:right-1 px-1 opacity-0 group-hover:opacity-100 transition-all text-[#555] hover:text-[#888]"
                >
                    <Combine size={10} />
                </button>
            </div>
            <div className="flex items-center gap-2 px-4">
                 <InputField 
                    value={Math.round(selectedNode.rotation || 0)} 
                    onChange={(val) => handleChange('rotation', parseInt(val) || 0)}
                    onBlur={handleBlur}
                    suffix="°"
                    prefix={<ScrubLabel label="R" value={selectedNode.rotation || 0} onChange={(v) => handleChange('rotation', v)} onBlur={handleBlur} icon={RotateCw} />}
                />
                <div className="flex-1 flex gap-2">
                    <InputField 
                        value={Math.round(selectedNode.cornerRadius || 0)} 
                        onChange={(val) => {
                            const r = parseNonNegativeInt(val);
                            handleChange('cornerRadius', r);
                            handleChange('individualCornerRadius', { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });
                        }}
                        onBlur={handleBlur}
                        prefix={<ScrubLabel label="CR" value={selectedNode.cornerRadius || 0} onChange={(v) => {
                            const safeRadius = clampNonNegative(v);
                            handleChange('cornerRadius', safeRadius);
                            handleChange('individualCornerRadius', { topLeft: safeRadius, topRight: safeRadius, bottomRight: safeRadius, bottomLeft: safeRadius });
                        }} onBlur={handleBlur} icon={Square} />}
                    />
                    <button 
                        onClick={() => setExpandedRadius(!expandedRadius)}
                        className={`w-8 h-7 shrink-0 rounded-sm flex items-center justify-center transition-colors ${expandedRadius ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#2C2C2C] text-[#888] hover:text-white'}`}
                    >
                        <Maximize2 size={12} />
                    </button>
                </div>
            </div>

            {expandedRadius && (
                <div className="px-4 grid grid-cols-2 gap-2">
                    <InputField 
                        value={selectedNode.individualCornerRadius?.topLeft || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, topLeft: parseNonNegativeInt(v) })}
                        prefix={<span className="text-[9px] text-[#666]">TL</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.topRight || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, topRight: parseNonNegativeInt(v) })}
                        prefix={<span className="text-[9px] text-[#666]">TR</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.bottomRight || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, bottomRight: parseNonNegativeInt(v) })}
                        prefix={<span className="text-[9px] text-[#666]">BR</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.bottomLeft || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, bottomLeft: parseNonNegativeInt(v) })}
                        prefix={<span className="text-[9px] text-[#666]">BL</span>}
                    />
                </div>
            )}

            <div className="px-4 pt-2 space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-[#888] font-bold uppercase tracking-widest">
                    <span>Corner Smoothing</span>
                    <span>{Math.round((selectedNode.cornerSmoothing || 0) * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedNode.cornerSmoothing || 0}
                    onChange={(e) => handleChange('cornerSmoothing', parseFloat(e.target.value))}
                    onMouseUp={handleBlur}
                    className="w-full h-1 bg-[#2C2C2C] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
            </div>
            
            <div className="px-4 pt-2 flex items-center justify-between">
                <span className="text-[10px] text-[#888] font-bold uppercase tracking-widest">Masking</span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={!!selectedNode.isMask}
                        onChange={(e) => handleChange('isMask', e.target.checked)}
                        className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-[#2C2C2C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#888] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                    <span className="ml-2 text-[10px] text-[#EDEDED] font-medium">Use as Mask</span>
                </label>
            </div>
            <div className="px-4 pt-1 text-[10px] text-[#666] leading-4">
                A mask clips sibling layers that come after it in the same parent.
            </div>
        </div>

        {/* Presets / Styles Section */}
        <div className="border-b border-[#2A2A2A] pb-4">
             <SectionHeader title="Styles & Presets" />
             <div className="px-4 grid grid-cols-2 gap-2">
                <button 
                    onClick={() => {
                        handleChange('fills', [{ id: uuidv4(), type: 'solid', color: '#ffffff20', opacity: 1, visible: true }]);
                        handleChange('effects', [
                            { id: uuidv4(), type: 'background-blur', radius: 10, visible: true },
                            { id: uuidv4(), type: 'layer-blur', radius: 0, visible: true },
                            { id: uuidv4(), type: 'drop-shadow', color: '#00000010', offset: { x: 0, y: 8 }, radius: 24, visible: true }
                        ]);
                        handleChange('stroke', '#ffffff40');
                        handleChange('strokeWidth', 1);
                        handleChange('cornerRadius', 16);
                        pushHistory();
                    }}
                    className="py-2 px-3 bg-[#2C2C2C] hover:bg-indigo-500/20 hover:text-indigo-400 rounded-sm text-[10px] font-bold transition-all border border-transparent hover:border-indigo-500/30"
                >
                    Glassmorphism
                </button>
                <button 
                    onClick={() => {
                        const gradient = {
                            id: uuidv4(),
                            type: 'gradient-linear',
                            gradientStops: [
                                { offset: 0, color: '#6366F1' },
                                { offset: 1, color: '#A855F7' }
                            ],
                            opacity: 1,
                            visible: true
                        };
                        handleChange('fills', [gradient]);
                        pushHistory();
                    }}
                    className="py-2 px-3 bg-[#2C2C2C] hover:bg-purple-500/20 hover:text-purple-400 rounded-sm text-[10px] font-bold transition-all border border-transparent hover:border-purple-500/30"
                >
                    Soft Gradient
                </button>
             </div>
        </div>

        {/* Resizing / Constraints */}
        <div className="py-4 border-b border-[#2A2A2A]">
                <SectionHeader title="Resizing" />
                <div className="px-4 space-y-3">
                    {selectedNode.type === 'text' ? (
                        <div className="flex bg-[#2C2C2C] rounded-sm p-0.5">
                            {[
                                { id: 'auto-width', label: 'Auto Width', horizontal: 'hug', vertical: 'hug', icon: ArrowLeftRight },
                                { id: 'auto-height', label: 'Auto Height', horizontal: 'fixed', vertical: 'hug', icon: ArrowUpDown },
                                { id: 'fixed', label: 'Fixed Size', horizontal: 'fixed', vertical: 'fixed', icon: BoxSelect },
                            ].map((opt) => {
                                const isActive = selectedNode.horizontalResizing === opt.horizontal && selectedNode.verticalResizing === opt.vertical;
                                return (
                                    <button 
                                        key={opt.id}
                                        onClick={() => {
                                            handleChange('horizontalResizing', opt.horizontal);
                                            handleChange('verticalResizing', opt.vertical);
                                            pushHistory();
                                        }}
                                        title={opt.label}
                                        className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xs transition-all ${
                                            isActive ? 'bg-[#1E1E1E] text-indigo-400 shadow-sm' : 'text-[#888] hover:text-[#DDD]'
                                        }`}
                                    >
                                        <opt.icon size={12} />
                                        <span className="text-[7px] mt-1 uppercase font-bold">{opt.label.split(' ')[1] || opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                             <select 
                                value={selectedNode.horizontalResizing} 
                                onChange={(e) => {
                                    handleChange('horizontalResizing', e.target.value);
                                    pushHistory();
                                }}
                                className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                            >
                                <option value="fixed">Fixed</option>
                                <option value="hug">Hug</option>
                                <option value="fill">Fill</option>
                            </select>
                            <select 
                                value={selectedNode.verticalResizing} 
                                onChange={(e) => {
                                    handleChange('verticalResizing', e.target.value);
                                    pushHistory();
                                }}
                                className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                            >
                                <option value="fixed">Fixed</option>
                                <option value="hug">Hug</option>
                                <option value="fill">Fill</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

        {/* Layout Section */}
        {isFrame && (
            <div id="layout-controls" className="border-b border-[#2A2A2A] pb-4">
                <SectionHeader title="Layout" actions={
                    <button 
                        onClick={() => {
                            const frameNode = selectedNode as FrameNode;
                            const next = frameNode.justifyContent === 'space-between' ? 'start' : 'space-between';
                            handleChange('justifyContent', next);
                            pushHistory();
                        }}
                        className="p-1 text-[#888] hover:text-white"
                        title="Toggle Space Between"
                    >
                        <Combine size={12} />
                    </button>
                } />
                <div className="px-4 space-y-3">
                    <div className="flex gap-1 p-1 bg-[#2C2C2C] rounded-sm">
                        {['none', 'horizontal', 'vertical', 'grid'].map((m) => (
                            <button 
                                key={m}
                                onClick={() => {
                                    handleChange('layoutMode', m);
                                    pushHistory();
                                }}
                                className={`flex-1 h-6 rounded-xs text-[10px] uppercase font-bold flex items-center justify-center transition-all ${
                                    (selectedNode as FrameNode).layoutMode === m ? 'bg-[#1E1E1E] text-white shadow-sm' : 'text-[#888] hover:text-[#DDD]'
                                }`}
                            >
                                {m === 'none' && <Square size={12} />}
                                {m === 'horizontal' && <AlignHorizontalSpaceAround size={12} />}
                                {m === 'vertical' && <AlignVerticalSpaceAround size={12} />}
                                {m === 'grid' && <Database size={12} />}
                            </button>
                        ))}
                    </div>

                    {(selectedNode as FrameNode).layoutMode === 'grid' && (
                        <div className="grid grid-cols-2 gap-2">
                            <InputField 
                                value={(selectedNode as FrameNode).gridColumns || 2}
                                onChange={(v) => {
                                    const trimmed = v.trim();
                                    if (!trimmed) {
                                        handleChange('gridColumns', 1);
                                        return;
                                    }
                                    const numeric = Number.parseInt(trimmed, 10);
                                    if (Number.isFinite(numeric) && String(numeric) === trimmed) {
                                        handleChange('gridColumns', Math.max(1, numeric));
                                    } else {
                                        handleChange('gridColumns', trimmed);
                                    }
                                }}
                                onBlur={handleBlur}
                                prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Cols</span>}
                            />
                            <InputField 
                                value={(selectedNode as FrameNode).gridRows || 2}
                                onChange={(v) => {
                                    const trimmed = v.trim();
                                    if (!trimmed) {
                                        handleChange('gridRows', 1);
                                        return;
                                    }
                                    const numeric = Number.parseInt(trimmed, 10);
                                    if (Number.isFinite(numeric) && String(numeric) === trimmed) {
                                        handleChange('gridRows', Math.max(1, numeric));
                                    } else {
                                        handleChange('gridRows', trimmed);
                                    }
                                }}
                                onBlur={handleBlur}
                                prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Rows</span>}
                            />
                        </div>
                    )}

                    {(selectedNode as FrameNode).layoutMode !== 'none' && (
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                value={(selectedNode as FrameNode).justifyContent}
                                onChange={(e) => {
                                    handleChange('justifyContent', e.target.value);
                                    pushHistory();
                                }}
                                className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                            >
                                <option value="start">Main: Start</option>
                                <option value="center">Main: Center</option>
                                <option value="end">Main: End</option>
                                <option value="space-between">Main: Space Between</option>
                            </select>
                            <select
                                value={(selectedNode as FrameNode).alignItems}
                                onChange={(e) => {
                                    handleChange('alignItems', e.target.value);
                                    pushHistory();
                                }}
                                className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                            >
                                <option value="start">Cross: Start</option>
                                <option value="center">Cross: Center</option>
                                <option value="end">Cross: End</option>
                                <option value="stretch">Cross: Stretch</option>
                            </select>
                        </div>
                    )}
                    
                    {(selectedNode as FrameNode).layoutMode !== 'none' && (
                        <div className="grid grid-cols-2 gap-2">
                             <div className="flex flex-col gap-3">
                                <div className="w-full h-24 bg-[#2C2C2C] rounded-sm p-2 grid grid-cols-3 grid-rows-3 gap-1.5 focus-within:ring-1 ring-indigo-500/30">
                                    {[
                                        { x: 'start', y: 'start' }, { x: 'center', y: 'start' }, { x: 'end', y: 'start' },
                                        { x: 'start', y: 'center' }, { x: 'center', y: 'center' }, { x: 'end', y: 'center' },
                                        { x: 'start', y: 'end' }, { x: 'center', y: 'end' }, { x: 'end', y: 'end' }
                                    ].map((pos, i) => {
                                        const isVertical = (selectedNode as FrameNode).layoutMode === 'vertical';
                                        const props = isVertical 
                                            ? { justifyContent: pos.y, alignItems: pos.x } 
                                            : { justifyContent: pos.x, alignItems: pos.y };
                                        
                                        const isActive = (selectedNode as FrameNode).justifyContent === props.justifyContent && (selectedNode as FrameNode).alignItems === props.alignItems;

                                        return (
                                            <button 
                                                key={i}
                                                onClick={() => {
                                                    updateNode(selectedNode.id, props as Partial<FrameNode>);
                                                    pushHistory();
                                                }}
                                                className={`w-full h-full rounded-[1px] transition-all ${
                                                    isActive ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'bg-[#1E1E1E] hover:bg-[#333]'
                                                }`}
                                            />
                                        );
                                    })}
                                </div>
                             </div>
                             <div className="space-y-2">
                                <InputField 
                                    value={(selectedNode as FrameNode).gap} 
                                    onChange={(v) => handleChange('gap', parseInt(v) || 0)}
                                    prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Gap</span>}
                                />
                             </div>
                        </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-[#2A2A2A]">
                        <div className="grid grid-cols-2 gap-2">
                            <InputField
                                value={(selectedNode as FrameNode).padding.top}
                                onChange={(v) => {
                                    const p = parseInt(v) || 0;
                                    handleChange('padding', { top: p, right: p, bottom: p, left: p });
                                }}
                                suffix="px"
                                prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Pad</span>}
                            />
                            <button
                                onClick={() => setExpandedPadding(!expandedPadding)}
                                className={`h-7 rounded-sm flex items-center justify-center text-[9px] font-bold uppercase tracking-wider transition-colors ${expandedPadding ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#2C2C2C] text-[#888] hover:text-white'}`}
                            >
                                4-side
                            </button>
                        </div>
                        {expandedPadding && (
                            <div className="grid grid-cols-1 gap-2 mt-2 pt-2 border-t border-[#2A2A2A]">
                                <InputField
                                    value={(selectedNode as FrameNode).padding.top}
                                    onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, top: parseInt(v) || 0 })}
                                    suffix="px"
                                    prefix={<span className="text-[9px] text-[#666] w-6">Top</span>}
                                />
                                <InputField
                                    value={(selectedNode as FrameNode).padding.right}
                                    onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, right: parseInt(v) || 0 })}
                                    suffix="px"
                                    prefix={<span className="text-[9px] text-[#666] w-6">Right</span>}
                                />
                                <InputField
                                    value={(selectedNode as FrameNode).padding.bottom}
                                    onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, bottom: parseInt(v) || 0 })}
                                    suffix="px"
                                    prefix={<span className="text-[9px] text-[#666] w-6">Bottom</span>}
                                />
                                <InputField
                                    value={(selectedNode as FrameNode).padding.left}
                                    onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, left: parseInt(v) || 0 })}
                                    suffix="px"
                                    prefix={<span className="text-[9px] text-[#666] w-6">Left</span>}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Image Scaling Controls */}
        {selectedNode.type === 'image' && (
            <div id="image-controls" className="border-b border-[#2A2A2A] pb-4">
                <SectionHeader title="Image" />
                <div className="px-4 space-y-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] text-[#555] font-bold uppercase tracking-widest">Image URL</label>
                        <InputField 
                            value={selectedNode.src || ''} 
                            onChange={(v) => handleChange('src', v)}
                            onBlur={handleBlur}
                            prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">URL</span>}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] text-[#555] font-bold uppercase tracking-widest">Scaling</label>
                        <select 
                            value={selectedNode.imageScaleMode || 'fill'} 
                            onChange={(e) => handleChange('imageScaleMode', e.target.value)}
                            className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                        >
                            <option value="fill">Fill (Cover)</option>
                            <option value="fit">Fit (Contain)</option>
                            <option value="tile">Tile (Repeat)</option>
                            <option value="stretch">Stretch</option>
                        </select>
                    </div>
                    {selectedNode.imageScaleMode === 'tile' && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-[#555] font-bold uppercase tracking-widest">Tile Scale</label>
                            <InputField 
                                value={Math.round((selectedNode.imageScale || 1) * 100)} 
                                onChange={(v) => handleChange('imageScale', (parseInt(v) || 100) / 100)}
                                onBlur={handleBlur}
                                suffix="%"
                                prefix={<ScrubLabel label="S" value={(selectedNode.imageScale || 1) * 100} onChange={(v) => handleChange('imageScale', v / 100)} onBlur={handleBlur} icon={Database} />}
                            />
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Appearance */}
        <div id="appearance-controls" className="border-b border-[#2A2A2A] pb-4">
            <SectionHeader title="Appearance" actions={
                <>
                    <button 
                        onClick={() => {
                            handleChange('visible', !selectedNode.visible);
                            pushHistory();
                        }}
                        className="p-1 text-[#888] hover:text-white transition-colors"
                        title={selectedNode.visible ? 'Hide Layer' : 'Show Layer'}
                    >
                        <Layers size={14} />
                    </button>
                    <button 
                        onClick={() => {
                            const color = (selectedNode.fills || []).find((f) => f.visible !== false && f.type === 'solid')?.color || '#FFFFFF';
                            addVariable({ name: `${selectedNode.name} Color`, type: 'color', value: color });
                        }}
                        className="p-1 text-[#888] hover:text-white transition-colors"
                        title="Create Color Variable"
                    >
                        <Database size={14} />
                    </button>
                </>
            } />
            <div className="px-4 space-y-3">
                <div className="grid grid-cols-1 gap-2">
                    <InputField 
                        value={`${Math.round(selectedNode.opacity * 100)}%`} 
                        onChange={(v) => handleChange('opacity', (parseInt(v) || 0) / 100)}
                        prefix={<ScrubLabel label="OP" value={selectedNode.opacity * 100} onChange={(v) => handleChange('opacity', v / 100)} onBlur={handleBlur} icon={Database} />}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#888]">Blend Mode</span>
                    <select 
                        value={selectedNode.blendMode || 'normal'}
                        onChange={(e) => {
                            handleChange('blendMode', e.target.value);
                            pushHistory();
                        }}
                        className="bg-transparent text-[11px] text-[#EDEDED] font-medium outline-none cursor-pointer"
                    >
                        <option value="pass-through">Pass through</option>
                        <option value="normal">Normal</option>
                        <option value="multiply">Multiply</option>
                        <option value="screen">Screen</option>
                        <option value="overlay">Overlay</option>
                    </select>
                </div>
            </div>
        </div>

        {selectedFrameNode && frameFillColorGroups.length > 0 && (
            <div className="border-b border-[#2A2A2A] pb-2">
                <SectionHeader title="Frame Fill Colors" />
                <div className="px-4 space-y-2">
                    {frameFillColorGroups.map((group) => (
                        <div key={group.color} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    let sourceColor = group.color;
                                    openColorDialog('Frame Fill Color', group.color, (nextColor) => {
                                        applyFrameColorGroup(sourceColor, nextColor);
                                        sourceColor = nextColor;
                                    });
                                }}
                                className="relative w-8 h-8 rounded-sm overflow-hidden border border-[#2A2A2A] bg-[#2C2C2C] shrink-0"
                            >
                                <div className="w-full h-full" style={{ backgroundColor: group.color }} />
                            </button>
                            <InputField
                                value={group.color.toUpperCase().replace('#', '')}
                                onChange={(v) => {
                                    const hex = v.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                                    if (hex.length === 6) applyFrameColorGroup(group.color, `#${hex}`);
                                }}
                                onBlur={handleBlur}
                                className="flex-1"
                            />
                            <span className="text-[9px] text-[#666] font-mono w-10 text-right">{group.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Fill */}
        <div id="fill-controls" className="border-b border-[#2A2A2A] pb-2">
            <SectionHeader title="Fill" actions={
                <div className="flex gap-2">
                    <button
                        onClick={() => openFillEditor((selectedNode.fills || []).length > 0 ? (selectedNode.fills || []).length - 1 : 0)}
                        className="px-2 h-6 rounded-sm border border-[#3A3A3A] text-[9px] uppercase tracking-widest text-[#AAA] hover:text-white hover:border-indigo-500/60"
                        title="Open Advanced Fill Editor"
                    >
                        Edit
                    </button>
                    <button 
                        onClick={() => {
                            const newFill = { id: uuidv4(), type: 'solid', color: '#D9D9D9', opacity: 1, visible: true };
                            handleChange('fills', [...(selectedNode.fills || []), newFill]);
                        }}
                        className="p-1 text-[#888] hover:text-white"
                    >
                        <Plus size={14} />
                    </button>
                    <button 
                        onClick={() => {
                            const colorVar = variables.find(v => v.type === 'color');
                            if (!colorVar) return;
                            const nextFills = [...(selectedNode.fills || [])];
                            if (nextFills.length === 0) {
                                nextFills.push({ id: uuidv4(), type: 'solid', color: String(colorVar.value), opacity: 1, visible: true });
                            } else {
                                nextFills[nextFills.length - 1] = { ...nextFills[nextFills.length - 1], color: String(colorVar.value) };
                            }
                            handleChange('fills', nextFills);
                            handleChange('fill', String(colorVar.value));
                            pushHistory();
                        }}
                        className="p-1 text-[#888] hover:text-white"
                        title="Apply First Color Variable"
                    >
                        <Database size={14} />
                    </button>
                </div>
            } />
            <div className="px-4 space-y-2">
                {(selectedNode.fills || []).map((paint: Paint, idx: number) => (
                    <div key={paint.id} className="flex items-center gap-2 group">
                        <button
                            onClick={() => openFillEditor(idx)}
                            type="button"
                            className="w-9 h-9 shrink-0 rounded-sm overflow-hidden border border-[#2A2A2A] bg-[#2C2C2C] relative"
                            title="Edit Fill Layer"
                        >
                            <div 
                                className="w-full h-full" 
                                style={{ background: paintSwatchBackground(paint) }}
                            />
                        </button>
                        <div className="flex-[2] min-w-0 flex items-center gap-1 bg-[#2C2C2C] rounded-sm px-1.5 h-7">
                            <select 
                                value={paint.type}
                                onChange={(e) => {
                                    const nextType = e.target.value as Paint['type'];
                                    const next = [...(selectedNode.fills || [])];
                                    next[idx] = { ...next[idx], type: nextType };
                                    if (e.target.value.startsWith('gradient') && !next[idx].gradientStops) {
                                        next[idx].gradientStops = [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }];
                                    }
                                    handleChange('fills', next);
                                }}
                                className="bg-transparent text-[10px] text-[#A1A1A1] outline-none cursor-pointer"
                            >
                                <option value="solid">Solid</option>
                                <option value="gradient-linear">Linear</option>
                                <option value="gradient-radial">Radial</option>
                            </select>
                            <div className="w-[1px] h-3 bg-[#333] mx-1" />
                            {paint.type === 'solid' ? (
                                <InputField 
                                    value={paint.color?.toUpperCase().replace('#', '') || ''} 
                                    onChange={(v) => {
                                        const next = [...(selectedNode.fills || [])];
                                        next[idx] = { ...next[idx], color: '#' + v };
                                        handleChange('fills', next);
                                    }}
                                    className="flex-1 bg-transparent border-none p-0 h-auto text-[10px]"
                                />
                            ) : (
                                <div className="flex-1 flex gap-1 items-center">
                                    {(paint.gradientStops || []).map((stop, sidx: number) => (
                                        <button
                                            key={sidx}
                                            type="button"
                                            onClick={() =>
                                                openColorDialog('Gradient Stop Color', stop.color, (nextColor) => {
                                                    const nextFills = [...(selectedNode.fills || [])];
                                                    const nextStops = [...(nextFills[idx].gradientStops || [])];
                                                    if (!nextStops[sidx]) return;
                                                    nextStops[sidx] = { ...nextStops[sidx], color: nextColor };
                                                    nextFills[idx] = { ...nextFills[idx], gradientStops: nextStops };
                                                    handleChange('fills', nextFills);
                                                })
                                            }
                                            className="relative w-4 h-4 rounded-full border border-[#444] overflow-hidden"
                                        >
                                            <div className="w-full h-full" style={{ backgroundColor: stop.color }} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <InputField 
                            value={Math.round(paint.opacity * 100)} 
                            onChange={(v) => {
                                const next = [...(selectedNode.fills || [])];
                                next[idx] = { ...next[idx], opacity: (parseInt(v) || 0) / 100 };
                                handleChange('fills', next);
                            }}
                            suffix="%"
                            className="w-12"
                        />
                        <button
                            onClick={() => openFillEditor(idx)}
                            className="px-1.5 h-7 rounded-sm border border-[#333] text-[9px] uppercase tracking-wider text-[#999] hover:text-white hover:border-indigo-500/50"
                            title="Advanced Fill Settings"
                        >
                            FX
                        </button>
                        <div className="flex items-center gap-0.5 opacity-100">
                            <button 
                                onClick={() => {
                                    const next = [...(selectedNode.fills || [])];
                                    next[idx].visible = !next[idx].visible;
                                    handleChange('fills', next);
                                }}
                                className="p-1 text-[#777] hover:text-[#D0D0D0]"
                            >
                                {paint.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <button 
                                onClick={() => {
                                    const next = (selectedNode.fills || []).filter((_: Paint, i: number) => i !== idx);
                                    handleChange('fills', next);
                                }}
                                className="p-1 text-[#777] hover:text-[#FF4D4D]"
                            >
                                <Minus size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Stroke Section */}
        <div id="stroke-controls" className="border-b border-[#2A2A2A] pb-2">
             <SectionHeader title="Stroke" actions={
                <div className="flex gap-2">
                    <button 
                         onClick={() => {
                            const newStroke = { id: uuidv4(), type: 'solid', color: '#000000', opacity: 1, visible: true };
                            const currentStrokes = selectedNode.strokes || [];
                            handleChange('strokes', [...currentStrokes, newStroke]);
                            if (selectedNode.strokeWidth === 0) handleChange('strokeWidth', 1);
                        }}
                        className="p-1 text-[#888] hover:text-white"
                    >
                        <Plus size={14} />
                    </button>
                    <button className="p-1 text-[#888] hover:text-white"><Database size={14} /></button>
                </div>
             } />
             <div className="px-4 space-y-2">
                {(selectedNode.strokes || []).map((paint: Paint, idx: number) => (
                    <div key={paint.id} className="flex flex-col gap-2 group p-2 bg-[#2C2C2C]/30 rounded-sm">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    openColorDialog('Stroke Color', paint.color || '#000000', (nextColor) => {
                                        const next = [...(selectedNode.strokes || [])];
                                        next[idx] = { ...next[idx], color: nextColor };
                                        applySelectedStrokes(next);
                                    })
                                }
                                className="w-8 h-8 rounded-sm overflow-hidden border border-[#2A2A2A] bg-[#2C2C2C] relative"
                            >
                                <div className="w-full h-full" style={{ backgroundColor: paint.color }} />
                            </button>
                            <InputField 
                                value={paint.color?.toUpperCase().replace('#', '') || ''} 
                                onChange={(v) => {
                                    const next = [...(selectedNode.strokes || [])];
                                    next[idx] = { ...next[idx], color: '#' + v };
                                    handleChange('strokes', next);
                                    if (idx === next.length - 1) handleChange('stroke', '#' + v);
                                }}
                                className="flex-[2]"
                            />
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        const next = [...(selectedNode.strokes || [])];
                                        next[idx].visible = !next[idx].visible;
                                        handleChange('strokes', next);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#888]"
                                >
                                    {paint.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button 
                                    onClick={() => {
                                        const next = (selectedNode.strokes || []).filter((_: Paint, i: number) => i !== idx);
                                        handleChange('strokes', next);
                                        if (next.length === 0) handleChange('strokeWidth', 0);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#FF4D4D]"
                                >
                                    <Minus size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {(selectedNode.strokes || []).length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                        <InputField 
                            value={selectedNode.strokeWidth} 
                            onChange={(v) => handleChange('strokeWidth', parseInt(v) || 0)}
                            prefix={<ScrubLabel label="W" value={selectedNode.strokeWidth} onChange={(v) => handleChange('strokeWidth', v)} onBlur={handleBlur} />}
                        />
                        <select 
                            value={selectedNode.strokeAlign || 'inside'} 
                            onChange={(e) => handleChange('strokeAlign', e.target.value)}
                            className="flex-1 bg-[#2C2C2C] text-[10px] text-[#A1A1A1] rounded-sm px-1 h-7 border-none outline-none"
                        >
                            <option value="inside">Inside</option>
                            <option value="center">Center</option>
                            <option value="outside">Outside</option>
                        </select>
                    </div>
                )}
             </div>
        </div>

        {/* Effects Section */}
        <div id="effects-controls" className="border-b border-[#2A2A2A] pb-2">
             <SectionHeader title="Effects" actions={
                <button 
                    onClick={() => {
                        const newEffect = { 
                            id: uuidv4(), 
                            type: 'drop-shadow', 
                            color: '#00000040', 
                            offset: { x: 0, y: 4 }, 
                            radius: 4, 
                            spread: 0, 
                            visible: true 
                        };
                        handleChange('effects', [...(selectedNode.effects || []), newEffect]);
                    }}
                    className="p-1 text-[#888] hover:text-white"
                >
                    <Plus size={14} />
                </button>
             } />
             <div className="px-4 space-y-2">
                {(selectedNode.effects || []).map((effect: Effect, idx: number) => (
                    <div key={effect.id} className="space-y-2 group p-2 bg-[#1E1E1E] rounded-sm border border-[#2A2A2A] shadow-sm">
                        <div className="flex items-center gap-2">
                            <select 
                                value={effect.type}
                                onChange={(e) => {
                                    const effectType = e.target.value as Effect['type'];
                                    const next = [...(selectedNode.effects || [])];
                                    next[idx] = { ...next[idx], type: effectType };
                                    handleChange('effects', next);
                                }}
                                className="bg-transparent text-[10px] text-[#EDEDED] font-bold uppercase outline-none cursor-pointer flex-1"
                            >
                                <option value="drop-shadow">Drop Shadow</option>
                                <option value="inner-shadow">Inner Shadow</option>
                                <option value="layer-blur">Layer Blur</option>
                                <option value="background-blur">Background Blur</option>
                            </select>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        const next = [...(selectedNode.effects || [])];
                                        next[idx].visible = !next[idx].visible;
                                        handleChange('effects', next);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#888]"
                                >
                                    {effect.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button 
                                    onClick={() => {
                                        const next = (selectedNode.effects || []).filter((_: Effect, i: number) => i !== idx);
                                        handleChange('effects', next);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#FF4D4D]"
                                >
                                    <Minus size={12} />
                                </button>
                            </div>
                        </div>
                        
                        {(effect.type === 'drop-shadow' || effect.type === 'inner-shadow') && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <InputField 
                                        value={effect.offset?.x ?? 0} 
                                        onChange={(v) => {
                                            const next = [...(selectedNode.effects || [])];
                                            next[idx] = { ...next[idx], offset: { ...(next[idx].offset || { x: 0, y: 0 }), x: parseInt(v) || 0 } };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">X</span>}
                                    />
                                    <InputField 
                                        value={effect.offset?.y ?? 0} 
                                        onChange={(v) => {
                                            const next = [...(selectedNode.effects || [])];
                                            next[idx] = { ...next[idx], offset: { ...(next[idx].offset || { x: 0, y: 0 }), y: parseInt(v) || 0 } };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">Y</span>}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <InputField 
                                        value={effect.radius ?? 0} 
                                        onChange={(v) => {
                                            const next = [...(selectedNode.effects || [])];
                                            next[idx] = { ...next[idx], radius: parseInt(v) || 0 };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">Blur</span>}
                                    />
                                    <div className="flex-1 flex items-center bg-[#2C2C2C] border border-transparent rounded-sm px-1.5 h-7">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openColorDialog('Effect Color', (effect.color || '#00000040').substring(0, 7), (nextColor) => {
                                                    const next = [...(selectedNode.effects || [])];
                                                    const currentColor = effect.color || '#00000040';
                                                    next[idx] = { ...next[idx], color: nextColor + (currentColor.length > 7 ? currentColor.substring(7) : '40') };
                                                    handleChange('effects', next);
                                                })
                                            }
                                            className="w-4 h-4 rounded-full mr-1 border border-[#444] overflow-hidden"
                                        >
                                            <div className="w-full h-full" style={{ backgroundColor: (effect.color || '#00000040').substring(0, 7) }} />
                                        </button>
                                        <InputField 
                                            value={Math.round((parseInt((effect.color || '#00000040').substring(7), 16) || 64) / 2.55)}
                                            onChange={(v) => {
                                                const next = [...(selectedNode.effects || [])];
                                                const currentColor = effect.color || '#00000040';
                                                const hex = Math.min(255, Math.max(0, Math.round(parseInt(v) * 2.55))).toString(16).padStart(2, '0');
                                                next[idx] = { ...next[idx], color: currentColor.substring(0, 7) + hex };
                                                handleChange('effects', next);
                                            }}
                                            className="w-full bg-transparent border-none text-[9px]"
                                            suffix="%"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {(effect.type === 'layer-blur' || effect.type === 'background-blur') && (
                            <InputField 
                                value={effect.radius ?? 0} 
                                onChange={(v) => {
                                    const next = [...(selectedNode.effects || [])];
                                    next[idx] = { ...next[idx], radius: parseInt(v) || 0 };
                                    handleChange('effects', next);
                                }}
                                prefix={<span className="text-[9px] text-[#555] px-1 uppercase font-bold">Blur Intensity</span>}
                            />
                        )}
                    </div>
                ))}
             </div>
        </div>

        <FillEditorDialog
            isOpen={isFillEditorOpen}
            fills={selectedNode.fills || []}
            initialFillIndex={fillEditorStartIndex}
            onChange={(nextFills) => applySelectedFills(nextFills)}
            onClose={closeFillEditor}
        />

        <ColorPickerDialog
            isOpen={colorDialog.isOpen}
            title={colorDialog.title}
            color={colorDialog.color}
            onChange={(nextColor) => {
                setColorDialog((prev) => ({ ...prev, color: nextColor }));
                colorApplyRef.current?.(nextColor);
            }}
            onClose={closeColorDialog}
        />

        {/* Variables Section */}
        <div className="border-b border-[#2A2A2A] pb-4">
            <SectionHeader title="Variables" actions={
                <button
                    onClick={() => addVariable({ name: 'Token', type: 'color', value: '#FFFFFF' })}
                    className="p-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                    <Database size={14} />
                </button>
            } />
            <div className="px-4 space-y-2">
                {variables.length === 0 ? (
                    <div className="text-[10px] text-[#555] italic">No variables defined</div>
                ) : (
                    variables.map(v => (
                        <div key={v.id} className="flex items-center gap-2 group">
                            <div className="w-4 h-4 rounded-full border border-[#2A2A2A]" style={{ backgroundColor: v.value as string }} />
                            <span className="text-[11px] text-[#A1A1A1] flex-1">{v.name}</span>
                            <span className="text-[9px] text-[#555] font-mono">{String(v.value)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>


        {/* Export Section */}
        <div className="border-b border-[#2A2A2A] pb-4">
             <SectionHeader title="Export" actions={
                <button 
                    onClick={() => navigator.clipboard.writeText(exportToCode(selectedNodes))}
                    className="p-1 text-[#888] hover:text-white"
                    title="Copy Export"
                >
                    <Combine size={14} />
                </button>
             } />
             <div className="px-4 space-y-3">
                <div className="flex gap-2">
                    <select
                        value={exportScale}
                        onChange={(e) => setExportScale(e.target.value)}
                        className="flex-1 bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                    >
                        <option value="1x">1x</option>
                        <option value="2x">2x</option>
                        <option value="3x">3x</option>
                    </select>
                    <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value)}
                        className="flex-1 bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                    >
                        <option value="TSX">TSX</option>
                        <option value="TXT">TXT</option>
                        <option value="JSON">JSON</option>
                    </select>
                </div>
                <button 
                    onClick={() => {
                        const payload = exportFormat === 'JSON'
                            ? JSON.stringify(selectedNodes, null, 2)
                            : exportToCode(selectedNodes);
                        const blob = new Blob([payload], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const extension = exportFormat.toLowerCase();
                        a.download = `${selectedNode.name.toLowerCase()}_${exportScale}.${extension}`;
                        a.click();
                    }}
                    className="w-full py-1.5 bg-[#2C2C2C] hover:bg-[#333] transition-colors text-[11px] font-bold text-[#EDEDED] rounded-sm border border-[#2A2A2A]"
                >
                    Export {selectedNode.name} ({exportScale} {exportFormat})
                </button>
             </div>
        </div>

        {selectedNode.type === 'text' && (
          <section className="p-4 space-y-4 border-t border-[#2A2A2A] mt-4">
            <SectionHeader title="Typography" />
            <div className="space-y-4">
               <div className="flex flex-col gap-1.5 relative group">
                  <label className="text-[9px] text-[#555] font-bold uppercase tracking-widest">Font Family</label>
                  <div className="relative">
                    <select 
                        value={selectedTextNode?.fontFamily || ''}
                        onChange={(e) => handleFontChange(e.target.value)}
                        className="w-full bg-[#2C2C2C] border border-transparent focus:border-indigo-500/50 px-2 py-1.5 text-[11px] text-[#EDEDED] rounded-sm appearance-none cursor-pointer outline-none"
                    >
                        {GOOGLE_FONTS.map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none" />
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <InputField 
                    value={selectedTextNode?.fontSize || 0} 
                    onChange={(v) => handleChange('fontSize', parseInt(v) || 0)}
                    onBlur={handleBlur}
                    prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Size</span>}
                  />
                  <InputField 
                    value={selectedTextNode?.lineHeight || ''} 
                    onChange={(v) => handleChange('lineHeight', parseInt(v) || 0)}
                    onBlur={handleBlur}
                    prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">LH</span>}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-[#555] font-bold uppercase tracking-widest">Alignment</label>
                  <div className="flex bg-[#2C2C2C] rounded-sm p-0.5">
                    {['left', 'center', 'right'].map(a => (
                        <button 
                        key={a}
                        onClick={() => handleChange('align', a)}
                        className={`flex-1 py-1 rounded-xs text-[8px] font-bold uppercase tracking-tight transition-all ${
                            selectedTextNode?.align === a ? 'bg-[#1E1E1E] text-white shadow-sm' : 'text-[#555] hover:text-[#A1A1A1]'
                        }`}
                        >
                        {a}
                        </button>
                    ))}
                  </div>
               </div>
            </div>
          </section>
        )}
            </>
        )}
      </div>

    </aside>
  );
};
