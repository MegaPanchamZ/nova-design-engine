import { AITweak, AIMessage, SceneNode } from '../types';

export interface NovaLLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NovaCompletionInput {
  messages: NovaLLMMessage[];
  systemPrompt: string;
}

export interface NovaLLMBinding {
  complete: (input: NovaCompletionInput) => Promise<string>;
  generateImage?: (prompt: string) => Promise<string>;
}

export interface NovaTurnInput {
  prompt: string;
  history?: AIMessage[];
  contextNodes?: SceneNode[];
  selectedIds?: string[];
  basePosition?: { x: number; y: number };
  systemPrompt?: string;
  htmlToNodes?: (html: string, basePosition: { x: number; y: number }) => SceneNode[] | Promise<SceneNode[]>;
}

export interface NovaParsedResponse {
  message: string;
  html: string;
  tweaks: AITweak[];
}

export interface NovaTurnResult {
  rawResponse: string;
  parsed: NovaParsedResponse;
  nodes: SceneNode[];
  generatedImageCount: number;
}

export interface MergeGeneratedNodesInput {
  existingNodes: SceneNode[];
  generatedNodes: SceneNode[];
  selectedIds?: string[];
}

export interface MergeGeneratedNodesResult {
  nodes: SceneNode[];
  selectedIds: string[];
}
