import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, X, Send, Command, MessageSquare, History, User, Bot, Trash2, Copy, Check } from 'lucide-react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';

const SUGGESTED_PROMPTS = [
    "Build a sleek landing page",
    "Design a brutalist dashboard",
    "Create a minimal nav bar",
    "Add a feature grid"
];

export const NovaAI = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    
    const { aiHistory, sendAIChat, selectedIds, aiTweaks, updateNode } = useStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [aiHistory]);

    const handleSend = async (customPrompt?: string) => {
        const text = customPrompt || prompt;
        if (!text.trim() || isLoading) return;
        setIsLoading(true);
        try {
            await sendAIChat(text);
            if (!customPrompt) setPrompt('');
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="absolute bottom-6 right-[270px] z-[900] bg-indigo-600 hover:bg-indigo-500 text-white w-10 h-10 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 group overflow-hidden border-2 border-indigo-400/20"
            >
                <Sparkles size={18} />
            </button>
        );
    }

    return (
        <aside id="nova-ai-panel" className="w-80 border-l border-[#2A2A2A] bg-[#111111] flex flex-col h-full overflow-hidden select-none z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A] bg-[#141414]">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#EDEDED]">Nova Design Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => useStore.setState({ aiHistory: [], aiTweaks: [] })}
                        className="text-[#555] hover:text-[#EDEDED] transition-colors"
                        title="Clear History"
                    >
                        <Trash2 size={12} />
                    </button>
                    <button onClick={() => setIsOpen(false)} className="text-[#555] hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
            >
                {aiHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6">
                        <div className="space-y-4 opacity-40">
                            <Bot size={32} className="text-indigo-400 mx-auto" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-[#EDEDED] uppercase tracking-widest">Start a new session</p>
                                <p className="text-[10px] text-[#A1A1A1] leading-relaxed">Describe what you want to build or select elements on the canvas to iterate on them.</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 w-full">
                            {SUGGESTED_PROMPTS.map((p, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleSend(p)}
                                    className="p-3 text-[9px] text-[#A1A1A1] bg-[#181818] border border-[#222] rounded-xl hover:bg-[#222] hover:text-white hover:border-indigo-500/30 transition-all text-left font-medium active:scale-95"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    aiHistory.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300 relative group message-container`}>
                            <div className="flex items-center justify-between w-full px-1 mb-1">
                                <div className="flex items-center gap-2">
                                    {msg.role === 'assistant' ? <div className="w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center"><Bot size={8} className="text-white" /></div> : <div className="w-4 h-4 bg-[#2A2A2A] rounded-full flex items-center justify-center"><User size={8} className="text-[#A1A1A1]" /></div>}
                                    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#555]">
                                        {msg.role === 'assistant' ? 'Nova Core' : 'Designer'}
                                    </span>
                                </div>
                                {msg.role === 'assistant' && (
                                    <button 
                                        onClick={() => handleCopy(msg.content, i)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-[#555] hover:text-[#EDEDED] transition-all"
                                        title="Copy message"
                                    >
                                        {copiedIndex === i ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                                    </button>
                                )}
                            </div>
                            <div className={`max-w-[92%] p-4 rounded-2xl text-[11px] leading-[1.6] shadow-sm ${
                                msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-[#181818] border border-white/5 text-[#EDEDED] rounded-tl-none font-medium'
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex items-center gap-3 text-indigo-400">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-[10px] font-mono italic">Thinking...</span>
                    </div>
                )}

                {aiTweaks.length > 0 && (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#555]">Suggested Controls</span>
                            <div className="h-px flex-1 bg-[#222]" />
                        </div>
                        {aiTweaks.map(tweak => (
                            <div key={tweak.id} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-3 space-y-2 group">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-[#A1A1A1] font-bold">{tweak.label}</span>
                                    {tweak.type === 'slider' && <span className="text-[9px] text-[#555] font-mono">{tweak.value}</span>}
                                </div>
                                {tweak.type === 'slider' && (
                                    <input 
                                        type="range"
                                        min={tweak.min ?? 0}
                                        max={tweak.max ?? 100}
                                        step={(tweak.max ?? 1) > 1 ? 1 : 0.01}
                                        value={tweak.value}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            const targetId = tweak.targetNodeId === 'Selection' ? selectedIds[0] : tweak.targetNodeId;
                                            if (targetId) updateNode(targetId, { [tweak.targetProperty]: val } as any);
                                            useStore.setState(s => ({
                                                aiTweaks: s.aiTweaks.map(at => at.id === tweak.id ? { ...at, value: val } : at)
                                            }));
                                        }}
                                        className="w-full h-1 bg-[#2A2A2A] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                )}
                                {tweak.type === 'color' && (
                                    <input 
                                        type="color"
                                        value={tweak.value}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const targetId = tweak.targetNodeId === 'Selection' ? selectedIds[0] : tweak.targetNodeId;
                                            if (targetId) updateNode(targetId, { [tweak.targetProperty]: val } as any);
                                            useStore.setState(s => ({
                                                aiTweaks: s.aiTweaks.map(at => at.id === tweak.id ? { ...at, value: val } : at)
                                            }));
                                        }}
                                        className="w-full bg-transparent border-none h-6 cursor-pointer"
                                    />
                                )}
                                {tweak.type === 'action' && (
                                    <button 
                                        onClick={() => handleSend(tweak.label)}
                                        className="w-full py-2 text-[10px] bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-600 hover:text-white transition-all font-bold uppercase tracking-wider"
                                    >
                                        Apply Correction
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 bg-[#0A0A0A] border-t border-[#2A2A2A] space-y-3">
                {selectedIds.length > 0 && (
                    <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-widest">Context: {selectedIds.length} Layers Selected</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    </div>
                )}
                <div className="relative">
                    <textarea 
                        ref={inputRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Describe a nudge or build something new..."
                        className="w-full bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-3 pb-12 text-[11px] text-[#EDEDED] placeholder-[#444] focus:border-indigo-500/50 outline-none transition-all resize-none min-h-[80px]"
                    />
                    <div className="absolute right-2 bottom-2 left-2 flex justify-between items-center bg-[#141414] pt-2">
                         <div className="flex gap-1">
                            <span className="text-[8px] text-[#444] font-mono border border-[#222] px-1 rounded uppercase">Shift+Enter for newline</span>
                         </div>
                         <button 
                            onClick={() => handleSend()}
                            disabled={isLoading || !prompt.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
                        >
                            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
};
