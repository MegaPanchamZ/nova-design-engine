import OpenAI from 'openai';
import type {
  NovaLLMBinding,
  NovaLLMMessage,
} from '../../../src/engine/types';

export interface OpenAINovaAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  model?: string;
  imageModel?: string;
  imageSize?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
  imageMimeType?: string;
  temperature?: number;
  maxTokens?: number;
  client?: OpenAI;
}

const messagesToChatInput = (messages: NovaLLMMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  })) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;

const normalizeMessageContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
};

export const createOpenAINovaBinding = (options: OpenAINovaAdapterOptions = {}): NovaLLMBinding => {
  const client =
    options.client ||
    new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      baseURL: options.baseURL,
      organization: options.organization,
      project: options.project,
    });

  return {
    complete: async (input) => {
      const completion = await client.chat.completions.create({
        model: options.model || 'gpt-4o',
        messages: messagesToChatInput(input.messages),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });

      const messageContent = completion.choices[0]?.message?.content;
      return normalizeMessageContent(messageContent);
    },

    generateImage: async (prompt: string) => {
      const response = await client.images.generate({
        model: options.imageModel || 'gpt-image-1',
        prompt,
        size: options.imageSize || '1024x1024',
      });

      const firstImage = response.data?.[0];
      if (!firstImage) return '';

      if ('b64_json' in firstImage && typeof firstImage.b64_json === 'string' && firstImage.b64_json.length > 0) {
        const mimeType = options.imageMimeType || 'image/png';
        return `data:${mimeType};base64,${firstImage.b64_json}`;
      }

      if ('url' in firstImage && typeof firstImage.url === 'string') {
        return firstImage.url;
      }

      return '';
    },
  };
};
