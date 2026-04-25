import { useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import type { LucideIcon } from 'lucide-react';
import { Camera, ChevronDown, Circle, Download, FileCode, Hand, Image, Layout, Maximize, MousePointer, MousePointer2, PenTool, Printer, Redo, Sparkles, Square, Type, Undo, ZoomIn } from 'lucide-react';
import { useStore } from '../store';
import { ToolType } from '../types';
import { exportToPDF, exportToSVG, triggerDownload } from '../services/exportService';
import { getToolDefinition, getToolGroupForTool, TOOL_GROUPS } from '../lib/toolRegistry';
import type { ToolGroupId } from '../lib/toolRegistry';

declare global {
  interface Window {
    canvasStage?: Konva.Stage;
  }
}

type ExportKind = 'pdf-digital-single' | 'pdf-digital-frames' | 'pdf-print' | 'svg' | 'png';

interface ToolOption {
  id: ToolType;
  icon: LucideIcon;
  label: string;
  shortcut: string;
}

interface ToolbarGroup {
  id: ToolGroupId;
  label: string;
  options: ToolOption[];
}

const TOOL_ICONS: Record<ToolType, LucideIcon> = {
  select: MousePointer2,
  'direct-select': MousePointer,
  scale: Maximize,
  rect: Square,
  circle: Circle,
  ellipse: Circle,
  frame: Layout,
  section: Layout,
  pen: PenTool,
  text: Type,
  image: Image,
  hand: Hand,
  zoom: ZoomIn,
};

export const Toolbar = () => {
  const { pages, currentPageId, tool, setTool, undo, redo, canUndo, canRedo } = useStore();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [openGroup, setOpenGroup] = useState<ToolGroupId | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentPage = pages.find(p => p.id === currentPageId);
  const toolbarGroups = useMemo<ToolbarGroup[]>(() => {
    return TOOL_GROUPS.map((group) => ({
      ...group,
      options: group.toolIds.map((toolId) => {
        const definition = getToolDefinition(toolId);
        return {
          id: definition.id,
          icon: TOOL_ICONS[definition.id],
          label: definition.label,
          shortcut: definition.shortcutLabel,
        } as ToolOption;
      }),
    }));
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!dockRef.current) return;
      if (dockRef.current.contains(event.target as Node)) return;
      setOpenGroup(null);
      setShowExportMenu(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleExport = async (type: ExportKind) => {
    if (!currentPage || isExporting) return;
    
    setIsExporting(true);
    try {
      switch(type) {
        case 'pdf-digital-single':
          await exportToPDF(currentPage.nodes, { type: 'digital', mode: 'single' });
          break;
        case 'pdf-digital-frames':
          await exportToPDF(currentPage.nodes, { type: 'digital', mode: 'frames' });
          break;
        case 'pdf-print':
          await exportToPDF(currentPage.nodes, { type: 'print', mode: 'frames' });
          break;
        case 'svg':
          const svg = exportToSVG(currentPage.nodes);
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          const svgUrl = URL.createObjectURL(svgBlob);
          triggerDownload(svgUrl, 'export.svg');
          break;
        case 'png':
          const stage = window.canvasStage;
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

  const activeToolByGroup = useMemo(() => {
    const result = new Map<ToolGroupId, ToolOption>();
    toolbarGroups.forEach((group) => {
      const selected = group.options.find((option) => option.id === tool) || group.options[0];
      result.set(group.id, selected);
    });
    return result;
  }, [tool, toolbarGroups]);

  const currentToolGroup = getToolGroupForTool(tool).id;

  return (
    <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div
        ref={dockRef}
        id="floating-toolbar"
        className="group relative translate-y-3 rounded-2xl border border-[#2A2A2A] bg-[#121212]/95 p-2 shadow-2xl backdrop-blur-md transition-all duration-200 hover:translate-y-0"
      >
        <div className="flex items-center gap-2">
          <button
            id="undo-btn"
            onClick={undo}
            disabled={!canUndo()}
            title="Undo (Ctrl+Z)"
            className="h-8 w-8 rounded-lg border border-transparent text-[#A1A1A1] transition-colors hover:border-[#2F2F2F] hover:bg-[#1E1E1E] hover:text-white disabled:opacity-20"
          >
            <Undo size={14} className="mx-auto" />
          </button>
          <button
            id="redo-btn"
            onClick={redo}
            disabled={!canRedo()}
            title="Redo (Ctrl+Shift+Z)"
            className="h-8 w-8 rounded-lg border border-transparent text-[#A1A1A1] transition-colors hover:border-[#2F2F2F] hover:bg-[#1E1E1E] hover:text-white disabled:opacity-20"
          >
            <Redo size={14} className="mx-auto" />
          </button>

          <div className="mx-1 h-5 w-px bg-[#2A2A2A]" />

          {toolbarGroups.map((group) => {
            const active = activeToolByGroup.get(group.id) || group.options[0];
            const ActiveIcon = active.icon;
            const isOpen = openGroup === group.id;
            const isCurrentGroup = currentToolGroup === group.id;

            return (
              <div key={group.id} className="relative">
                <button
                  id={`tool-group-${group.id}`}
                  onClick={() => {
                    setOpenGroup((prev: ToolGroupId | null) => (prev === group.id ? null : group.id));
                    setShowExportMenu(false);
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                    isOpen || isCurrentGroup
                      ? 'border-indigo-500/50 bg-indigo-600/20 text-white'
                      : 'border-transparent bg-transparent text-[#C4C4C4] hover:border-[#2F2F2F] hover:bg-[#1E1E1E] hover:text-white'
                  }`}
                  title={`${active.label} (${active.shortcut})`}
                >
                  <ActiveIcon size={14} />
                  <span className="max-w-[84px] truncate">{active.label}</span>
                  <span className="font-mono text-[10px] uppercase opacity-60">{active.shortcut}</span>
                  <ChevronDown size={11} className={`opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-xl border border-[#2A2A2A] bg-[#0B0B0B] p-1 shadow-2xl">
                    {group.options.map((option) => {
                      const Icon = option.icon;
                      const selected = tool === option.id;
                      return (
                        <button
                          key={option.id}
                          id={`tool-${option.id}`}
                          onClick={() => {
                            setTool(option.id);
                            setOpenGroup(null);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                            selected ? 'bg-indigo-600 text-white' : 'text-[#C4C4C4] hover:bg-[#1F1F1F] hover:text-white'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Icon size={13} />
                            {option.label}
                          </span>
                          <span className="font-mono text-[10px] uppercase opacity-80">{option.shortcut}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mx-1 h-5 w-px bg-[#2A2A2A]" />

          <button
            id="nova-ai-btn"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true }))}
            title="Nova AI (Ctrl+I)"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs text-indigo-300 transition-colors hover:border-indigo-500/40 hover:bg-indigo-600/20 hover:text-indigo-200"
          >
            <Sparkles size={14} />
          </button>

          <div className="relative">
            <button
              id="export-trigger"
              onClick={() => {
                setShowExportMenu((prev) => !prev);
                setOpenGroup(null);
              }}
              disabled={isExporting}
              title="Export"
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                isExporting
                  ? 'cursor-wait border-indigo-500/40 bg-indigo-600/30 text-white'
                  : showExportMenu
                    ? 'border-emerald-500/50 bg-emerald-600/20 text-white'
                    : 'border-transparent text-[#C4C4C4] hover:border-[#2F2F2F] hover:bg-[#1E1E1E] hover:text-white'
              }`}
            >
              {isExporting ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Download size={14} />}
            </button>

            {showExportMenu && !isExporting && (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-1 shadow-2xl">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#555]">Digital PDF</div>
                <button onClick={() => handleExport('pdf-digital-single')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-[#BCBCBC] transition-colors hover:bg-[#222] hover:text-white">
                  <Download size={14} className="text-indigo-400" />
                  <span>Standard (Single Page)</span>
                </button>
                <button onClick={() => handleExport('pdf-digital-frames')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-[#BCBCBC] transition-colors hover:bg-[#222] hover:text-white">
                  <FileCode size={14} className="text-emerald-400" />
                  <span>Frames to Pages</span>
                </button>

                <div className="my-1 h-px bg-[#222]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#555]">Professional Print</div>
                <button onClick={() => handleExport('pdf-print')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-[#BCBCBC] transition-colors hover:bg-[#222] hover:text-white">
                  <Printer size={14} className="text-orange-400" />
                  <span>Bleed & Crop Marks</span>
                </button>

                <div className="my-1 h-px bg-[#222]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#555]">Assets</div>
                <button onClick={() => handleExport('svg')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-[#BCBCBC] transition-colors hover:bg-[#222] hover:text-white">
                  <FileCode size={14} className="text-sky-400" />
                  <span>Vector (SVG)</span>
                </button>
                <button onClick={() => handleExport('png')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-[#BCBCBC] transition-colors hover:bg-[#222] hover:text-white">
                  <Camera size={14} className="text-rose-400" />
                  <span>Raster (PNG @2x)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
