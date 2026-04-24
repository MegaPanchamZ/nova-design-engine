import React, { useState, useCallback, useRef } from 'react';
import { Settings2, Type, Move, Palette, Combine, Scissors, BoxSelect, Layers, AlignVerticalSpaceAround, AlignHorizontalSpaceAround, ChevronDown, Database, Minus, MousePointer2, Square, Zap, AlignLeft, AlignCenter as AlignCenterHorizontal, AlignRight, AlignStartVertical as AlignTop, AlignCenterVertical, AlignEndVertical as AlignBottom, ArrowLeftRight, ArrowUpDown, RotateCw, Maximize2, Monitor, Plus, Eye, EyeOff, Trash2, GripVertical } from 'lucide-react';
import { useStore } from '../store';
import { SceneNode, createDefaultNode, FrameNode, Interaction } from '../types';
import { performBooleanOperation } from '../lib/boolean';
import { GOOGLE_FONTS, loadFont } from '../services/fontService';
import { v4 as uuidv4 } from 'uuid';
import { exportToCode } from '../lib/codeExport';

const ScrubLabel = ({ label, value, onChange, onBlur, icon: Icon, step = 1, suffix = "" }: { label: string, value: number, onChange: (val: number) => void, onBlur?: () => void, icon?: any, step?: number, suffix?: string }) => {
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

const InputField = ({ value, onChange, onBlur, disabled = false, prefix, suffix, className = "" }: { value: any; onChange: (val: any) => void; onBlur?: () => void; disabled?: boolean; prefix?: React.ReactNode; suffix?: React.ReactNode; className?: string }) => (
    <div className={`flex-1 flex items-center bg-[#2C2C2C] border border-transparent focus-within:border-indigo-500/50 rounded-sm px-1.5 h-7 transition-all ${disabled ? 'opacity-40' : ''} ${className}`}>
        {prefix}
        <input 
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="w-full bg-transparent border-none outline-none text-[11px] text-[#EDEDED] font-mono px-1 h-full"
        />
        {suffix && (typeof suffix === 'string' ? <span className="text-[9px] text-[#888] font-mono pr-1">{suffix}</span> : suffix)}
    </div>
);

const CenterHorizontalIcon = ({ size, className, strokeWidth = 2 }: any) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M7 1V13" stroke="currentColor" strokeWidth={strokeWidth} />
        <rect x="4" y="3.5" width="6" height="7" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
);

const CenterVerticalIcon = ({ size, className, strokeWidth = 2 }: any) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M1 7H13" stroke="currentColor" strokeWidth={strokeWidth} />
        <rect x="3.5" y="4" width="7" height="6" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
);

export const PropertiesPanel = () => {
  const { pages, currentPageId, selectedIds, updateNode, addNode, deleteNodes, pushHistory, setSelectedIds, mode, setMode } = useStore();
  const [expandedPadding, setExpandedPadding] = useState(false);
  const [expandedRadius, setExpandedRadius] = useState(false);

  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const selectedNode = selectedNodes[0];

  const handleBoolean = (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => {
    const pathData = performBooleanOperation(selectedNodes, operation);
    if (pathData) {
        // Create new path node
        const newNode = createDefaultNode('path', 0, 0) as any;
        newNode.data = pathData;
        newNode.name = `${operation.charAt(0).toUpperCase() + operation.slice(1)} Result`;
        
        // Remove old nodes and add new one
        deleteNodes(selectedIds);
        addNode(newNode);
        setSelectedIds([newNode.id]);
        pushHistory();
    }
  };

  const handleChange = (key: string, value: any) => {
    selectedIds.forEach(id => {
        updateNode(id, { [key]: value } as any);
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

  if (selectedNodes.length === 0) {
    return (
      <aside id="properties-panel" className="w-64 border-l border-[#2A2A2A] bg-[#141414] flex flex-col h-full overflow-hidden select-none">
        <div className="flex border-b border-[#2A2A2A]">
          <div 
            onClick={() => setMode('design')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'design' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Design</div>
          <div 
            onClick={() => setMode('prototype')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'prototype' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Prototype</div>
          <div 
            onClick={() => setMode('inspect')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'inspect' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Inspect</div>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-4">
          <div className="w-12 h-12 rounded-full border border-[#2A2A2A] flex items-center justify-center text-[#2A2A2A]">
            <Settings2 size={24} />
          </div>
          <p className="text-[11px] text-[#555] uppercase font-bold tracking-widest leading-relaxed">Select a layer to adjust its properties</p>
        </div>
      </aside>
    );
  }

  const isFrame = selectedNode.type === 'frame';
  const parentFrame = selectedNode.parentId ? nodes.find(n => n.id === selectedNode.parentId) : null;

  return (
    <aside id="properties-panel" className="w-64 border-l border-[#2A2A2A] bg-[#141414] flex flex-col h-full overflow-hidden select-none">
      <div className="flex border-b border-[#2A2A2A]">
          <div 
            onClick={() => setMode('design')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'design' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Design</div>
          <div 
            onClick={() => setMode('prototype')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'prototype' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Prototype</div>
          <div 
            onClick={() => setMode('inspect')}
            className={`flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${mode === 'inspect' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-[#444] hover:text-[#777]'}`}
          >Inspect</div>
      </div>

        {/* Selection Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#2A2A2A] bg-[#1E1E1E]">
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-indigo-500/20 flex items-center justify-center">
                    {selectedNode.type === 'frame' ? <Square size={10} className="text-indigo-400" /> : <Layers size={10} className="text-indigo-400" />}
                </div>
                <span className="text-[11px] font-bold text-[#EDEDED] truncate max-w-[100px]">{selectedNode.name}</span>
                <ChevronDown size={10} className="text-[#888]" />
            </div>
            <div className="flex items-center gap-1">
                <button 
                    onClick={() => (useStore.getState() as any).selectMatching()}
                    title="Select Matching Layers"
                    className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"
                >
                    <BoxSelect size={14} strokeWidth={2} />
                </button>
                <button className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"><Scissors size={14} /></button>
                <button className="p-1.5 text-[#888] hover:text-[#EDEDED] hover:bg-[#2C2C2C] rounded-sm transition-all"><Combine size={14} /></button>
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
                           <span className="text-[10px] text-indigo-400 font-bold uppercase">{it.trigger}</span>
                           <button className="text-[10px] text-red-500/50 hover:text-red-500">Remove</button>
                        </div>
                        {it.actions.map((action, aidx) => (
                          <div key={aidx} className="flex flex-col gap-1">
                             <span className="text-[8px] text-[#555] uppercase font-black tracking-tighter">Action</span>
                             <div className="text-[10px] text-[#EDEDED] font-mono bg-[#141414] px-2 py-1 rounded">
                               {action.type} {'->'} {action.value}
                             </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => {
                      const newInteraction: Interaction = {
                        id: uuidv4(),
                        trigger: 'onClick',
                        actions: [{ type: 'setVariable', value: 10 }]
                      };
                      handleChange('interactions', [...(selectedNode.interactions || []), newInteraction]);
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
        {/* Alignment & Distribution Bar */}
        <div id="alignment-controls" className="grid grid-cols-6 border-b border-[#2A2A2A] h-10 divide-x divide-[#2A2A2A]">
            {[
                { icon: AlignLeft, action: () => (useStore.getState() as any).alignSelected('left'), label: 'Align Left' },
                { icon: CenterHorizontalIcon, action: () => (useStore.getState() as any).alignSelected('center-h'), label: 'Align Horizontal Center' },
                { icon: AlignRight, action: () => (useStore.getState() as any).alignSelected('right'), label: 'Align Right' },
                { icon: AlignTop, action: () => (useStore.getState() as any).alignSelected('top'), label: 'Align Top' },
                { icon: CenterVerticalIcon, action: () => (useStore.getState() as any).alignSelected('center-v'), label: 'Align Vertical Center' },
                { icon: AlignBottom, action: () => (useStore.getState() as any).alignSelected('bottom'), label: 'Align Bottom' },
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
                <button className="absolute -right-1 group-hover:right-1 px-1 opacity-0 group-hover:opacity-100 transition-all text-[#555] hover:text-[#888]"><Combine size={10} /></button>
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
                            const r = parseInt(val) || 0;
                            handleChange('cornerRadius', r);
                            handleChange('individualCornerRadius', { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });
                        }}
                        onBlur={handleBlur}
                        prefix={<ScrubLabel label="CR" value={selectedNode.cornerRadius || 0} onChange={(v) => {
                            handleChange('cornerRadius', v);
                            handleChange('individualCornerRadius', { topLeft: v, topRight: v, bottomRight: v, bottomLeft: v });
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
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, topLeft: parseInt(v) || 0 })}
                        prefix={<span className="text-[9px] text-[#666]">TL</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.topRight || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, topRight: parseInt(v) || 0 })}
                        prefix={<span className="text-[9px] text-[#666]">TR</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.bottomRight || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, bottomRight: parseInt(v) || 0 })}
                        prefix={<span className="text-[9px] text-[#666]">BR</span>}
                    />
                    <InputField 
                        value={selectedNode.individualCornerRadius?.bottomLeft || 0} 
                        onChange={(v) => handleChange('individualCornerRadius', { ...selectedNode.individualCornerRadius, bottomLeft: parseInt(v) || 0 })}
                        prefix={<span className="text-[9px] text-[#666]">BL</span>}
                    />
                </div>
            )}
            
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
        {!isFrame && (
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
                                onChange={(e) => handleChange('horizontalResizing', e.target.value)}
                                className="bg-[#2C2C2C] text-[10px] text-[#EDEDED] rounded-sm px-1.5 h-7 outline-none border border-transparent focus:border-indigo-500/50"
                            >
                                <option value="fixed">Fixed</option>
                                <option value="hug">Hug</option>
                                <option value="fill">Fill</option>
                            </select>
                            <select 
                                value={selectedNode.verticalResizing} 
                                onChange={(e) => handleChange('verticalResizing', e.target.value)}
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
        )}

        {/* Layout Section */}
        {isFrame && (
            <div id="layout-controls" className="border-b border-[#2A2A2A] pb-4">
                <SectionHeader title="Layout" actions={<button className="p-1 text-[#888]"><Combine size={12} /></button>} />
                <div className="px-4 space-y-3">
                    <div className="flex gap-1 p-1 bg-[#2C2C2C] rounded-sm">
                        {['none', 'horizontal', 'vertical', 'grid'].map((m) => (
                            <button 
                                key={m}
                                onClick={() => handleChange('layoutMode', m)}
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
                                                    updateNode(selectedNode.id, props as any);
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
                                <div className="grid grid-cols-2 gap-2">
                                    <InputField 
                                        value={(selectedNode as FrameNode).padding.top} 
                                        onChange={(v) => {
                                            const p = parseInt(v) || 0;
                                            handleChange('padding', { top: p, right: p, bottom: p, left: p });
                                        }}
                                        prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Pad</span>}
                                    />
                                    <button 
                                        onClick={() => setExpandedPadding(!expandedPadding)}
                                        className={`h-7 rounded-sm flex items-center justify-center transition-colors ${expandedPadding ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#2C2C2C] text-[#888] hover:text-white'}`}
                                    >
                                        <Monitor size={14} />
                                    </button>
                                </div>
                                {expandedPadding && (
                                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#2A2A2A]">
                                        <InputField 
                                            value={(selectedNode as FrameNode).padding.top} 
                                            onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, top: parseInt(v) || 0 })}
                                            prefix={<span className="text-[9px] text-[#666]">T</span>}
                                        />
                                        <InputField 
                                            value={(selectedNode as FrameNode).padding.right} 
                                            onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, right: parseInt(v) || 0 })}
                                            prefix={<span className="text-[9px] text-[#666]">R</span>}
                                        />
                                        <InputField 
                                            value={(selectedNode as FrameNode).padding.bottom} 
                                            onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, bottom: parseInt(v) || 0 })}
                                            prefix={<span className="text-[9px] text-[#666]">B</span>}
                                        />
                                        <InputField 
                                            value={(selectedNode as FrameNode).padding.left} 
                                            onChange={(v) => handleChange('padding', { ...(selectedNode as FrameNode).padding, left: parseInt(v) || 0 })}
                                            prefix={<span className="text-[9px] text-[#666]">L</span>}
                                        />
                                    </div>
                                )}
                             </div>
                        </div>
                    )}
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
                    <button className="p-1 text-[#888] hover:text-white transition-colors"><Layers size={14} /></button>
                    <button className="p-1 text-[#888] hover:text-white transition-colors"><Database size={14} /></button>
                </>
            } />
            <div className="px-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <InputField 
                        value={`${Math.round(selectedNode.opacity * 100)}%`} 
                        onChange={(v) => handleChange('opacity', (parseInt(v) || 0) / 100)}
                        prefix={<ScrubLabel label="OP" value={selectedNode.opacity * 100} onChange={(v) => handleChange('opacity', v / 100)} onBlur={handleBlur} icon={Database} />}
                    />
                    <InputField 
                        value={Math.round((selectedNode.cornerSmoothing || 0) * 100)} 
                        onChange={(v) => handleChange('cornerSmoothing', (parseInt(v) || 0) / 100)}
                        suffix="%"
                        prefix={<ScrubLabel label="CS" value={(selectedNode.cornerSmoothing || 0) * 100} onChange={(v) => handleChange('cornerSmoothing', v / 100)} onBlur={handleBlur} icon={Zap} />}
                    />
                </div>
                
                {/* Smoothing Slider */}
                <div className="space-y-1.5 px-0.5">
                    <div className="flex justify-between items-center text-[9px] text-[#666] font-bold uppercase">
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
                        onBlur={handleBlur}
                        className="w-full h-1 bg-[#2C2C2C] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#888]">Blend Mode</span>
                    <select className="bg-transparent text-[11px] text-[#EDEDED] font-medium outline-none cursor-pointer">
                        <option>Pass through</option>
                        <option>Normal</option>
                        <option>Multiply</option>
                        <option>Screen</option>
                        <option>Overlay</option>
                    </select>
                </div>
            </div>
        </div>

        {/* Variables Section */}
        <div className="border-b border-[#2A2A2A] pb-4">
            <SectionHeader title="Variables" actions={
                <button 
                  onClick={() => (useStore.getState() as any).addVariable({ name: 'Token', type: 'color', value: '#FFFFFF' })}
                  className="p-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Database size={14} />
                </button>
            } />
            <div className="px-4 space-y-2">
                {useStore.getState().variables.length === 0 ? (
                    <div className="text-[10px] text-[#555] italic">No variables defined</div>
                ) : (
                    useStore.getState().variables.map(v => (
                        <div key={v.id} className="flex items-center gap-2 group">
                             <div className="w-4 h-4 rounded-full border border-[#2A2A2A]" style={{ backgroundColor: v.value as string }} />
                             <span className="text-[11px] text-[#A1A1A1] flex-1">{v.name}</span>
                             <span className="text-[9px] text-[#555] font-mono">{String(v.value)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
        {/* Fill */}
        <div id="fill-controls" className="border-b border-[#2A2A2A] pb-2">
            <SectionHeader title="Fill" actions={
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            const newFill = { id: uuidv4(), type: 'solid', color: '#D9D9D9', opacity: 1, visible: true };
                            handleChange('fills', [...(selectedNode.fills || []), newFill]);
                        }}
                        className="p-1 text-[#888] hover:text-white"
                    >
                        <Plus size={14} />
                    </button>
                    <button className="p-1 text-[#888] hover:text-white"><Database size={14} /></button>
                </div>
            } />
            <div className="px-4 space-y-2">
                {(selectedNode.fills || []).map((paint: any, idx: number) => (
                    <div key={paint.id} className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-sm overflow-hidden border border-[#2A2A2A] bg-[#2C2C2C] relative">
                            <div 
                                className="w-full h-full" 
                                style={{ 
                                    background: paint.type === 'solid' ? paint.color : 
                                    `linear-gradient(to right, ${paint.gradientStops?.[0]?.color || '#fff'}, ${paint.gradientStops?.[1]?.color || '#000'})` 
                                }} 
                            />
                            <input 
                                type="color" 
                                value={paint.color || '#D9D9D9'} 
                                onChange={(e) => {
                                    const next = [...selectedNode.fills];
                                    next[idx] = { ...next[idx], color: e.target.value };
                                    handleChange('fills', next);
                                    if (idx === next.length - 1) handleChange('fill', e.target.value);
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex-[2] flex items-center gap-1 bg-[#2C2C2C] rounded-sm px-1.5 h-7">
                            <select 
                                value={paint.type}
                                onChange={(e) => {
                                    const next = [...selectedNode.fills];
                                    next[idx] = { ...next[idx], type: e.target.value };
                                    if (e.target.value.startsWith('gradient') && !next[idx].gradientStops) {
                                        next[idx].gradientStops = [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }];
                                    }
                                    handleChange('fills', next);
                                }}
                                className="bg-transparent text-[10px] text-[#A1A1A1] outline-none cursor-pointer"
                            >
                                <option value="solid">Solid</option>
                                <option value="gradient-linear">Linear</option>
                            </select>
                            <div className="w-[1px] h-3 bg-[#333] mx-1" />
                            {paint.type === 'solid' ? (
                                <InputField 
                                    value={paint.color?.toUpperCase().replace('#', '') || ''} 
                                    onChange={(v) => {
                                        const next = [...selectedNode.fills];
                                        next[idx] = { ...next[idx], color: '#' + v };
                                        handleChange('fills', next);
                                    }}
                                    className="flex-1 bg-transparent border-none p-0 h-auto text-[10px]"
                                />
                            ) : (
                                <div className="flex-1 flex gap-1 items-center">
                                    {(paint.gradientStops || []).map((stop: any, sidx: number) => (
                                        <div key={sidx} className="relative w-4 h-4 rounded-full border border-[#444] overflow-hidden">
                                            <div className="w-full h-full" style={{ backgroundColor: stop.color }} />
                                            <input 
                                                type="color" 
                                                value={stop.color} 
                                                onChange={(e) => {
                                                    const nextFills = [...selectedNode.fills];
                                                    const nextStops = [...nextFills[idx].gradientStops];
                                                    nextStops[sidx] = { ...nextStops[sidx], color: e.target.value };
                                                    nextFills[idx] = { ...nextFills[idx], gradientStops: nextStops };
                                                    handleChange('fills', nextFills);
                                                }}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <InputField 
                            value={Math.round(paint.opacity * 100)} 
                            onChange={(v) => {
                                const next = [...selectedNode.fills];
                                next[idx] = { ...next[idx], opacity: (parseInt(v) || 0) / 100 };
                                handleChange('fills', next);
                            }}
                            suffix="%"
                            className="w-12"
                        />
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => {
                                    const next = [...selectedNode.fills];
                                    next[idx].visible = !next[idx].visible;
                                    handleChange('fills', next);
                                }}
                                className="p-1 text-[#555] hover:text-[#888]"
                            >
                                {paint.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <button 
                                onClick={() => {
                                    const next = selectedNode.fills.filter((_: any, i: number) => i !== idx);
                                    handleChange('fills', next);
                                }}
                                className="p-1 text-[#555] hover:text-[#FF4D4D]"
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
                {(selectedNode.strokes || []).map((paint: any, idx: number) => (
                    <div key={paint.id} className="flex flex-col gap-2 group p-2 bg-[#2C2C2C]/30 rounded-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-sm overflow-hidden border border-[#2A2A2A] bg-[#2C2C2C] relative">
                                <div className="w-full h-full" style={{ backgroundColor: paint.color }} />
                                <input 
                                    type="color" 
                                    value={paint.color || '#000000'} 
                                    onChange={(e) => {
                                        const next = [...selectedNode.strokes];
                                        next[idx] = { ...next[idx], color: e.target.value };
                                        handleChange('strokes', next);
                                        if (idx === next.length - 1) handleChange('stroke', e.target.value);
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                            </div>
                            <InputField 
                                value={paint.color?.toUpperCase().replace('#', '') || ''} 
                                onChange={(v) => {
                                    const next = [...selectedNode.strokes];
                                    next[idx] = { ...next[idx], color: '#' + v };
                                    handleChange('strokes', next);
                                    if (idx === next.length - 1) handleChange('stroke', '#' + v);
                                }}
                                className="flex-[2]"
                            />
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        const next = [...selectedNode.strokes];
                                        next[idx].visible = !next[idx].visible;
                                        handleChange('strokes', next);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#888]"
                                >
                                    {paint.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button 
                                    onClick={() => {
                                        const next = selectedNode.strokes.filter((_: any, i: number) => i !== idx);
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
                {(selectedNode.effects || []).map((effect: any, idx: number) => (
                    <div key={effect.id} className="space-y-2 group p-2 bg-[#1E1E1E] rounded-sm border border-[#2A2A2A] shadow-sm">
                        <div className="flex items-center gap-2">
                            <select 
                                value={effect.type}
                                onChange={(e) => {
                                    const next = [...selectedNode.effects];
                                    next[idx] = { ...next[idx], type: e.target.value };
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
                                        const next = [...selectedNode.effects];
                                        next[idx].visible = !next[idx].visible;
                                        handleChange('effects', next);
                                    }}
                                    className="p-1 text-[#555] hover:text-[#888]"
                                >
                                    {effect.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button 
                                    onClick={() => {
                                        const next = selectedNode.effects.filter((_: any, i: number) => i !== idx);
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
                                        value={effect.offset.x} 
                                        onChange={(v) => {
                                            const next = [...selectedNode.effects];
                                            next[idx] = { ...next[idx], offset: { ...next[idx].offset, x: parseInt(v) || 0 } };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">X</span>}
                                    />
                                    <InputField 
                                        value={effect.offset.y} 
                                        onChange={(v) => {
                                            const next = [...selectedNode.effects];
                                            next[idx] = { ...next[idx], offset: { ...next[idx].offset, y: parseInt(v) || 0 } };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">Y</span>}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <InputField 
                                        value={effect.radius} 
                                        onChange={(v) => {
                                            const next = [...selectedNode.effects];
                                            next[idx] = { ...next[idx], radius: parseInt(v) || 0 };
                                            handleChange('effects', next);
                                        }}
                                        prefix={<span className="text-[9px] text-[#555] px-1 font-bold">Blur</span>}
                                    />
                                    <div className="flex-1 flex items-center bg-[#2C2C2C] border border-transparent rounded-sm px-1.5 h-7">
                                        <div className="w-4 h-4 rounded-full mr-1 border border-[#444] overflow-hidden">
                                            <div className="w-full h-full" style={{ backgroundColor: effect.color.substring(0, 7) }} />
                                            <input 
                                                type="color" 
                                                value={effect.color.substring(0, 7)} 
                                                onChange={(e) => {
                                                    const next = [...selectedNode.effects];
                                                    const opacity = (parseInt(effect.color.substring(7), 16) || 255).toString(16).padStart(2, '0');
                                                    next[idx] = { ...next[idx], color: e.target.value + (effect.color.length > 7 ? effect.color.substring(7) : '40') };
                                                    handleChange('effects', next);
                                                }}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                        </div>
                                        <InputField 
                                            value={Math.round((parseInt(effect.color.substring(7), 16) || 64) / 2.55)}
                                            onChange={(v) => {
                                                const next = [...selectedNode.effects];
                                                const hex = Math.min(255, Math.max(0, Math.round(parseInt(v) * 2.55))).toString(16).padStart(2, '0');
                                                next[idx] = { ...next[idx], color: effect.color.substring(0, 7) + hex };
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
                                value={effect.radius} 
                                onChange={(v) => {
                                    const next = [...selectedNode.effects];
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


        {/* Export Section */}
        <div className="border-b border-[#2A2A2A] pb-4">
             <SectionHeader title="Export" actions={<button className="p-1 text-[#888] hover:text-white"><Combine size={14} /></button>} />
             <div className="px-4 space-y-3">
                <div className="flex gap-2">
                    <InputField value="1x" onChange={() => {}} className="flex-1" suffix={<ChevronDown size={8} />} />
                    <InputField value="PNG" onChange={() => {}} className="flex-1" suffix={<ChevronDown size={8} />} />
                </div>
                <button 
                    onClick={() => {
                        const code = exportToCode(selectedNodes);
                        const blob = new Blob([code], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${selectedNode.name.toLowerCase()}.txt`;
                        a.click();
                    }}
                    className="w-full py-1.5 bg-[#2C2C2C] hover:bg-[#333] transition-colors text-[11px] font-bold text-[#EDEDED] rounded-sm border border-[#2A2A2A]"
                >
                    Export {selectedNode.name}
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
                        value={(selectedNode as any).fontFamily}
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
                    value={(selectedNode as any).fontSize} 
                    onChange={(v) => handleChange('fontSize', parseInt(v) || 0)}
                    onBlur={handleBlur}
                    prefix={<span className="text-[10px] text-[#888] font-bold px-1 tracking-tighter">Size</span>}
                  />
                  <InputField 
                    value={(selectedNode as any).lineHeight || ''} 
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
                            (selectedNode as any).align === a ? 'bg-[#1E1E1E] text-white shadow-sm' : 'text-[#555] hover:text-[#A1A1A1]'
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

      {/* Multiplayer Presence Mini-UI */}
      <div className="mt-auto border-t border-[#2A2A2A] p-4 flex items-center justify-between bg-[#0F0F0F]">
        <div className="flex -space-x-2">
          <div className="w-6 h-6 rounded-full border border-[#141414] bg-indigo-500 text-[8px] flex items-center justify-center font-bold text-white shadow-lg">JD</div>
          <div className="w-6 h-6 rounded-full border border-[#141414] bg-pink-500 text-[8px] flex items-center justify-center font-bold text-white shadow-lg">AM</div>
          <div className="w-6 h-6 rounded-full border border-[#141414] bg-[#2A2A2A] text-[8px] flex items-center justify-center font-bold text-[#A1A1A1]">+2</div>
        </div>
        <div className="flex items-center gap-1.5 bg-[#0A0A0A] px-2 py-1 rounded-full border border-indigo-500/20">
          <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-[8px] text-green-400/80 uppercase font-black tracking-widest">Sync</span>
        </div>
      </div>
    </aside>
  );
};
