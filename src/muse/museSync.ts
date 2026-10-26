// Sync the view-only Muse feed into the Delegation core stores, so the
// existing Team Flow, Kanban and Inspector panels show Muse work instead
// of only the default agency team with empty boards.
//
// How it works (view-only, no simulation, no commands):
// - Team: the feed is converted to one AgenticSystem with id 'muse'.
//   Lead agent = the feed's single 'main-agent' (S.O.N.I.A). Every
//   'subagent' becomes a subagent node under her, with its workspace in
//   its description (e.g. "Subagent · ADE workspace"). The main agent is
//   GLOBAL: she coordinates every workspace even though her home
//   workspaceId is 'the-delegation' — she is not duplicated per workspace,
//   because agent ids must stay unique.
// - Team selection: the Muse system is saved as a custom system on every
//   feed load (only if its JSON changed, to avoid store churn). The active
//   team is switched to 'muse' ONLY when the stored selection is still
//   the factory default ('single-agent', which otherwise falls back to
//   the unboring.net agency). A user who explicitly picks another team
//   is never snapped back by polling.
// - Tasks: each feed task becomes one core task with id `muse:<taskId>`,
//   assignedAgentId = the numeric index of its feed agent in the Muse
//   system, status mapped pending->scheduled, running->in_progress,
//   done->done, blocked->on_hold. Only `muse:` tasks are replaced on
//   each sync; tasks the user created in the editor are untouched.
//   Kanban agent tags resolve through the active team, so they are
//   correct when the Muse team is active; if the user switches to
//   another team, those tags follow that team's agents (the same
//   limitation the stock app already has for any team switch).
// - What is NOT synced: the 3D scene is not driven by this sync (the
//   scene manager already re-spawns NPCs when the active team changes,
//   and its blank-panel issue is separate), and Muse events are NOT
//   copied into the simulation ActionLog — that log is the simulation's
//   audit trail, and overwriting it with view-only feed events would
//   mix two different histories. Muse events remain visible in the
//   feed file itself and in any future Muse panel.
//
// This module never starts an agent, sends a command, approves output,
// or calls an LLM.
//
// DECOUPLING BOUNDARY: this is the ONLY module in src/muse/ that
// writes into the upstream core stores (coreStore, teamStore), and
// the only place feed data becomes a core team/tasks. Everything
// outside src/muse/ reaches the feed through src/muse/index.ts;
// nothing outside src/muse/ imports museSync directly anymore.
import type { AgenticSystem, AgentNode } from '../data/agents';
import { DEFAULT_AGENTIC_SET_ID } from '../data/agents';
import { useCoreStore, type TaskStatus } from '../integration/store/coreStore';
import { useTeamStore } from '../integration/store/teamStore';
import type { MuseFeed, MuseTask, MuseTaskStatus } from './museTypes';

export const MUSE_TEAM_ID = 'muse';
const MUSE_TASK_PREFIX = 'muse:';
const MUSE_MODEL = 'Muse (view-only)';

const COLORS = ['#0F172A', '#4285F4', '#34A853', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];

function workspaceName(feed: MuseFeed, id: string): string {
  return feed.workspaces.find((w) => w.id === id)?.name ?? id;
}

function kindOf(agent: MuseFeed['agents'][number]): 'main-agent' | 'subagent' {
  if (agent.kind) return agent.kind;
  return agent.name === 'S.O.N.I.A' ? 'main-agent' : 'subagent';
}

/** Numeric index for each feed agent id, stable within one feed snapshot. Main agent = 1, subagents = 2..n in feed order. */
export function museAgentIndexMap(feed: MuseFeed): Map<string, number> {
  const map = new Map<string, number>();
  const main = feed.agents.find((a) => kindOf(a) === 'main-agent') ?? feed.agents[0];
  const rest = feed.agents.filter((a) => a !== main);
  if (main) map.set(main.id, 1);
  rest.forEach((a, i) => map.set(a.id, i + 2));
  return map;
}

export function buildMuseSystem(feed: MuseFeed): AgenticSystem | null {
  const main = feed.agents.find((a) => kindOf(a) === 'main-agent') ?? feed.agents[0];
  if (!main) return null;
  const indexMap = museAgentIndexMap(feed);
  const subagents: AgentNode[] = feed.agents
    .filter((a) => a.id !== main.id)
    .map((a, i) => ({
      id: a.id,
      index: indexMap.get(a.id) ?? i + 2,
      name: a.name,
      description: `Subagent · ${workspaceName(feed, a.workspaceId)} workspace — ${a.role}. ${a.lastReport ?? ''}`.trim(),
      color: COLORS[(i + 1) % COLORS.length],
      model: MUSE_MODEL,
      position: { x: -450 + i * 180, y: 280 },
    }));
  return {
    id: MUSE_TEAM_ID,
    teamName: 'Muse',
    teamType: 'View-only',
    teamDescription:
      'Real Muse work, view-only. Main agent S.O.N.I.A coordinates all workspaces; subagents are role-named per workspace. No Gemini, no commands from here — control stays in Muse chat.',
    color: '#0F172A',
    outputType: 'text',
    outputModel: MUSE_MODEL,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: main.id,
      index: 1,
      name: main.name,
      description: `Main agent / coordinator for all Muse workspaces. ${main.lastReport ?? ''}`.trim(),
      color: COLORS[0],
      model: MUSE_MODEL,
      position: { x: 0, y: 130 },
      subagents,
    },
  };
}

function mapTaskStatus(s: MuseTaskStatus): TaskStatus {
  if (s === 'done') return 'done';
  if (s === 'running') return 'in_progress';
  if (s === 'blocked') return 'on_hold';
  return 'scheduled';
}

/** Idempotent sync: team system + muse: tasks only. Safe to call on every feed poll. */
export function syncMuseToCore(feed: MuseFeed): void {
  const system = buildMuseSystem(feed);
  if (!system) return;

  const teamStore = useTeamStore.getState();
  const existing = teamStore.customSystems.find((s) => s.id === MUSE_TEAM_ID);
  if (JSON.stringify(existing ?? null) !== JSON.stringify(system)) {
    teamStore.saveCustomSystem(system);
  }
  // Auto-select Muse only from the factory-default selection. Never
  // snap a user back after they explicitly picked another team.
  if (useTeamStore.getState().selectedAgentSetId === DEFAULT_AGENTIC_SET_ID) {
    useTeamStore.getState().setActiveTeam(MUSE_TEAM_ID);
  }

  const indexMap = museAgentIndexMap(feed);
  const stamp = feed.generatedAt ? Date.parse(feed.generatedAt) : Date.now();
  const desired = feed.tasks.map((t: MuseTask) => ({
    id: `${MUSE_TASK_PREFIX}${t.id}`,
    title: t.title,
    description: `[${workspaceName(feed, t.workspaceId)}] ${t.report ?? ''}${t.filesChanged?.length ? ` Files: ${t.filesChanged.join(', ')}` : ''}`.trim(),
    assignedAgentId: indexMap.get(t.agentId) ?? 1,
    status: mapTaskStatus(t.status),
    requiresUserApproval: false,
    revisions: [] as never[],
    createdAt: Number.isFinite(stamp) ? stamp : Date.now(),
    updatedAt: Number.isFinite(stamp) ? stamp : Date.now(),
  }));
  const core = useCoreStore.getState();
  const kept = core.tasks.filter((t) => !t.id.startsWith(MUSE_TASK_PREFIX));
  const next = [...kept, ...desired];
  if (JSON.stringify(core.tasks) !== JSON.stringify(next)) {
    useCoreStore.setState({ tasks: next as typeof core.tasks });
  }
}
