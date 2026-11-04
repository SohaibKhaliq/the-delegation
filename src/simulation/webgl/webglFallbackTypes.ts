// WebGL fallback placement (VIEW-ONLY, v1).
//
// This module is pure: it derives character placements for the
// simpler WebGL fallback scene from a real Muse feed snapshot.
// It invents nothing — every agent, task and status comes from
// the feed, and the embodied-state priority is the same as the
// WebGPU path (see src/muse/museEmbodied.ts):
//   blocked -> boardroom, 'Listen' pose
//   working -> a sit_work desk, 'Sit_Work' pose
//   idle    -> a spawn POI, 'Idle' pose
// (done / pending agents fall through to idle, exactly as there.)
//
// POI coordinates below were measured from the node translations
// in public/models/office.glb (the same file the WebGPU scene
// loads; this file does not copy or modify that model). The
// office holds only 5 spawn POIs and 5 sit_work desks, while the
// feed can hold more agents, so placements past the POI count
// get a small ring offset around their base POI instead of
// stacking exactly on top of another character. Boardroom
// placements ring around the single boardroom area POI.
// No NavMesh, no walking, no gathering in the fallback v1 —
// characters are placed directly at their derived position.

import type { MuseAgent, MuseFeed } from '../../muse/museTypes';

export type WebGLFallbackState = 'working' | 'blocked' | 'idle';

export interface WebGLPlacement {
  agentId: string;
  name: string;
  state: WebGLFallbackState;
  // Baked clip name in public/models/character.glb.
  clip: 'Sit_Work' | 'Listen' | 'Idle';
  position: { x: number; y: number; z: number };
}

// Measured from office.glb node translations (metres, office-local).
const SPAWN_POIS = [
  { x: -3.142, y: 0, z: 4.466 },
  { x: -3.568, y: 0, z: -1.294 },
  { x: 4.062, y: 0, z: 3.35 },
  { x: 2.575, y: 0, z: 3.946 },
  { x: 3.769, y: 0, z: -0.072 },
];

const DESK_POIS = [
  { x: -4.135, y: 0, z: 4.49 },
  { x: 1.579, y: 0, z: -3.671 },
  { x: 3.351, y: 0, z: -3.671 },
  { x: 3.092, y: 0, z: -1.27 },
  { x: 1.1, y: 0, z: -1.235 },
];

const BOARDROOM_POI = { x: 1.269, y: 0, z: 3.54 };

// Small ring offsets for agents past the POI count, so no two
// characters share exactly the same spot. Index 0 = the POI itself.
function ringOffset(n: number): { x: number; z: number } {
  if (n === 0) return { x: 0, z: 0 };
  const angle = (n / 8) * Math.PI * 2;
  const radius = 0.55 + Math.floor(n / 8) * 0.45;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

export function deriveWebGLPlacements(feed: MuseFeed): WebGLPlacement[] {
  const placements: WebGLPlacement[] = [];
  let spawnCount = 0;
  let deskCount = 0;
  let boardroomCount = 0;
  for (const agent of feed.agents as MuseAgent[]) {
    const tasks = feed.tasks.filter((t) => t.agentId === agent.id);
    let state: WebGLFallbackState = 'idle';
    if (tasks.some((t) => t.status === 'blocked') || agent.status === 'blocked') {
      state = 'blocked';
    } else if (tasks.some((t) => t.status === 'running') || agent.status === 'running') {
      state = 'working';
    }
    let base: { x: number; y: number; z: number };
    let offset: { x: number; z: number };
    if (state === 'blocked') {
      base = BOARDROOM_POI;
      offset = ringOffset(boardroomCount);
      boardroomCount += 1;
    } else if (state === 'working') {
      base = DESK_POIS[deskCount % DESK_POIS.length];
      offset = ringOffset(Math.floor(deskCount / DESK_POIS.length));
      deskCount += 1;
    } else {
      base = SPAWN_POIS[spawnCount % SPAWN_POIS.length];
      offset = ringOffset(Math.floor(spawnCount / SPAWN_POIS.length));
      spawnCount += 1;
    }
    placements.push({
      agentId: agent.id,
      name: agent.name,
      state,
      clip: state === 'working' ? 'Sit_Work' : state === 'blocked' ? 'Listen' : 'Idle',
      position: { x: base.x + offset.x, y: base.y, z: base.z + offset.z },
    });
  }
  return placements;
}

// One disc colour per character index, so agents that share the
// same character model are still distinguishable at a glance in
// the fallback scene (the fallback does not recolour the model).
export const WEBGL_AGENT_PALETTE = [
  '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#a855f7',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ef4444',
  '#eab308', '#06b6d4', '#d946ef', '#65a30d', '#f43f5e',
  '#0ea5e9', '#a3e635', '#fb923c', '#c084fc', '#34d399',
];
