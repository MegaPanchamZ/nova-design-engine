import React, { CSSProperties, useEffect } from 'react';

import { useStore } from '../store';
import { NovaTheme, NovaThemeProvider } from './NovaThemeProvider';
import { Canvas } from './Canvas';

export interface ViewerProps extends NovaTheme {
  className?: string;
  style?: CSSProperties;
}

export const Viewer = ({
  className,
  style,
  mode,
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
      <Canvas />
    </NovaThemeProvider>
  );
};