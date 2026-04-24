# @nova-design-engine/adapter-openai

Official OpenAI-backed adapter for `NovaLLMBinding`.

## Install

```bash
npm install @nova-design-engine/adapter-openai openai nova-design-engine
```

## Usage

```ts
import { createOpenAINovaBinding } from '@nova-design-engine/adapter-openai';

const binding = createOpenAINovaBinding({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
});
```
