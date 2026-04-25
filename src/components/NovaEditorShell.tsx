import React from 'react';
import { NovaEditorComposer } from './NovaEditorComposer';

export interface NovaEditorShellProps {
  className?: string;
  showChat?: boolean;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  accentColor?: string;
  panelBackgroundColor?: string;
  borderColor?: string;
  canvasBackgroundColor?: string;
  textColor?: string;
}

export const NovaEditorShell = ({
  className,
  showChat = true,
  leftPanelWidth = 280,
  rightPanelWidth = 320,
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
      accentColor={accentColor}
      panelBackgroundColor={panelBackgroundColor}
      borderColor={borderColor}
      canvasBackgroundColor={canvasBackgroundColor}
      textColor={textColor}
    />
  );
};
