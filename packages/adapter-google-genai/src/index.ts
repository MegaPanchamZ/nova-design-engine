import { GoogleGenAI } from '@google/genai';
import type { NovaLLMBinding, NovaLLMMessage } from 'nova-design-engine';

export interface GoogleGenAINovaAdapterOptions {
  apiKey?: string;
  model?: string;
  imageModel?: string;
  temperature?: number;
  maxOutputTokens?: number;
  client?: GoogleGenAI;
}

const toGoogleRole = (role: NovaLLMMessage['role']): 'user' | 'model' => {
  if (role === 'assistant') return 'model';
  return 'user';
};

const toContents = (messages: NovaLLMMessage[]) => {
  const nonSystemMessages = messages.filter((message) => message.role !== 'system');
  if (nonSystemMessages.length === 0) {
    return [{ role: 'user' as const, parts: [{ text: '' }] }];
  }

  return nonSystemMessages.map((message) => ({
    role: toGoogleRole(message.role),
    parts: [{ text: message.content }],
  }));
};

export const createGoogleGenAINovaBinding = (
  options: GoogleGenAINovaAdapterOptions = {}
): NovaLLMBinding => {
  const client =
    options.client ||
    new GoogleGenAI({
      apiKey: options.apiKey || process.env.GEMINI_API_KEY,
    });

  return {
    complete: async (input) => {
      const response = await client.models.generateContent({
        model: options.model || 'gemini-2.5-flash',
        contents: toContents(input.messages),
        config: {
          systemInstruction: input.systemPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
        },
      });

      return response.text || '';
    },

    generateImage: async (prompt: string) => {
      const response = await client.models.generateContent({
        model: options.imageModel || 'gemini-2.5-flash-image',
        contents: prompt,
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }

      return '';
    },
  };
};
