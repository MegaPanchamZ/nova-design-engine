# Nova Design Engine

Installable design engine toolkit with reusable geometry/layout/export/parser tools and BYO-LLM orchestration helpers.

This package does not force a specific model provider. You supply your own assistant binding and use exported functions to run design turns.

## Official Adapters

- `@nova-design-engine/adapter-openai`
- `@nova-design-engine/adapter-google-genai`

These adapters implement `NovaLLMBinding` using the official SDKs:

- OpenAI Node SDK (`openai`) with `chat.completions.create` and `images.generate`.
- Google GenAI SDK (`@google/genai`) with `models.generateContent` and image generation from `gemini-2.5-flash-image` parts.

## Install

```bash
npm install nova-design-engine
```

## Core Exports

- Document model: `SceneNode`, `FrameNode`, `TextNode`, and related types.
- Design tools: `calculateLayout`, `performBooleanOperation`, `getSuperellipsePath`, `measureText`.
- Parser/export: `parseHTMLToNodes`, `exportToCode`.
- BYO assistant primitives: `runNovaTurn`, `mergeGeneratedNodes`, `parseNovaResponse`, `nodesToHtmlContext`, `DEFAULT_NOVA_SYSTEM_PROMPT`.

Editor integration helpers are available from `nova-design-engine/bindings`:

- `createNovaEditorBindings`
- `applyNovaTurnToState`

Browser-only export helpers are available from `nova-design-engine/browser`:

- `exportToSVG`
- `exportToPDF`
- `triggerDownload`

Parser-focused browser-safe import is available from `nova-design-engine/parser`:

- `parseHTMLToNodes`

## React Editor Components

You can import prebuilt React editor components from `nova-design-engine/react`:

- `NovaEditorShell`
- `NovaEditorComposer` (piece-by-piece assembly)
- `Canvas`
- `Toolbar`
- `LayersPanel`
- `PropertiesPanel`
- `ModeTabs` (Design/Prototype/Inspect)
- `NovaAI`
- `useStore`
- `setNovaAIBinding`

Example:

```tsx
import { NovaEditorShell } from 'nova-design-engine/react';

export default function App() {
   return <NovaEditorShell showChat />;
}
```

React AI security note:
- The React package no longer reads `NEXT_PUBLIC_*` API keys.
- `NovaAI` stays disabled until your app explicitly calls `setNovaAIBinding(...)`.
- Provide a server-backed binding that calls your own API route or trusted backend. Do not expose provider secrets in browser env vars.

Example binding for a host app:

```tsx
import { NovaLLMBinding, NovaEditorShell, setNovaAIBinding } from 'nova-design-engine/react';

const binding: NovaLLMBinding = {
   async complete(input) {
      const response = await fetch('/api/nova/complete', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify(input),
      });
      return response.text();
   },
   async generateImage(prompt) {
      const response = await fetch('/api/nova/image', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ prompt }),
      });
      return response.text();
   },
};

setNovaAIBinding(binding);

export default function App() {
   return <NovaEditorShell showChat />;
}
```

Piece-by-piece composition example:

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

Notes:
- `NovaEditorComposer` lets you replace or omit any slot (`layers`, `canvas`, `toolbar`, `properties`, `assistant`).
- `accentColor`, `panelBackgroundColor`, `borderColor`, and `canvasBackgroundColor` are configurable via props.
- Fake collaboration indicators were removed from default panels.

## JSON Presets And Schema

The package ships a default editor preset JSON and schema so teams can create custom layouts and tool sets:

- `nova-design-engine/presets/default-editor-preset.json`
- `nova-design-engine/presets/editor-preset.schema.json`

You can also consume a typed preset in code from `nova-design-engine/presets`:

- `defaultEditorPreset`
- `defaultEditorPresetJson`

## BYO LLM Binding

Implement `NovaLLMBinding`:

```ts
import { NovaLLMBinding } from 'nova-design-engine';

const binding: NovaLLMBinding = {
   async complete(input) {
      // Call your model provider here and return raw text.
      // The response should use [MESSAGE], [HTML], and [TWEAKS] blocks.
      return '[MESSAGE]ok[/MESSAGE][HTML]<div id="root"></div>[/HTML][TWEAKS][][/TWEAKS]';
   },
   async generateImage(prompt) {
      // Optional: resolve <img src="GENERATE:..."> tokens.
      return '';
   },
};
```

Then run a turn:

```ts
import { runNovaTurn } from 'nova-design-engine';

const result = await runNovaTurn(binding, {
   prompt: 'Create a modern signup card',
   history: [],
   contextNodes: [],
   selectedIds: [],
   basePosition: { x: 80, y: 80 },
});
```

Or use an official adapter:

```ts
import { createOpenAINovaBinding } from '@nova-design-engine/adapter-openai';

const binding = createOpenAINovaBinding({
   apiKey: process.env.OPENAI_API_KEY,
   model: 'gpt-4o',
});
```

## Build

```bash
npm run build
```

Compiled package output is emitted to `dist/`.

To build adapters in this workspace:

```bash
npm run build:adapters
```
