# @nova-design-engine/adapter-google-genai

Official Google GenAI-backed adapter for `NovaLLMBinding`.

## Install

```bash
npm install @nova-design-engine/adapter-google-genai @google/genai nova-design-engine
```

## Usage

```ts
import { createGoogleGenAINovaBinding } from '@nova-design-engine/adapter-google-genai';

const binding = createGoogleGenAINovaBinding({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-flash',
});
```
