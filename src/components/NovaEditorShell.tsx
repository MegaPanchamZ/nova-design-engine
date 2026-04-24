import React from 'react';
import { Canvas } from './Canvas';
import { LayersPanel } from './LayersPanel';
import { NovaAI } from './NovaAI';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';

export interface NovaEditorShellProps {
  className?: string;
  showChat?: boolean;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
}

export const NovaEditorShell = ({
  className,
  showChat = true,
  leftPanelWidth = 280,
  rightPanelWidth = 320,
}: NovaEditorShellProps) => {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `${leftPanelWidth}px minmax(0, 1fr) ${rightPanelWidth}px`,
        height: '100vh',
        width: '100%',
        background: '#141414',
      }}
    >
      <div style={{ borderRight: '1px solid #2A2A2A', overflow: 'hidden' }}>
        <LayersPanel />
      </div>

      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Canvas />
        <Toolbar />
      </div>

      <div style={{ borderLeft: '1px solid #2A2A2A', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: '1 1 0', minHeight: 0 }}>
          <PropertiesPanel />
        </div>
        {showChat ? (
          <div style={{ flex: '1 1 0', minHeight: 0, borderTop: '1px solid #2A2A2A' }}>
            <NovaAI />
          </div>
        ) : null}
      </div>
    </div>
  );
};
