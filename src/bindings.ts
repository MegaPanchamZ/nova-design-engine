import { AIMessage, AITweak, SceneNode } from './types';
import {
  MergeGeneratedNodesResult,
  NovaLLMBinding,
  NovaTurnInput,
  NovaTurnResult,
} from './engine/types';
import { mergeGeneratedNodes, runNovaTurn } from './engine/engine';

export interface NovaEditorTurnBindings {
  runTurn: (binding: NovaLLMBinding, input: NovaTurnInput) => Promise<NovaTurnResult>;
  mergeNodes: (input: {
    existingNodes: SceneNode[];
    generatedNodes: SceneNode[];
    selectedIds?: string[];
  }) => MergeGeneratedNodesResult;
}

export interface ApplyNovaTurnToStateInput {
  existingNodes: SceneNode[];
  selectedIds: string[];
  history: AIMessage[];
  prompt: string;
  turn: NovaTurnResult;
}

export interface ApplyNovaTurnToStateResult {
  nodes: SceneNode[];
  selectedIds: string[];
  aiHistory: AIMessage[];
  aiTweaks: AITweak[];
}

export const createNovaEditorBindings = (): NovaEditorTurnBindings => ({
  runTurn: runNovaTurn,
  mergeNodes: mergeGeneratedNodes,
});

export const applyNovaTurnToState = (
  input: ApplyNovaTurnToStateInput,
  bindings: NovaEditorTurnBindings = createNovaEditorBindings()
): ApplyNovaTurnToStateResult => {
  const merged = bindings.mergeNodes({
    existingNodes: input.existingNodes,
    generatedNodes: input.turn.nodes,
    selectedIds: input.selectedIds,
  });

  return {
    nodes: merged.nodes,
    selectedIds: merged.selectedIds,
    aiHistory: [
      ...input.history,
      { role: 'user', content: input.prompt },
      { role: 'assistant', content: input.turn.parsed.message },
    ],
    aiTweaks: input.turn.parsed.tweaks,
  };
};
