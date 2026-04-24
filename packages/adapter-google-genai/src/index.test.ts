import { describe, expect, it, vi } from 'vitest';
import { createGoogleGenAINovaBinding } from './index';

describe('createGoogleGenAINovaBinding', () => {
  it('maps messages to generateContent and returns response text', async () => {
    const generateContentMock = vi.fn(async () => ({ text: 'gemini-response' }));

    const binding = createGoogleGenAINovaBinding({
      client: {
        models: {
          generateContent: generateContentMock,
        },
      } as never,
      model: 'gemini-2.5-flash',
    });

    const output = await binding.complete({
      systemPrompt: 'sys prompt',
      messages: [
        { role: 'system', content: 'system content' },
        { role: 'user', content: 'hello world' },
      ],
    });

    expect(output).toBe('gemini-response');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const firstCall = generateContentMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(firstCall?.[0]).toMatchObject({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: 'sys prompt',
      },
    });
  });

  it('returns generated image as data URL from inlineData', async () => {
    const generateContentMock = vi.fn(async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'YmFzZTY0LWJ5dGVz',
                },
              },
            ],
          },
        },
      ],
    }));

    const binding = createGoogleGenAINovaBinding({
      client: {
        models: {
          generateContent: generateContentMock,
        },
      } as never,
      imageModel: 'gemini-2.5-flash-image',
    });

    const image = await binding.generateImage?.('a scenic photo');
    expect(image).toBe('data:image/png;base64,YmFzZTY0LWJ5dGVz');
  });
});
