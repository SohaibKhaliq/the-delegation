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

export type MuseEventType = 'started' | 'milestone' | 'file_changed' | 'commit' | 'done' | 'blocked' | 'env_changed';

// Dynamic Environment v1 (Roadmap Step 1, VIEW-ONLY).
// Props are placed by REAL Muse agents through feed events only — never
// by a simulation agent on its own, and never by a command from the
// dashboard. Types are a closed list of primitives/simple builds only:
// no new GLB files, no downloaded models, no AI-generated imagery.
// Positions are office-floor coordinates in metres: x/z within [-8, 8],
// y (height of the prop group origin, on the floor) within [0, 3].
// `label` is metadata only in v1 — it is NOT rendered as 3D text.
// A prop with status 'removed' is not rendered; its entry is kept so a
// reload does not resurrect it. An absent `environmentProps` list means
// "unknown" (e.g. an old feed) and must NOT delete already-placed props;
// an explicitly empty list means "no props".
export type MuseEnvPropType = 'desk' | 'chair' | 'plant' | 'screen' | 'board' | 'lamp';

export interface MuseEnvProp {
  id: string;
  workspaceId: string;
  agentId: string;
  type: MuseEnvPropType;
  label?: string;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  status: 'active' | 'removed';
}

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

export interface MuseTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
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
  // Real Muse token counts for the session/step this event reports, if
  // Muse published them with the event. All optional, default 0. These
  // are NEVER estimated, auto-incremented, or fetched from a Muse token
  // API (none exists for this dashboard): if no counts were published,
  // the fields are absent/0 and the panel honestly shows 0.
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  // Dynamic Environment v1: for an 'env_changed' event, the single prop
  // this event placed or removed. The full current prop list lives in
  // MuseFeed.environmentProps; events are history, not the source of truth.
  envProp?: MuseEnvProp;
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
  // Aggregated token totals, recomputed by the publisher as the sum of
  // token fields on the events currently in the feed (max 200 events).
  // Optional: absent means no counts have been published yet (panel shows 0).
  tokenUsage?: MuseTokenUsage;
  // Dynamic Environment v1: the CURRENT environment props, maintained by
  // the publisher (an env_changed event adds/updates one entry here).
  // Optional: absent means unknown (old feed) — the scene must keep
  // already-placed props in that case. An explicitly empty list means
  // no props, and the scene must be exactly the stock office + characters.
  environmentProps?: MuseEnvProp[];
}

export type MuseFeedSource = 'live' | 'seed' | 'unavailable';
