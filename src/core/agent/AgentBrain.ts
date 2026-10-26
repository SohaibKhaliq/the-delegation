// VIEW-ONLY brain — Gemini removed.
//
// This class keeps the old AgentBrain interface (think / spark / executeTask /
// concludeProject / appendHistory / isThinking) so AgentHost and the
// simulation layer compile unchanged, but it never calls an LLM, never
// reads an API key, and never opens a key modal. In this fork, agents are
// driven by real Muse data through the feed in src/muse/ (see README:
// "Muse-data adapter"), and agent control stays in Muse chat. Any code path
// that would previously have sparked a Gemini simulation now returns a
// short view-only message instead, and final-asset generation is a no-op.
import { LLMMessage } from '../llm/types';

export interface BrainHost {
  data: { index: number; name: string; model?: string; subagents?: unknown[] };
  simulation: {
    getAllAgents: () => unknown[];
    processScheduledTasks: () => void;
  };
  getCurrentTaskId: () => string | null;
}

export interface ThinkOptions {
  isChat?: boolean;
  tools?: unknown[];
  silent?: boolean;
}

export const VIEW_ONLY_MESSAGE =
  'View-only mode: this dashboard shows real Muse agent data. Agents are controlled from Muse chat, not from here, and no Gemini call is made.';

export class AgentBrain {
  private history: LLMMessage[] = [];
  public isThinking: boolean = false;

  constructor(private readonly host: BrainHost) {
    this.refreshFromStore();
  }

  public async think(
    _prompt: string,
    _options: ThinkOptions = {},
  ): Promise<{ text: string; toolCalls: unknown[] }> {
    // Deliberately no LLM call, no key check, no modal, and no scheduled-task
    // re-trigger (that would loop: the old loop relied on LLM tool calls to
    // advance tasks, which no longer exist in view-only mode).
    if (this.isThinking) return { text: '', toolCalls: [] };
    this.isThinking = true;
    try {
      return { text: VIEW_ONLY_MESSAGE, toolCalls: [] };
    } finally {
      this.isThinking = false;
    }
  }

  /** Autonomous Intent (disabled in view-only mode). */
  public async spark() {
    return { text: VIEW_ONLY_MESSAGE, toolCalls: [] as unknown[] };
  }

  /** Task execution (disabled in view-only mode). */
  public async executeTask(_taskId: string) {
    return { text: VIEW_ONLY_MESSAGE, toolCalls: [] as unknown[] };
  }

  /** Project delivery (disabled in view-only mode). */
  public async concludeProject() {
    return { text: VIEW_ONLY_MESSAGE, toolCalls: [] as unknown[] };
  }

  /** Final asset generation (disabled in view-only mode). */
  public async processFinalAsset(_prompt: string, _options: unknown) {
    return;
  }

  public appendHistory(message: LLMMessage) {
    this.history.push(message);
    this.syncToStore();
  }

  private refreshFromStore() {
    // History is kept locally in view-only mode; the store sync below is a
    // no-op shim kept so AgentHost.appendHistory still works. Real agent
    // history lives in Muse, and is displayed via the Muse feed, not here.
    this.history = [];
  }

  private syncToStore() {
    // Intentionally no-op in view-only mode (see refreshFromStore).
  }
}
