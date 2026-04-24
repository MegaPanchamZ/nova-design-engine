import { AIMessage, SceneNode } from '../types';
import { parseHTMLToNodes } from '../lib/htmlParser';
import { nodesToHtmlContext } from './context';
import { DEFAULT_NOVA_SYSTEM_PROMPT } from './defaultPrompt';
import { resolveGeneratedImageTokens } from './imageTokens';
import { parseNovaResponse } from './parse';
import {
  MergeGeneratedNodesInput,
  MergeGeneratedNodesResult,
  NovaLLMBinding,
  NovaTurnInput,
  NovaTurnResult,
} from './types';

const mapHistoryToMessages = (history: AIMessage[] = []): Array<{ role: 'user' | 'assistant'; content: string }> => {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
};

const buildUserPrompt = (prompt: string, contextNodes: SceneNode[] = []): string => {
  if (contextNodes.length === 0) return prompt;
  const contextHTML = nodesToHtmlContext(contextNodes);
  return `${prompt}\n\nCURRENT DESIGN CONTEXT (HTML):\n${contextHTML}`;
};

export const runNovaTurn = async (
  binding: NovaLLMBinding,
  input: NovaTurnInput
): Promise<NovaTurnResult> => {
  const selectedIds = input.selectedIds || [];
  const systemPrompt = input.systemPrompt || DEFAULT_NOVA_SYSTEM_PROMPT;
  const messages = [
    ...mapHistoryToMessages(input.history),
    {
      role: 'user' as const,
      content: buildUserPrompt(input.prompt, input.contextNodes || []),
    },
  ];

  const rawResponse = await binding.complete({
    systemPrompt,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  const parsed = parseNovaResponse(rawResponse || '', selectedIds);
  const imageResolved = await resolveGeneratedImageTokens(parsed.html, binding.generateImage);

  let nodes: SceneNode[] = [];
  if (imageResolved.html) {
    if (input.htmlToNodes) {
      nodes = await input.htmlToNodes(imageResolved.html, input.basePosition || { x: 0, y: 0 });
    } else if (typeof document !== 'undefined') {
      nodes = parseHTMLToNodes(imageResolved.html, input.basePosition || { x: 0, y: 0 });
    }
  }

  return {
    rawResponse: rawResponse || '',
    parsed: {
      ...parsed,
      html: imageResolved.html,
    },
    nodes,
    generatedImageCount: imageResolved.generatedImageCount,
  };
};

export const mergeGeneratedNodes = (input: MergeGeneratedNodesInput): MergeGeneratedNodesResult => {
  const selectedIds = input.selectedIds || [];
  const newNodeIdSet = new Set(input.generatedNodes.map((node) => node.id));
  const isIterative = input.generatedNodes.some((node) => input.existingNodes.some((existing) => existing.id === node.id));

  let baseNodes = input.existingNodes;
  if (isIterative) {
    baseNodes = input.existingNodes.filter((node) => !newNodeIdSet.has(node.id));
  } else if (selectedIds.length > 0) {
    const selectedSet = new Set(selectedIds);
    baseNodes = input.existingNodes.filter((node) => !selectedSet.has(node.id) && !selectedSet.has(node.parentId || ''));
  }

  return {
    nodes: [...baseNodes, ...input.generatedNodes],
    selectedIds: input.generatedNodes.filter((node) => !node.parentId).map((node) => node.id),
  };
};
