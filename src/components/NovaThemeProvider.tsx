import React, { CSSProperties, ReactNode } from 'react';

export type NovaColorMode = 'dark' | 'light';

export interface NovaTheme {
  mode?: NovaColorMode;
  accentColor?: string;
  panelBackgroundColor?: string;
  borderColor?: string;
  canvasBackgroundColor?: string;
  textColor?: string;
}

export interface NovaThemeProviderProps extends NovaTheme {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const toRgba = (color: string, alpha: number): string => {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const hex = color.trim().match(/^#([\da-fA-F]{3}|[\da-fA-F]{6})$/);
  if (!hex) return color;

  const raw = hex[1];
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgb(${r} ${g} ${b} / ${safeAlpha.toFixed(3)})`;
};

const getModeDefaults = (mode: NovaColorMode) => {
  if (mode === 'light') {
    return {
      panelBackgroundColor: '#F4F7FB',
      borderColor: '#D8E0EB',
      canvasBackgroundColor: '#EAF0F7',
      textColor: '#102033',
      mutedTextColor: '#526174',
      subtleTextColor: '#7C8796',
      surfaceBaseColor: '#FFFFFF',
      surfaceRaisedColor: '#EEF3F8',
      surfaceInsetColor: '#E4EAF2',
      scrollbarTrackColor: '#E7EDF5',
      scrollbarThumbColor: '#B5C2D2',
      scrollbarThumbHoverColor: '#90A1B7',
      toolbarBackgroundColor: 'rgb(255 255 255 / 0.92)',
    };
  }

  return {
    panelBackgroundColor: '#141414',
    borderColor: '#2A2A2A',
    canvasBackgroundColor: '#111315',
    textColor: '#EDEDED',
    mutedTextColor: '#A1A1A1',
    subtleTextColor: '#6B6B6B',
    surfaceBaseColor: '#1B1B1B',
    surfaceRaisedColor: '#111111',
    surfaceInsetColor: '#242424',
    scrollbarTrackColor: '#151515',
    scrollbarThumbColor: '#3C3C3C',
    scrollbarThumbHoverColor: '#5A5A5A',
    toolbarBackgroundColor: 'rgb(18 18 18 / 0.95)',
  };
};

export const NovaThemeProvider = ({
  children,
  className,
  style,
  mode = 'dark',
  accentColor = '#6366F1',
  panelBackgroundColor,
  borderColor,
  canvasBackgroundColor,
  textColor,
}: NovaThemeProviderProps) => {
  const defaults = getModeDefaults(mode);
  const resolvedPanelBackgroundColor = panelBackgroundColor || defaults.panelBackgroundColor;
  const resolvedBorderColor = borderColor || defaults.borderColor;
  const resolvedCanvasBackgroundColor = canvasBackgroundColor || defaults.canvasBackgroundColor;
  const resolvedTextColor = textColor || defaults.textColor;
  const accentSoft = toRgba(accentColor, 0.14);
  const accentMid = toRgba(accentColor, 0.25);
  const accentStrong = toRgba(accentColor, mode === 'light' ? 0.18 : 0.22);

  return (
    <div
      className={`nova-editor-theme ${className || ''}`.trim()}
      data-mode={mode}
      style={{
        background: resolvedCanvasBackgroundColor,
        color: resolvedTextColor,
        colorScheme: mode,
        ...style,
      }}
    >
      <style>
        {`
          .nova-editor-theme {
            --nova-accent: ${accentColor};
            --nova-accent-soft: ${accentSoft};
            --nova-accent-mid: ${accentMid};
            --nova-accent-strong: ${accentStrong};
            --nova-panel-bg: ${resolvedPanelBackgroundColor};
            --nova-border: ${resolvedBorderColor};
            --nova-canvas-bg: ${resolvedCanvasBackgroundColor};
            --nova-text: ${resolvedTextColor};
            --nova-text-muted: ${defaults.mutedTextColor};
            --nova-text-subtle: ${defaults.subtleTextColor};
            --nova-surface-base: ${defaults.surfaceBaseColor};
            --nova-surface-raised: ${defaults.surfaceRaisedColor};
            --nova-surface-inset: ${defaults.surfaceInsetColor};
            --nova-scrollbar-track: ${defaults.scrollbarTrackColor};
            --nova-scrollbar-thumb: ${defaults.scrollbarThumbColor};
            --nova-scrollbar-thumb-hover: ${defaults.scrollbarThumbHoverColor};
            --nova-toolbar-bg: ${defaults.toolbarBackgroundColor};
          }

          .nova-editor-theme #layers-panel,
          .nova-editor-theme #properties-panel,
          .nova-editor-theme #nova-ai-panel {
            background: var(--nova-panel-bg) !important;
            border-color: var(--nova-border) !important;
            color: var(--nova-text) !important;
          }

          .nova-editor-theme #floating-toolbar {
            background: var(--nova-toolbar-bg) !important;
            border-color: var(--nova-border) !important;
            color: var(--nova-text) !important;
          }

          .nova-editor-theme .custom-scrollbar,
          .nova-editor-theme * {
            scrollbar-width: thin;
            scrollbar-color: var(--nova-scrollbar-thumb) var(--nova-scrollbar-track);
          }

          .nova-editor-theme .custom-scrollbar::-webkit-scrollbar,
          .nova-editor-theme *::-webkit-scrollbar {
            width: 11px;
            height: 11px;
          }

          .nova-editor-theme .custom-scrollbar::-webkit-scrollbar-track,
          .nova-editor-theme *::-webkit-scrollbar-track {
            background: var(--nova-scrollbar-track);
          }

          .nova-editor-theme .custom-scrollbar::-webkit-scrollbar-thumb,
          .nova-editor-theme *::-webkit-scrollbar-thumb {
            background: var(--nova-scrollbar-thumb);
            border: 2px solid var(--nova-scrollbar-track);
            border-radius: 999px;
          }

          .nova-editor-theme .custom-scrollbar::-webkit-scrollbar-thumb:hover,
          .nova-editor-theme *::-webkit-scrollbar-thumb:hover {
            background: var(--nova-scrollbar-thumb-hover);
          }

          .nova-editor-theme :is(#layers-panel, #properties-panel, #nova-ai-panel, #floating-toolbar) input,
          .nova-editor-theme :is(#layers-panel, #properties-panel, #nova-ai-panel, #floating-toolbar) textarea,
          .nova-editor-theme :is(#layers-panel, #properties-panel, #nova-ai-panel, #floating-toolbar) select {
            color: var(--nova-text) !important;
            border-color: var(--nova-border) !important;
          }

          .nova-editor-theme [class*="bg-[#0B0B0B]"],
          .nova-editor-theme [class*="bg-[#0F0F0F]"],
          .nova-editor-theme [class*="bg-[#111111]"],
          .nova-editor-theme [class*="bg-[#121212]"],
          .nova-editor-theme [class*="bg-[#141414]"],
          .nova-editor-theme [class*="bg-[#181818]"],
          .nova-editor-theme [class*="bg-[#1E1E1E]"] {
            background-color: var(--nova-surface-base) !important;
          }

          .nova-editor-theme [class*="bg-[#2C2C2C]"],
          .nova-editor-theme [class*="bg-[#2A2A2A]"] {
            background-color: var(--nova-surface-inset) !important;
          }

          .nova-editor-theme [class*="hover:bg-[#1E1E1E]"]:hover,
          .nova-editor-theme [class*="hover:bg-[#222]"]:hover,
          .nova-editor-theme [class*="hover:bg-[#2A2A2A]"]:hover,
          .nova-editor-theme [class*="hover:bg-white/10"]:hover {
            background-color: var(--nova-surface-inset) !important;
          }

          .nova-editor-theme [class*="border-[#222]"],
          .nova-editor-theme [class*="border-[#2A2A2A]"],
          .nova-editor-theme [class*="border-[#2F2F2F]"],
          .nova-editor-theme [class*="border-white/5"],
          .nova-editor-theme [class*="border-white/8"],
          .nova-editor-theme [class*="border-white/10"] {
            border-color: var(--nova-border) !important;
          }

          .nova-editor-theme [class*="text-[#EDEDED]"],
          .nova-editor-theme [class*="text-white"] {
            color: var(--nova-text) !important;
          }

          .nova-editor-theme [class*="text-[#A1A1A1]"],
          .nova-editor-theme [class*="text-[#8B8B8B]"],
          .nova-editor-theme [class*="text-[#888]"] {
            color: var(--nova-text-muted) !important;
          }

          .nova-editor-theme [class*="text-[#555]"],
          .nova-editor-theme [class*="text-white/55"],
          .nova-editor-theme [class*="text-white/60"],
          .nova-editor-theme [class*="text-white/65"] {
            color: var(--nova-text-subtle) !important;
          }

          .nova-editor-theme [class*="text-indigo-"] { color: var(--nova-accent) !important; }
          .nova-editor-theme [class*="border-indigo-"] { border-color: var(--nova-accent) !important; }
          .nova-editor-theme [class*="bg-indigo-600"] { background-color: var(--nova-accent) !important; }
          .nova-editor-theme [class*="bg-indigo-500"] { background-color: var(--nova-accent) !important; }
          .nova-editor-theme [class*="bg-indigo-"] { background-color: var(--nova-accent-soft) !important; }
          .nova-editor-theme [class*="hover:bg-indigo-"]:hover { background-color: var(--nova-accent-mid) !important; }
          .nova-editor-theme [class*="accent-indigo-"] { accent-color: var(--nova-accent) !important; }
          .nova-editor-theme [class*="bg-indigo-600/20"] { background-color: var(--nova-accent-soft) !important; }
          .nova-editor-theme [class*="border-indigo-500/50"] { border-color: var(--nova-accent-strong) !important; }
        `}
      </style>
      {children}
    </div>
  );
};
