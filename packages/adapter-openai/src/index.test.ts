import { describe, expect, it, vi } from 'vitest';
import { createOpenAINovaBinding } from './index';

describe('createOpenAINovaBinding', () => {
  it('maps completion messages and returns assistant text', async () => {
    const createMock = vi.fn(async () => ({
      choices: [{ message: { content: 'ok-response' } }],
    }));

    const binding = createOpenAINovaBinding({
      client: {
        chat: { completions: { create: createMock } },
        images: { generate: vi.fn() },
      } as never,
      model: 'gpt-4o',
    });

    const output = await binding.complete({
      systemPrompt: 'You are a test adapter',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ],
    });

    expect(output).toBe('ok-response');
    expect(createMock).toHaveBeenCalledTimes(1);
    const firstCall = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(firstCall?.[0]).toMatchObject({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ],
    });
  });

  it('returns data URL for base64 image responses', async () => {
    const generateMock = vi.fn(async () => ({
      data: [{ b64_json: 'ZmFrZS1pbWFnZS1ieXRlcw==' }],
    }));

    const binding = createOpenAINovaBinding({
      client: {
        chat: { completions: { create: vi.fn() } },
        images: { generate: generateMock },
      } as never,
      imageModel: 'gpt-image-1',
      imageMimeType: 'image/png',
    });

    const image = await binding.generateImage?.('a test image');
    expect(image).toBe('data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==');
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});
