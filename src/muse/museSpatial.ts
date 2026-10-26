// Human-Agent Spatial Interaction v1 (VIEW-ONLY, Roadmap Step 4).
//
// Upstream "Human-Agent Spatial Interaction" is direct collaboration
// and richer multi-party interaction in the 3D office, driven by a
// simulation. This fork has NO simulation, NO LLM, and NO dashboard
// commands back to Muse, so the adaptation is deliberately narrower:
//
//   - The VIEWER's spatial interaction with the office is richer
//     and more informative about REAL Muse work.
//   - Clicking an agent character in 3D selects it (existing
//     InputManager/SceneManager selection, camera already follows
//     the selected agent) and the Inspector shows that agent's REAL
//     feed data: workspace, role, status, current task, last
//     milestone report. Nothing is invented, no chat is shown,
//     no secrets are displayed (feed carries metadata only).
//   - Agents that share the selected agent's workspace and are
//     idle gather near the selected agent (selection-triggered,
//     local view action only — see SceneManager).
//
// This module is pure: it derives display data from a feed snapshot
// and knows nothing about Three.js, the controller, or POIs.
// Nothing here starts an agent, sends a command, queues a command,
// changes feed state, or calls an LLM. Clicking is read-only: it
// only changes what the viewer is looking at.
import type { MuseAgent, MuseEvent, MuseFeed, MuseTask } from './museTypes';
import { museAgentIndexMap } from './museSync';

export interface MuseSpatialPeer {
  id: string;
  name: string;
  role: string;
  status: MuseAgent['status'];
  index: number;
  isMainAgent: boolean;
}

export interface MuseSpatialSelection {
  agent: MuseAgent;
  index: number;
  workspaceName: string;
  currentTask: MuseTask | null;
  /** Latest feed event for this agent, if any (array order = feed order). */
  lastEvent: MuseEvent | null;
  /** Last report text: agent.lastReport, else the last event's report. */
  lastReport: string | null;
  peers: MuseSpatialPeer[];
}

function workspaceName(feed: MuseFeed, id: string): string {
  return feed.workspaces.find((w) => w.id === id)?.name ?? id;
}

function isMainAgent(agent: MuseAgent): boolean {
  if (agent.kind) return agent.kind === 'main-agent';
  return agent.name === 'S.O.N.I.A';
}

/** Current task for an agent: its currentTask id first, else its most recent feed task (running > blocked > pending > done, then feed order). */
export function currentTaskForAgent(feed: MuseFeed, agent: MuseAgent): MuseTask | null {
  if (agent.currentTask) {
    const byId = feed.tasks.find((t) => t.id === agent.currentTask);
    if (byId) return byId;
  }
  const mine = feed.tasks.filter((t) => t.agentId === agent.id);
  if (mine.length === 0) return null;
  const rank: Record<string, number> = { running: 0, blocked: 1, pending: 2, done: 3 };
  return [...mine].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))[0] ?? null;
}

/**
 * Derive the spatial-selection display data for a character index,
 * or null when the index is the user (0), unmapped, or not a feed
 * agent. Index mapping is museSync's: main agent = 1, subagents
 * 2..n in feed order. Callers must already know the Muse team is
 * active; this function alone does not check team selection.
 */
export function deriveSpatialSelection(feed: MuseFeed, index: number | null): MuseSpatialSelection | null {
  if (index === null || index === 0) return null;
  const indexMap = museAgentIndexMap(feed);
  const agent = feed.agents.find((a) => indexMap.get(a.id) === index);
  if (!agent) return null;
  const events = feed.events.filter((e) => e.agentId === agent.id);
  const lastEvent = events.length > 0 ? events[events.length - 1]! : null;
  const peers: MuseSpatialPeer[] = feed.agents
    .filter((a) => a.id !== agent.id && a.workspaceId === agent.workspaceId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      index: indexMap.get(a.id) ?? -1,
      isMainAgent: isMainAgent(a),
    }))
    .filter((p) => p.index > 0);
  return {
    agent,
    index,
    workspaceName: workspaceName(feed, agent.workspaceId),
    currentTask: currentTaskForAgent(feed, agent),
    lastEvent,
    lastReport: agent.lastReport ?? lastEvent?.report ?? null,
    peers,
  };
}

/** Peers eligible to be gathered: subagents only (never the main agent, never the selected agent itself). */
export function gatherablePeers(selection: MuseSpatialSelection): MuseSpatialPeer[] {
  return selection.peers.filter((p) => !p.isMainAgent);
}
