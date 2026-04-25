/** Core document model types for nodes, variables, styles, and editor state. */
export * from './types';

/** Auto-layout engine for frame and container reflow. */
export { calculateLayout } from './lib/layoutUtils';

/** Superellipse path generator for smoothed rectangle corners. */
export { getSuperellipsePath } from './lib/geometry';

/** Text measurement utility used by the editor and layout engine. */
export { measureText } from './lib/measureText';

/** HTML parser that converts DOM-like markup into scene nodes. */
export { parseHTMLToNodes } from './lib/htmlParser';

/** Vector boolean operations for combining overlapping shapes into one path. */
export { performBooleanOperation } from './lib/boolean';

/** Code export helpers for serializing scenes to implementation code. */
export { exportToCode, exportToCss } from './lib/codeExport';

/** CSS export helper that maps scene nodes to CSS declarations. */
export { exportNodesToCss } from './lib/cssExport';

/** Pen and path editing primitives for vector tooling. */
export {
  buildPathDataFromPenPoints,
  insertAnchorAtPoint,
  moveAnchorWithHandles,
  moveControlHandle,
  parsePathData,
  pointToSegmentDistance,
  serializePathData,
  toggleAnchorCurve,
} from './lib/pathTooling';

/** Mask composition helpers for clipped rendering and CSS export. */
export { buildMaskingRuns, maskNodeToCssClipPath } from './lib/masking';

/** Frame utilities for hit-testing, selection bounds, and wrapping nodes in frames. */
export {
  findInnermostFrameAtPoint,
  getGlobalPosition,
  getSelectionBounds,
  wrapSelectionInFrame,
} from './lib/framing';

/** Tool-state reducer primitives for host applications implementing editor sessions. */
export {
  createInitialToolSession,
  isDrawingTool,
  reduceToolSession,
} from './lib/toolStateMachine';

/** Default system prompt used by Nova AI orchestration helpers. */
export { DEFAULT_NOVA_SYSTEM_PROMPT } from './engine/defaultPrompt';

/** Converts a scene into HTML-like context for LLM prompting. */
export { nodesToHtmlContext } from './engine/context';

/** Parsers for Nova response blocks and tweak directives. */
export { parseAiTweaks, parseNovaResponse } from './engine/parse';

/** Resolves generated image placeholder tokens into final node content. */
export { resolveGeneratedImageTokens } from './engine/imageTokens';

/** Executes a Nova turn and merges generated results back into a scene. */
export { mergeGeneratedNodes, runNovaTurn } from './engine/engine';

/** Store binding helpers for host apps that want to apply Nova turns. */
export { applyNovaTurnToState, createNovaEditorBindings } from './bindings';

/** Default preset artifacts for editor layout and tooling configuration. */
export { defaultEditorPreset, defaultEditorPresetJson } from './presets';

/** Result types for Nova generation and merge orchestration. */
export type {
  MergeGeneratedNodesInput,
  MergeGeneratedNodesResult,
  NovaCompletionInput,
  NovaLLMBinding,
  NovaLLMMessage,
  NovaParsedResponse,
  NovaTurnInput,
  NovaTurnResult,
} from './engine/types';

/** Binding input and output types for applying Nova turns to editor state. */
export type {
  ApplyNovaTurnToStateInput,
  ApplyNovaTurnToStateResult,
  NovaEditorTurnBindings,
} from './bindings';

/** Preset schema types for configuring the packaged editor shell. */
export type {
  NovaEditorPreset,
  NovaEditorPanelPreset,
  NovaEditorToolPreset,
} from './presets';
