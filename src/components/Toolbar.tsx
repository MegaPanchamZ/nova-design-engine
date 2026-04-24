import { Square, Circle, Type, MousePointer2, MousePointer, Hand, ZoomIn, Undo, Redo, PenTool, Layout, Maximize, Sparkles, Image, Download, Printer, FileCode, Camera } from 'lucide-react';
import { useStore } from '../store';
import { ToolType } from '../types';
import { exportToPDF, exportToSVG, triggerDownload } from '../services/exportService';
import { useState } from 'react';

export const Toolbar = () => {
  const { pages, currentPageId, tool, setTool, undo, redo, historyIndex, history } = useStore();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentPage = pages.find(p => p.id === currentPageId);

  const handleExport = async (type: string) => {
    if (!currentPage || isExporting) return;
    
    setIsExporting(true);
    try {
      switch(type) {
        case 'pdf-digital':
          await exportToPDF(currentPage.nodes, { type: 'digital' });
          break;
        case 'pdf-print':
          await exportToPDF(currentPage.nodes, { type: 'print' });
          break;
        case 'svg':
          const svg = exportToSVG(currentPage.nodes);
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          const svgUrl = URL.createObjectURL(svgBlob);
          triggerDownload(svgUrl, 'export.svg');
          break;
        case 'png':
          const stage = (window as any).canvasStage;
          if (stage) {
              const dataUrl = stage.toDataURL({ pixelRatio: 3 });
              triggerDownload(dataUrl, 'export.png');
          }
          break;
      }
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  const tools: { id: ToolType; icon: any; label: string; shortcut: string }[] = [
    { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
    { id: 'direct-select', icon: MousePointer, label: 'Direct Selection', shortcut: 'A' },
    { id: 'scale', icon: Maximize, label: 'Scale', shortcut: 'K' },
    { id: 'pen', icon: PenTool, label: 'Pen', shortcut: 'P' },
    { id: 'frame', icon: Layout, label: 'Frame', shortcut: 'F' },
    { id: 'rect', icon: Square, label: 'Rectangle', shortcut: 'R' },
    { id: 'circle', icon: Circle, label: 'Circle', shortcut: 'O' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'E' },
    { id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
    { id: 'image', icon: Image, label: 'Image', shortcut: 'I' },
    { id: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
    { id: 'zoom', icon: ZoomIn, label: 'Zoom', shortcut: 'Z' },
  ];

  return (
    <div 
      id="floating-toolbar" 
      className="absolute left-6 top-1/2 -translate-y-1/2 w-11 flex flex-col gap-1 bg-[#141414] border border-[#2A2A2A] p-1.5 rounded-xl shadow-2xl z-20 backdrop-blur-md bg-opacity-90"
    >
      {tools.map((t) => (
        <button
          key={t.id}
          id={`tool-${t.id}`}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.shortcut})`}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 group relative ${
            tool === t.id 
              ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] scale-110' 
              : 'text-[#A1A1A1] hover:bg-[#2A2A2A] hover:text-white'
          }`}
        >
          <t.icon size={16} strokeWidth={2.5} />
          {/* Shortcut tooltip on hover */}
          <span className="absolute left-12 px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-[10px] text-[#A1A1A1] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity font-mono uppercase whitespace-nowrap">
            {t.label} <span className="text-white ml-2">{t.shortcut}</span>
          </span>
        </button>
      ))}
      
      <div className="h-px bg-[#2A2A2A] mx-1 my-2"></div>
      
      <button
        id="nova-ai-btn"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true }))}
        title="Nova AI (Ctrl+I)"
        className="w-8 h-8 flex items-center justify-center text-indigo-400 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors rounded-lg relative group"
      >
        <Sparkles size={16} strokeWidth={2.5} />
        <span className="absolute left-12 px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-[10px] text-[#A1A1A1] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity font-mono uppercase whitespace-nowrap">
          Nova AI <span className="text-white ml-2">CTRL I</span>
        </span>
      </button>

      <div className="h-px bg-[#2A2A2A] mx-1 my-2"></div>
      
      <button
        id="undo-btn"
        onClick={undo}
        disabled={historyIndex === 0}
        title="Undo (Ctrl+Z)"
        className="w-8 h-8 flex items-center justify-center text-[#A1A1A1] hover:bg-[#2A2A2A] hover:text-white disabled:opacity-20 transition-colors rounded-lg"
      >
        <Undo size={14} />
      </button>
      <button
        id="redo-btn"
        onClick={redo}
        disabled={historyIndex >= history.length - 1}
        title="Redo (Ctrl+Shift+Z)"
        className="w-8 h-8 flex items-center justify-center text-[#A1A1A1] hover:bg-[#2A2A2A] hover:text-white disabled:opacity-20 transition-colors rounded-lg"
      >
        <Redo size={14} />
      </button>
      
      <div className="h-px bg-[#2A2A2A] mx-1 my-2"></div>

      <div className="relative">
        <button
          id="export-trigger"
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={isExporting}
          title="Export"
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            isExporting ? 'bg-indigo-600/50 cursor-wait' : showExportMenu ? 'bg-indigo-600 text-white' : 'text-[#A1A1A1] hover:bg-[#2A2A2A] hover:text-white'
          }`}
        >
          {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={14} />}
        </button>

        {showExportMenu && !isExporting && (
          <div className="absolute left-12 bottom-0 w-48 bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl shadow-2xl p-1 flex flex-col z-50">
            <div className="px-3 py-1.5 text-[10px] text-[#555] font-bold uppercase tracking-widest">Digital PDF</div>
            <button onClick={() => handleExport('pdf-digital')} className="flex items-center gap-3 px-3 py-2 text-xs text-[#BCBCBC] hover:bg-[#222] hover:text-white rounded-lg transition-colors group">
              <Download size={14} className="text-indigo-400 group-hover:text-indigo-300" />
              <span>Standard (Single Page)</span>
            </button>
            <button onClick={() => handleExport('pdf-digital')} className="flex items-center gap-3 px-3 py-2 text-xs text-[#BCBCBC] hover:bg-[#222] hover:text-white rounded-lg transition-colors group">
              <FileCode size={14} className="text-emerald-400 group-hover:text-emerald-300" />
              <span>Frames to Pages</span>
            </button>

            <div className="h-px bg-[#222] my-1"></div>
            <div className="px-3 py-1.5 text-[10px] text-[#555] font-bold uppercase tracking-widest">Professional Print</div>
            <button onClick={() => handleExport('pdf-print')} className="flex items-center gap-3 px-3 py-2 text-xs text-[#BCBCBC] hover:bg-[#222] hover:text-white rounded-lg transition-colors group">
              <Printer size={14} className="text-orange-400 group-hover:text-orange-300" />
              <span>Bleed & Crop Marks</span>
            </button>

            <div className="h-px bg-[#222] my-1"></div>
            <div className="px-3 py-1.5 text-[10px] text-[#555] font-bold uppercase tracking-widest">Assets</div>
            <button onClick={() => handleExport('svg')} className="flex items-center gap-3 px-3 py-2 text-xs text-[#BCBCBC] hover:bg-[#222] hover:text-white rounded-lg transition-colors group">
              <FileCode size={14} className="text-sky-400 group-hover:text-sky-300" />
              <span>Vector (SVG)</span>
            </button>
            <button onClick={() => handleExport('png')} className="flex items-center gap-3 px-3 py-2 text-xs text-[#BCBCBC] hover:bg-[#222] hover:text-white rounded-lg transition-colors group">
              <Camera size={14} className="text-rose-400 group-hover:text-rose-300" />
              <span>Raster (PNG @2x)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
