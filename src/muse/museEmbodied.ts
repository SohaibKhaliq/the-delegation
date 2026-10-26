// Advanced Embodied AI v1 (VIEW-ONLY, Roadmap Step 2).
//
// Upstream "Advanced Embodied AI" is deeper integration between agent
// reasoning and physical 3D world actions, driven by an LLM simulation.
// This fork has NO LLM simulation and NO dashboard commands, so the
// adaptation is deliberately narrower and honest:
//
//   REAL Muse feed state -> visible 3D character behaviour.
//
// The feed is the only source of truth. No reasoning text is invented,
// no agent "thoughts" are shown, no LLM is called, and nothing here
// sends anything back to Muse. The character's pose/location is a
// visualisation of its reported status, exactly like the Team Flow
// panel is a visualisation of the same feed.
//
// Derivation (per feed agent, priority order — first match wins):
//   blocked  — any of the agent's tasks is 'blocked', OR the agent's
//              own feed status is 'blocked'.
//   working  — any of the agent's tasks is 'running', OR the agent's
//              own feed status is 'running'.
//   idle     — everything else: no running/blocked task, agent status
//              idle / pending / done, or no tasks at all. An agent
//              that just finished a task therefore returns to idle,
//              it does not stay frozen at a desk.
//
// This module is pure: it derives states from a feed snapshot and
// knows nothing about Three.js, the controller, or POIs. SceneManager
// owns the actual movement/pose, reusing only existing animations
// and NavMesh POIs (sit_work desks, boardroom area, spawn POIs).
// There are no new GLBs, no new animation files, no AI assets.
//
// Why this is needed on top of the existing core-store watcher:
// SceneManager.startWatchingCoreStore() already reacts to core task
// status *changes* (in_progress -> desk, on_hold -> boardroom,
// justDone -> spawn). That path misses three cases, which this
// module covers: (a) the feed's own agent status, which museSync
// never copied into the core store at all; (b) the state that is
// already true when the scene first loads or when the Muse team is
// (re)selected — a change-only watcher never fires for it; and
// (c) re-application on every feed poll, so a character that was
// moved by autonomous driver behaviour is brought back in line
// with the feed when its state is (re)derived. The core watcher is
// left untouched for simulation teams and user-created tasks; both
// paths converge on the same destinations/poses for Muse agents,
// so they cannot fight each other into different states.
import type { MuseFeed } from './museTypes';
import { museAgentIndexMap } from './museSync';

export type MuseEmbodiedState = 'working' | 'blocked' | 'idle';

/**
 * Derive the embodied state for every feed agent, keyed by the
 * numeric character index used by museSync (main agent = 1,
 * subagents = 2..n in feed order). The user character (index 0)
 * is never included.
 */
export function deriveMuseEmbodiedStates(feed: MuseFeed): Map<number, MuseEmbodiedState> {
  const indexMap = museAgentIndexMap(feed);
  const states = new Map<number, MuseEmbodiedState>();
  for (const agent of feed.agents) {
    const index = indexMap.get(agent.id);
    if (index === undefined || index === 0) continue;
    const tasks = feed.tasks.filter((t) => t.agentId === agent.id);
    let state: MuseEmbodiedState = 'idle';
    if (tasks.some((t) => t.status === 'blocked') || agent.status === 'blocked') {
      state = 'blocked';
    } else if (tasks.some((t) => t.status === 'running') || agent.status === 'running') {
      state = 'working';
    }
    states.set(index, state);
  }
  return states;
}
