import React from 'react';

export type NovaEditorMode = 'design' | 'prototype' | 'inspect';

export interface ModeTabsProps {
  mode: NovaEditorMode;
  onModeChange: (mode: NovaEditorMode) => void;
  accentColor?: string;
  className?: string;
}

const MODE_OPTIONS: NovaEditorMode[] = ['design', 'prototype', 'inspect'];

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

export const ModeTabs = ({
  mode,
  onModeChange,
  accentColor = '#6366F1',
  className,
}: ModeTabsProps) => {
  return (
    <div className={`flex border-b border-[#2A2A2A] ${className || ''}`.trim()}>
      {MODE_OPTIONS.map((option) => {
        const active = option === mode;
        return (
          <button
            key={option}
            onClick={() => onModeChange(option)}
            className="flex-1 text-center py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
            style={
              active
                ? {
                    color: accentColor,
                    borderBottom: `2px solid ${accentColor}`,
                    background: toRgba(accentColor, 0.08),
                  }
                : undefined
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};
