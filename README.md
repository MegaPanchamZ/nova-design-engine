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

Browser-only export helpers are available from `nova-design-engine/browser`:

- `exportToSVG`
- `exportToPDF`
- `triggerDownload`

Parser-focused browser-safe import is available from `nova-design-engine/parser`:

- `parseHTMLToNodes`

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
