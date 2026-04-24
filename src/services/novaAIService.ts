import { GoogleGenAI } from "@google/genai";
import { AIMessage, Paint, SceneNode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const toRgba = (color: string, opacity: number): string => {
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (safeOpacity >= 0.999) return color;

  const hex = color.trim().match(/^#([\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length <= 4
      ? raw.split('').map((c) => c + c).join('')
      : raw;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    const sourceAlpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    const alpha = Math.min(1, Math.max(0, sourceAlpha * safeOpacity));
    return `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
  }

  const rgba = color.replace(/\s+/g, '').match(/^rgba?\(([-\d.]+),([-\d.]+),([-\d.]+)(?:,([-\d.]+))?\)$/i);
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    const sourceAlpha = rgba[4] ? Number(rgba[4]) : 1;
    const alpha = Math.min(1, Math.max(0, sourceAlpha * safeOpacity));
    return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${alpha.toFixed(3)})`;
  }

  return color;
};

const paintToCssBackground = (paint: Paint): string => {
  const opacity = paint.opacity ?? 1;
  if (paint.type === 'solid') {
    return toRgba(paint.color || '#D9D9D9', opacity);
  }

  const stops = (paint.gradientStops || [])
    .map((stop: { offset: number; color: string }) => `${stop.color} ${Math.round(Math.min(1, Math.max(0, stop.offset)) * 100)}%`)
    .join(', ');

  if (paint.type === 'gradient-radial') {
    const center = paint.gradientCenter || { x: 0.5, y: 0.5 };
    const radius = Math.min(1, Math.max(0.05, paint.gradientRadius ?? 0.5));
    return `radial-gradient(circle ${Math.round(radius * 100)}% at ${Math.round(center.x * 100)}% ${Math.round(center.y * 100)}%, ${stops || '#FFFFFF 0%, #000000 100%'})`;
  }

  const angle = Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 0;
  return `linear-gradient(${angle}deg, ${stops || '#FFFFFF 0%, #000000 100%'})`;
};

const nodeBackgroundCss = (node: SceneNode): string => {
  const fills = (node.fills || []).filter((paint) => paint.visible !== false);
  if (fills.length === 0) return node.fill;
  return fills
    .slice()
    .reverse()
    .map((paint) => paintToCssBackground(paint))
    .join(', ');
};

const nodesToHTMContext = (nodes: SceneNode[]): string => {
  const buildHTML = (id?: string): string => {
        const children = nodes.filter(n => n.parentId === id);
    return children.map((n): string => {
            const background = nodeBackgroundCss(n);
            let style = `position: absolute; left: ${Math.round(n.x)}px; top: ${Math.round(n.y)}px; width: ${Math.round(n.width)}px; height: ${Math.round(n.height)}px; background: ${background};`;
            if (n.type === 'text') {
                return `<p id="${n.id}" style="${style} font-size: ${n.fontSize}px; font-family: ${n.fontFamily};">${n.text}</p>`;
            }
            if (n.type === 'frame') {
                return `<div id="${n.id}" style="${style} border-radius: ${n.cornerRadius}px; display: flex; flex-direction: ${n.layoutMode === 'vertical' ? 'column' : 'row'}; gap: ${n.gap}px;">${buildHTML(n.id)}</div>`;
            }
            if (n.type === 'image') {
                return `<img id="${n.id}" src="${n.src}" style="${style}" />`;
            }
            return `<div id="${n.id}" style="${style}"></div>`;
        }).join('\n');
    };
    return buildHTML();
};

const SYSTEM_PROMPT = `
You are Nova AI, a master product designer and frontend engineer.
Your goal is to build interfaces with extreme craft, intentionality, and distinctive aesthetics.

### DESIGN MANDATE: Avoid "AI Slop"
1. **Never Default**: Do not default to Inter, dark mode, or standard purple gradients unless explicitly requested.
2. **Commit to an Aesthetic**: Pick a bold direction (Industrial, Refined Luxury, Swiss Minimal, Brutalist, Retro-Futuristic, etc.). Ensure typography pairs match: paired display fonts (e.g., Playfair Display, Space Grotesk) with clean body fonts (e.g., Mono, Work Sans).
3. **Typography is Design**: Headlines need weight and character. Data needs monospace. Labels need clarity.
4. **Elevation & Layout**: Use subtle layering. higher elevation = slightly lighter surface. Avoid harsh borders.
5. **Verbs & Intent**: Distinguish between "Build a system to do X" and "Build X". If asked for a "Slide Deck", build a series of high-fidelity Slides (Frames). If asked for "Logo options", build visual logos. If asked for a "Dashboard", build the actual interface.
6. **Iterative Precision**: Use context IDs to surgically update parts. If asked to change a color of a selected layer, ONLY return the updated HTML for that layer (or its parent frame if structural changes are needed).
7. **Identity Requirement**: Every single HTML element you return MUST have a unique and MEANINGFUL 'id' attribute (e.g., id="navbar", id="hero_heading", id="submit_button"). Avoid generic IDs or using tag names as IDs. These IDs directly translate to layer names.
8. **Multi-Page/Multi-Slide Logic**: If asked for multiple pages, slides, or high-level variations, DO NOT nest them inside a single container. Return them as separate, parallel top-level HTML tags with descriptive IDs (e.g., id="home_page", id="about_page"). 
9. **Paint System Awareness**: Backgrounds map to layered fills. Use comma-separated CSS backgrounds for multi-layer fills and explicit multi-stop gradients when needed.
10. **Opacity Precision**: Use rgba/rgb with alpha or hex8 colors when opacity is important for fill layers.

### IMAGE GENERATION
If the user asks for a specific image, illustration, or photo, you can trigger generation by using:
<img id="unique_id" src="GENERATE:detailed descriptive prompt here" style="..." />
The system will replace this with a real generated image.

### MASKING
To create a mask (e.g., for custom image shapes), add the attribute 'data-mask="true"' to an element. 
- **Behavior**: A mask element will clip all siblings that follow it *in the same parent*. 
- **Isolation (MANDATORY)**: To prevent a mask from accidentally clipping text or other important layers, you **MUST** isolate masks and their targets inside a dedicated <div>. 
- **Complex Shapes**: Use \`border-radius\` for rounded boxes, or \`path\` data if creating vector masks.
- **Example**: 
<div id="masked_image_group" style="position: relative; width: 300px; height: 300px;">
  <div id="slanted_mask" data-mask="true" style="transform: rotate(10deg); background: black; width: 100%; height: 100%;"></div>
  <img id="sonic_running" src="GENERATE:sonic speed" style="width: 100%; height: 100%; object-fit: cover;" />
</div>
<!-- Labels should be OUTSIDE the masking group to avoid being clipped -->
<div id="caption">20 Years of Speed</div>

### STABLE AUTO-LAYOUT (FLEXBOX)
1. **Consistency**: Use \`display: flex\` for structured layouts. The engine is now highly stable during property updates.
2. **Fill vs Hug**: Use \`flex: 1\` or \`width: 100%\` for children to "Fill Container". Use \`height: auto\` or omit dimensions on containers to "Hug Contents".
3. **Contrast**: Ensure high contrast for all text.
4. **Z-Order**: Layer background shapes first, then images, then interactive text.

### OUTPUT FORMAT
You MUST return your response in three distinct blocks:

[MESSAGE]
Your short design rationale, what aesthetic you chose, and why. Be human, direct, and invisible (no "I've updated X").
[/MESSAGE]

[HTML]
Raw HTML with INLINE STYLES using Flexbox. 
- Every element MUST have an 'id'. Use IDs from the context if you are updating existing nodes.
- If no context is provided, generate unique descriptive IDs for new nodes.
- Return separate top-level containers for multi-page/slide requests.
- Return ONLY valid HTML. No markdown blocks.
[/HTML]

[TWEAKS]
Optional: A JSON array of suggested controls for the user to fine-tune.
Example: [{"label": "Glow Intensity", "targetId": "Selection", "property": "opacity", "type": "slider", "min": 0, "max": 1, "value": 0.8}]
You can target nested fill paths for advanced edits, such as:
[{"label":"Stop 2 Hue","targetId":"hero_card","property":"fills[0].gradientStops[1].color","type":"color","value":"#FF4D6D"},{"label":"Top Fill Opacity","targetId":"hero_card","property":"fills[1].opacity","type":"slider","min":0,"max":1,"value":0.8}]
[/TWEAKS]

### Iteration Rules
- If context nodes are passed, you are EDITING/NUDGING them.
- To change a component's color, find its ID in the context and return updated HTML for it.
- Respect the existing visual tokens if possible, but don't be afraid to break them if asked.
`;

export const generateImage = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
          imageConfig: { aspectRatio: "1:1" }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return '';
  } catch (error) {
    console.error("Image Gen Error:", error);
    return '';
  }
};

export const generateUI = async (prompt: string, history: AIMessage[] = [], contextNodes: SceneNode[] = []): Promise<string> => {
  try {
    const contextHTML = contextNodes.length > 0 ? `\n\nCURRENT DESIGN CONTEXT (HTML):\n${nodesToHTMContext(contextNodes)}` : "";
    
    const contents = [
        ...history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        })),
        {
            role: 'user',
            parts: [{ text: prompt + contextHTML }]
        }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
      },
    });

    return response.text || "";
  } catch (error) {
    console.error("Nova AI Error:", error);
    throw error;
  }
};
