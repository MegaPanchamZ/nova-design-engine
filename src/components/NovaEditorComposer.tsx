import React, { CSSProperties, ReactNode, useMemo } from 'react';
import { Canvas } from './Canvas';
import { LayersPanel } from './LayersPanel';
import { NovaAI } from './NovaAI';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { NovaThemeProvider, NovaTheme } from './NovaThemeProvider';
import type { RenderBackendKind } from '../engine/render/types';

type SlotOverride = ReactNode | ((defaultNode: ReactNode) => ReactNode) | null | false;

export interface NovaEditorComposerProps extends NovaTheme {
  className?: string;
  style?: CSSProperties;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  showAssistant?: boolean;
  canvasRendererBackend?: RenderBackendKind;
  enableSpatialRuntime?: boolean;
  layers?: SlotOverride;
  canvas?: SlotOverride;
  toolbar?: SlotOverride;
  properties?: SlotOverride;
  assistant?: SlotOverride;
}

const resolveSlot = (slot: SlotOverride | undefined, defaultNode: ReactNode): ReactNode | null => {
  if (slot === null || slot === false) return null;
  if (typeof slot === 'function') return slot(defaultNode);
  return slot ?? defaultNode;
};

export const NovaEditorComposer = ({
  className,
  style,
  leftPanelWidth = 280,
  rightPanelWidth = 320,
  showAssistant = true,
  canvasRendererBackend = 'react-konva',
  enableSpatialRuntime = true,
  mode,
  accentColor,
  panelBackgroundColor,
  borderColor,
  canvasBackgroundColor,
  textColor,
  layers,
  canvas,
  toolbar,
  properties,
  assistant,
}: NovaEditorComposerProps) => {
  const layersNode = resolveSlot(layers, <LayersPanel />);
  const canvasNode = resolveSlot(canvas, <Canvas rendererBackend={canvasRendererBackend} enableSpatialRuntime={enableSpatialRuntime} />);
  const toolbarNode = resolveSlot(toolbar, <Toolbar />);
  const propertiesNode = resolveSlot(properties, <PropertiesPanel modeTabsAccentColor={accentColor} />);
  const assistantNode = showAssistant ? resolveSlot(assistant, <NovaAI />) : null;

  const hasLeft = Boolean(layersNode);
  const hasRight = Boolean(propertiesNode || assistantNode);

  const columns = useMemo(() => {
    const list: string[] = [];
    if (hasLeft) list.push(`${leftPanelWidth}px`);
    list.push('minmax(0, 1fr)');
    if (hasRight) list.push(`${rightPanelWidth}px`);
    return list.join(' ');
  }, [hasLeft, hasRight, leftPanelWidth, rightPanelWidth]);

  return (
    <NovaThemeProvider
      className={className}
      mode={mode}
      accentColor={accentColor}
      panelBackgroundColor={panelBackgroundColor}
      borderColor={borderColor}
      canvasBackgroundColor={canvasBackgroundColor}
      textColor={textColor}
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        height: '100vh',
        width: '100%',
        ...style,
      }}
    >
      {hasLeft ? <div style={{ borderRight: `1px solid ${borderColor || '#2A2A2A'}`, overflow: 'hidden' }}>{layersNode}</div> : null}

      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {canvasNode}
        {toolbarNode}
      </div>

      {hasRight ? (
        <div style={{ borderLeft: `1px solid ${borderColor || '#2A2A2A'}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {propertiesNode ? <div style={{ flex: '1 1 0', minHeight: 0 }}>{propertiesNode}</div> : null}
          {assistantNode ? <div style={{ flex: '1 1 0', minHeight: 0, borderTop: `1px solid ${borderColor || '#2A2A2A'}` }}>{assistantNode}</div> : null}
        </div>
      ) : null}
    </NovaThemeProvider>
  );
};
