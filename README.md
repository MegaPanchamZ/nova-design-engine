# Nova Design Engine

Nova Design Engine is an installable editor runtime for design-tool style experiences. It ships a reusable scene model, a React editor shell, vector and layout utilities, export helpers, and bring-your-own-LLM orchestration primitives.

The package is split into a few clear surfaces:

- `nova-design-engine`: core types, geometry, layout, parsing, export, and AI orchestration helpers.
- `nova-design-engine/react`: prebuilt editor UI components and the Zustand store hook.
- `nova-design-engine/browser`: browser-only export helpers.
- `nova-design-engine/bindings`: host-app bindings for applying Nova turns to editor state.
- `nova-design-engine/presets`: bundled JSON preset artifacts and typed preset exports.

## Install

```bash
npm install nova-design-engine react react-dom
```

Official adapters:

- `@nova-design-engine/adapter-openai`
- `@nova-design-engine/adapter-google-genai`

## What You Get

Editor capabilities already included in the package:

- Auto layout frames and container reflow.
- Shapes, paths, masking, framing, component instances, and variant switching.
- Multiple fills and strokes with solid and gradient paint support.
- Effects for drop shadow, inner shadow, layer blur, and background blur.
- Smart guides, snapping, inline text editing, and direct-select path editing.
- Boolean path operations for union, subtract, intersect, and exclude.
- Multi-backend rendering adapters (`react-konva`, `canvas`, `pixi-webgl`, `skia`/`canvaskit`, `webgpu` fallback).
- Prototype interactions in `prototype` mode, on-canvas noodle authoring between frames, and a standalone `Viewer` component.
- Undo and redo state history with lightweight batching for repeated actions.

## Quick Start

### Full editor shell

```tsx
import { NovaEditorShell } from 'nova-design-engine/react';

export default function App() {
  return <NovaEditorShell showChat />;
}
```

### Prototype viewer

```tsx
import { Viewer } from 'nova-design-engine/react';

export default function PrototypePreview() {
  return <Viewer style={{ minHeight: 720 }} />;
}
```

### Composed editor

```tsx
import {
  Canvas,
  LayersPanel,
  NovaAI,
  NovaEditorComposer,
  PropertiesPanel,
  Toolbar,
} from 'nova-design-engine/react';

export default function App() {
  return (
    <NovaEditorComposer
      accentColor="#14b8a6"
      panelBackgroundColor="#111315"
      borderColor="#2f3539"
      layers={<LayersPanel />}
      canvas={<Canvas />}
      toolbar={<Toolbar />}
      properties={<PropertiesPanel modeTabsAccentColor="#14b8a6" />}
      assistant={<NovaAI />}
    />
  );
}
```

## API Surface

### Core package

- Types: `SceneNode`, `FrameNode`, `TextNode`, `Interaction`, `Effect`, `Paint`, `DesignState`.
- Layout and geometry: `calculateLayout`, `getSuperellipsePath`, `measureText`.
- Vector tooling: `performBooleanOperation`, `parsePathData`, `serializePathData`, `insertAnchorAtPoint`, `moveAnchorWithHandles`, `toggleAnchorCurve`.
- Masking and framing: `buildMaskingRuns`, `maskNodeToCssClipPath`, `findInnermostFrameAtPoint`, `wrapSelectionInFrame`, `getSelectionBounds`.
- Parsing and export: `parseHTMLToNodes`, `exportToCode`, `exportToCss`, `exportNodesToCss`.
- AI orchestration: `runNovaTurn`, `mergeGeneratedNodes`, `parseNovaResponse`, `parseAiTweaks`, `nodesToHtmlContext`, `DEFAULT_NOVA_SYSTEM_PROMPT`.

### React package

- Shells: `NovaEditorShell`, `NovaEditorComposer`, `Viewer`.
- Editor panels: `Canvas`, `Toolbar`, `LayersPanel`, `PropertiesPanel`, `ModeTabs`, `NovaAI`.
- Runtime hooks and helpers: `useStore`, `setNovaAIBinding`, `getNovaAIBinding`, `hasNovaAIBinding`.

### Browser package

- `exportToSVG`
- `exportToPDF`
- `triggerDownload`

### Bindings package

- `createNovaEditorBindings`
- `applyNovaTurnToState`

## Architecture Concepts

### Scene graph

Every document is a list of `Page` objects. Each page owns a flat array of nodes linked by `parentId`. Frames, groups, components, and instances act as containers.

### Store model

The editor UI is driven by a Zustand store exposed through `useStore`. Pages, selection, viewport, tool mode, guides, history, and AI state all live there.

### Layout model

Auto layout is frame-based. Container nodes can opt into horizontal or vertical layout, wrapping, padding, gaps, alignment, and grow or shrink behavior.

### Paint and effect model

Nodes still expose convenience `fill` and `stroke` fields, but the authoritative rendering model is `fills?: Paint[]`, `strokes?: Paint[]`, and `effects?: Effect[]`.

### Prototype model

Prototype actions are stored on nodes as `interactions?: Interaction[]`. In `prototype` mode, the Canvas executes those actions on click, hover, and drag. `Viewer` is a thin wrapper that forces this mode for embedded previews.

In prototype mode, selected frames expose an on-canvas connector handle. Dragging that handle onto another frame writes a `navigate` interaction and renders a visible noodle on the canvas.

## AI Binding

The package does not ship provider secrets or a default hosted backend. You must provide your own `NovaLLMBinding`.

```ts
import { NovaLLMBinding } from 'nova-design-engine';

const binding: NovaLLMBinding = {
  async complete(input) {
    return '[MESSAGE]ok[/MESSAGE][HTML]<div id="root"></div>[/HTML][TWEAKS][][/TWEAKS]';
  },
  async generateImage(prompt) {
    return '';
  },
};
```

React security note:

- `NovaAI` does not auto-read public environment variables.
- Call `setNovaAIBinding(...)` explicitly from your host app.
- Route provider calls through your own server or trusted backend.

## Example App

A runnable Vite example lives in `examples/basic-editor`.

Development flow:

```bash
cd examples/basic-editor
pnpm install
pnpm dev
```

The example shows:

- `NovaEditorShell` as the primary editor shell.
- Store seeding with example nodes.
- A toggle into `Viewer` for prototype preview.

## Presets

Bundled preset artifacts:

- `nova-design-engine/presets/default-editor-preset.json`
- `nova-design-engine/presets/editor-preset.schema.json`

Typed preset exports:

- `defaultEditorPreset`
- `defaultEditorPresetJson`

## Workspace Commands

```bash
npm run typecheck
npm test
npm run bench:render
npm run bench:browser
npm run build
```

Benchmark all configured renderer backends:

```bash
npm run bench
```

The renderer benchmark compares `react-konva`, `canvas`, `pixi-webgl`, `webgpu`, `skia`, and `canvaskit` adapters in the same input scene.

For real-browser runs, use Playwright-backed benchmarks:

```bash
npm run bench:browser:install
npm run bench:browser
```

The browser benchmark drives a bounded stress scene in `examples/basic-editor` (`2,500` nodes for stable automation), performs pan/zoom interactions, and records FPS telemetry per backend. The in-app manual stress control still loads `10,000` nodes.

To build the official adapters in this workspace:

```bash
npm run build:adapters
```
