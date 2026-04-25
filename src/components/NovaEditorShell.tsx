import React from 'react';
import { NovaEditorComposer } from './NovaEditorComposer';
import type { NovaTheme } from './NovaThemeProvider';

export interface NovaEditorShellProps extends NovaTheme {
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
      mode={mode}
      accentColor={accentColor}
      panelBackgroundColor={panelBackgroundColor}
      borderColor={borderColor}
      canvasBackgroundColor={canvasBackgroundColor}
      textColor={textColor}
    />
  );
};
