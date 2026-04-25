import React, { CSSProperties, ReactNode } from 'react';

export interface NovaTheme {
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

export const NovaThemeProvider = ({
  children,
  className,
  style,
  accentColor = '#6366F1',
  panelBackgroundColor = '#141414',
  borderColor = '#2A2A2A',
  canvasBackgroundColor = '#141414',
  textColor = '#EDEDED',
}: NovaThemeProviderProps) => {
  const accentSoft = toRgba(accentColor, 0.14);
  const accentMid = toRgba(accentColor, 0.25);

  return (
    <div
      className={`nova-editor-theme ${className || ''}`.trim()}
      style={{
        background: canvasBackgroundColor,
        color: textColor,
        ...style,
      }}
    >
      <style>
        {`
          .nova-editor-theme #layers-panel,
          .nova-editor-theme #properties-panel,
          .nova-editor-theme #nova-ai-panel {
            background: ${panelBackgroundColor} !important;
            border-color: ${borderColor} !important;
            color: ${textColor} !important;
          }

          .nova-editor-theme #floating-toolbar {
            border-color: ${borderColor} !important;
          }

          .nova-editor-theme [class*="text-indigo-"] { color: ${accentColor} !important; }
          .nova-editor-theme [class*="border-indigo-"] { border-color: ${accentColor} !important; }
          .nova-editor-theme [class*="bg-indigo-600"] { background-color: ${accentColor} !important; }
          .nova-editor-theme [class*="bg-indigo-500"] { background-color: ${accentColor} !important; }
          .nova-editor-theme [class*="bg-indigo-"] { background-color: ${accentSoft} !important; }
          .nova-editor-theme [class*="hover:bg-indigo-"]:hover { background-color: ${accentMid} !important; }
          .nova-editor-theme [class*="accent-indigo-"] { accent-color: ${accentColor} !important; }
        `}
      </style>
      {children}
    </div>
  );
};
