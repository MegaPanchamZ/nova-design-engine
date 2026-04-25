import React, { CSSProperties, useEffect } from 'react';

import { useStore } from '../store';
import { NovaTheme, NovaThemeProvider } from './NovaThemeProvider';
import { Canvas } from './Canvas';
import type { RenderBackendKind } from '../engine/render/types';

export interface ViewerProps extends NovaTheme {
  className?: string;
  style?: CSSProperties;
  canvasRendererBackend?: RenderBackendKind;
  enableSpatialRuntime?: boolean;
  spatialRuntimeMode?: 'main-thread' | 'worker';
}

export const Viewer = ({
  className,
  style,
  mode,
  canvasRendererBackend = 'react-konva',
  enableSpatialRuntime = true,
  spatialRuntimeMode = 'main-thread',
  accentColor,
  panelBackgroundColor,
  borderColor,
  canvasBackgroundColor,
  textColor,
}: ViewerProps) => {
  useEffect(() => {
    const previousMode = useStore.getState().mode;
    useStore.getState().setMode('prototype');

    return () => {
      useStore.getState().setMode(previousMode);
    };
  }, []);

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
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        ...style,
      }}
    >
      <Canvas
        rendererBackend={canvasRendererBackend}
        enableSpatialRuntime={enableSpatialRuntime}
        spatialRuntimeMode={spatialRuntimeMode}
      />
    </NovaThemeProvider>
  );
};