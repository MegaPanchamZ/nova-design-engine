/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Toolbar } from './components/Toolbar';
import { LayersPanel } from './components/LayersPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Canvas } from './components/Canvas';
import { NovaAI } from './components/NovaAI';
import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { Sparkles } from 'lucide-react';

export default function App() {
  const { tool, setTool, undo, redo, deleteNodes, selectedIds, viewport, pushHistory, toggleRulers } = useStore();
  const lastToolRef = useRef<string>(tool);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || (document.activeElement as HTMLElement)?.contentEditable === 'true') return;

      const key = e.key.toLowerCase();
      
      // Toggle Rulers Shift+R
      if (e.shiftKey && key === 'r') {
          e.preventDefault();
          toggleRulers();
          return;
      }

      // Space bar for temporary Hand tool
      if (e.code === 'Space' && tool !== 'hand') {
        e.preventDefault();
        lastToolRef.current = tool;
        setTool('hand');
        return;
      }

      // Tool shortcuts
      if (key === 'v') setTool('select');
      if (key === 'a') setTool('direct-select');
      if (key === 'k') setTool('scale');
      if (key === 'p') setTool('pen');
      if (key === 'r') setTool('rect');
      if (key === 'o') setTool('circle');
      if (key === 'e') setTool('ellipse');
      if (key === 'f') setTool('frame');
      if (key === 't') setTool('text');
      if (key === 'h') setTool('hand');
      if (key === 'z') setTool('zoom');

      // Commands
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      }

      if ((e.metaKey || e.ctrlKey) && key === 'g') {
          e.preventDefault();
          useStore.getState().groupSelected();
          pushHistory();
      }
      
      if (key === 'delete' || key === 'backspace') {
        if (selectedIds.length > 0) {
          deleteNodes(selectedIds);
          pushHistory();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && tool === 'hand') {
        setTool(lastToolRef.current as any);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool, setTool, undo, redo, deleteNodes, selectedIds]);

  return (
    <div id="app-root" className="w-full h-screen bg-[#0A0A0A] text-[#EDEDED] font-sans flex flex-col overflow-hidden select-none">
      {/* TOP NAVIGATION BAR */}
      <nav id="top-nav" className="h-14 border-b border-[#2A2A2A] bg-[#0F0F0F] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)] animate-pulse">
                <Sparkles size={20} className="text-white" />
             </div>
             <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#EDEDED]">Nova Design Engine</span>
                <span className="text-[9px] font-bold text-indigo-400/80 uppercase tracking-widest">Project Neo / Quantum v1.3</span>
             </div>
          </div>
          
          <div className="h-6 w-px bg-[#2A2A2A]" />
          
          <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-full px-3 py-1 hover:border-indigo-500/50 transition-all cursor-pointer group">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] mr-2" />
             <span className="text-[9px] font-black uppercase tracking-widest text-[#555] group-hover:text-indigo-400">Main Repo Linked</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 bg-[#1A1A1A] px-3 py-1.5 rounded-xl border border-[#2A2A2A]">
            <span className="text-[9px] uppercase font-black text-[#555] tracking-widest">Scale</span>
            <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(viewport.zoom * 100)}%</span>
          </div>
          
          <div className="flex items-center">
             <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-[#141414] bg-indigo-500 text-[10px] flex items-center justify-center font-bold text-white shadow-lg">JD</div>
                <div className="w-8 h-8 rounded-full border-2 border-[#141414] bg-pink-500 text-[10px] flex items-center justify-center font-bold text-white shadow-lg">AM</div>
             </div>
             <button className="ml-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_4px_15px_rgba(0,0,0,0.3)] active:scale-95">Deploy Pipeline</button>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <LayersPanel />
        
        <main className="flex-1 relative bg-[#1A1A1A] overflow-hidden">
           <Toolbar />
           <Canvas />
        </main>

        <div className="flex h-full border-l border-[#2A2A2A] bg-[#141414]">
             <PropertiesPanel />
             <NovaAI />
        </div>
      </div>

      {/* FOOTER STATUS BAR */}
      <footer className="h-6 bg-[#0A0A0A] border-t border-[#2A2A2A] px-3 flex items-center justify-between text-[10px] text-[#555] font-mono">
        <div className="flex gap-4">
          <span>X: {Math.round(viewport.x)}</span>
          <span>Y: {Math.round(viewport.y)}</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-[#A1A1A1] uppercase tracking-widest text-[9px]">Nova Engine / HTML5 Canvas Active</span>
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
    </div>
  );
}
