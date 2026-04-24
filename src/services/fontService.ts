
export const GOOGLE_FONTS = [
  'Inter',
  'JetBrains Mono',
  'Space Grotesk',
  'Outfit',
  'Playfair Display',
  'Noto Sans SC',        // Chinese Simplified
  'Noto Sans JP',        // Japanese
  'Noto Sans Devanagari', // Hindi
  'Noto Sans KR',        // Korean
  'Roboto',
];

export const loadFont = async (fontFamily: string) => {
  if (document.fonts.check(`1em "${fontFamily}"`)) {
    return true;
  }

  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  try {
    await document.fonts.load(`1em "${fontFamily}"`);
    return true;
  } catch (e) {
    console.error('Failed to load font:', fontFamily, e);
    return false;
  }
};
