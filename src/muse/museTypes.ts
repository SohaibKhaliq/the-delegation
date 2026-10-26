// Muse-data adapter types (VIEW-ONLY).
//
// This fork of The Delegation no longer runs a Gemini simulation. The UI
// displays real Muse agent work reported through a feed (see museStore.ts).
// Nothing in this module starts an agent, sends a command, approves output,
// or calls any LLM. Control stays in Muse chat.
//
// Feed schema (version 1) — see README section "Muse-data adapter" for the
// full documented schema and for how a live bridge replaces the seed file.

export type MuseAgentStatus = 'idle' | 'running' | 'done' | 'blocked' | 'pending';

export type MuseTaskStatus = 'pending' | 'running' | 'done' | 'blocked';

export type MuseEventType = 'started' | 'milestone' | 'file_changed' | 'commit' | 'done' | 'blocked';

export interface MuseWorkspace {
  id: string;
  name: string;
  description?: string;
}

export type MuseAgentKind = 'main-agent' | 'subagent';

export interface MuseAgent {
  id: string;
  name: string;
  role: string;
  // Hierarchy: exactly one 'main-agent' (S.O.N.I.A, the coordinator) and
  // any number of 'subagent' entries, one per real work function per
  // workspace. Role names only — never fake person names. Older feed
  // entries without `kind` are treated as 'subagent', except the agent
  // named S.O.N.I.A, which is treated as 'main-agent'.
  kind?: MuseAgentKind;
  // Home workspace for this agent. The main agent is a GLOBAL coordinator:
  // it coordinates every workspace even though its home workspaceId is
  // 'the-delegation'. Subagents belong to exactly one workspace.
  workspaceId: string;
  status: MuseAgentStatus;
  currentTask?: string | null;
  lastReport?: string;
}

export interface MuseTask {
  id: string;
  title: string;
  workspaceId: string;
  agentId: string;
  status: MuseTaskStatus;
  report?: string;
  filesChanged?: string[];
}

export interface MuseEvent {
  id: string;
  timestamp: string;
  type: MuseEventType;
  workspaceId: string;
  agentId: string;
  taskId?: string;
  report?: string;
  filesChanged?: string[];
}

export interface MuseFeed {
  version: number;
  // 'seed' = the bundled sample file; 'live' = served by GET /api/muse-state
  // from a real Muse event bridge. Any other value is treated as seed.
  source: 'seed' | 'live';
  sourceLabel?: string;
  generatedAt?: string;
  note?: string;
  workspaces: MuseWorkspace[];
  agents: MuseAgent[];
  tasks: MuseTask[];
  events: MuseEvent[];
}

export type MuseFeedSource = 'live' | 'seed' | 'unavailable';
