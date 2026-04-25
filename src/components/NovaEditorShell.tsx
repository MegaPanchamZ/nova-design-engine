import React from 'react';
import { NovaEditorComposer } from './NovaEditorComposer';
import type { NovaTheme } from './NovaThemeProvider';
import type { RenderBackendKind } from '../engine/render/types';

export interface NovaEditorShellProps extends NovaTheme {
  className?: string;
  showChat?: boolean;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  canvasRendererBackend?: RenderBackendKind;
  enableSpatialRuntime?: boolean;
  spatialRuntimeMode?: 'main-thread' | 'worker';
}

export const NovaEditorShell = ({
  className,
  showChat = true,
  leftPanelWidth = 280,
  rightPanelWidth = 320,
  canvasRendererBackend = 'react-konva',
  enableSpatialRuntime = true,
  spatialRuntimeMode = 'main-thread',
  mode,
  accentColor,
  panelBackgroundColor,
  borderColor,
  canvasBackgroundColor,
  textColor,
}: NovaEditorShellProps) => {
  return (
    <NovaEditorComposer
      className={className}
      showAssistant={showChat}
      leftPanelWidth={leftPanelWidth}
      rightPanelWidth={rightPanelWidth}
      canvasRendererBackend={canvasRendererBackend}
      enableSpatialRuntime={enableSpatialRuntime}
      spatialRuntimeMode={spatialRuntimeMode}
      mode={mode}
      accentColor={accentColor}
      panelBackgroundColor={panelBackgroundColor}
      borderColor={borderColor}
      canvasBackgroundColor={canvasBackgroundColor}
      textColor={textColor}
    />
  );
};
