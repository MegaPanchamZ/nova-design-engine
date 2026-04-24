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
import { ToolType } from './types';

export default function App() {
  const { tool, setTool, undo, redo, deleteNodes, selectedIds, viewport, pushHistory, toggleRulers, copySelected, pasteCopied, groupSelected, frameSelected } = useStore();
  const lastToolRef = useRef<ToolType>(tool);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || (document.activeElement as HTMLElement)?.contentEditable === 'true') return;

      const key = e.key.toLowerCase();

      // Commands
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      
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
      if (key === 's') setTool('section');
      if (key === 't') setTool('text');
      if (key === 'i') setTool('image');
      if (key === 'h') setTool('hand');
      if (key === 'z' && !(e.metaKey || e.ctrlKey)) setTool('zoom');

      if ((e.metaKey || e.ctrlKey) && key === 'g') {
          e.preventDefault();
          groupSelected();
          pushHistory();
          return;
      }

      if ((e.metaKey || e.ctrlKey) && key === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault();
        pasteCopied();
        pushHistory();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') {
        e.preventDefault();
        frameSelected();
        pushHistory();
        return;
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
        setTool(lastToolRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool, setTool, undo, redo, deleteNodes, selectedIds, toggleRulers, pushHistory, copySelected, pasteCopied, groupSelected, frameSelected]);

  return (
    <div id="app-root" className="w-full h-screen bg-[#0A0A0A] text-[#EDEDED] font-sans flex flex-col overflow-hidden select-none">
      <nav id="top-nav" className="h-14 border-b border-[#2A2A2A] bg-[#0F0F0F] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
           <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-sky-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                <Sparkles size={20} className="text-white" />
             </div>
             <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#EDEDED]">Nova Design Engine</span>
             <span className="text-[9px] font-bold text-[#8C8C8C] uppercase tracking-widest">Design Surface</span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 bg-[#1A1A1A] px-3 py-1.5 rounded-xl border border-[#2A2A2A]">
            <span className="text-[9px] uppercase font-black text-[#555] tracking-widest">Scale</span>
            <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(viewport.zoom * 100)}%</span>
          </div>
         <div className="hidden md:flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#666]">
          <span>Copy/Paste</span>
          <span>Ctrl+Shift+F Frame Selection</span>
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

      <footer className="h-6 bg-[#0A0A0A] border-t border-[#2A2A2A] px-3 flex items-center justify-between text-[10px] text-[#555] font-mono">
        <div className="flex gap-4">
          <span>X: {Math.round(viewport.x)}</span>
          <span>Y: {Math.round(viewport.y)}</span>
        </div>
        <span className="text-[#777] uppercase tracking-widest text-[9px]">Ready</span>
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
