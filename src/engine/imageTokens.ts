export const resolveGeneratedImageTokens = async (
  html: string,
  generateImage: ((prompt: string) => Promise<string>) | undefined
): Promise<{ html: string; generatedImageCount: number }> => {
  if (!html) return { html, generatedImageCount: 0 };

  const imageTokenRegex = /<img[^>]+src="GENERATE:([^"]+)"[^>]*>/g;
  const tokens: Array<{ tag: string; prompt: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = imageTokenRegex.exec(html)) !== null) {
    tokens.push({ tag: match[0], prompt: match[1] });
  }

  if (tokens.length === 0 || !generateImage) {
    return { html, generatedImageCount: 0 };
  }

  let nextHtml = html;
  let generatedImageCount = 0;

  for (const token of tokens) {
    try {
      const dataUrl = await generateImage(token.prompt);
      if (dataUrl) {
        nextHtml = nextHtml.replace(token.tag, token.tag.replace(`src="GENERATE:${token.prompt}"`, `src="${dataUrl}"`));
        generatedImageCount += 1;
      }
    } catch {
      // Keep original token if image generation fails.
    }
  }

  return { html: nextHtml, generatedImageCount };
};
