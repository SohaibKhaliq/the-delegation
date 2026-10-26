// Muse-data adapter store (VIEW-ONLY).
//
// Load order, deliberately simple so a later live bridge needs no UI rewrite:
//   1. GET /api/muse-state — served by server.js when a Muse event bridge
//      feed is present. A feed whose `source` is 'live' wins.
//   2. Otherwise GET /muse-data.json — the bundled seed/sample file.
//   3. Otherwise `unavailable` (empty lists, banner explains the state).
//
// This store never POSTs, never starts an agent, and never calls an LLM.
// Polling (30s) only re-reads the feed; it is a display refresh, not a
// command channel. The dashboard has no write path to Muse by design.
import { create } from 'zustand';
import type { MuseFeed, MuseFeedSource } from './museTypes';

const EMPTY_FEED: MuseFeed = {
  version: 1,
  source: 'seed',
  workspaces: [],
  agents: [],
  tasks: [],
  events: [],
};

async function tryFetch(url: string): Promise<MuseFeed | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MuseFeed>;
    if (!data || !Array.isArray(data.workspaces) || !Array.isArray(data.agents)) return null;
    return {
      ...EMPTY_FEED,
      ...data,
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      events: Array.isArray(data.events) ? data.events : [],
    };
  } catch {
    return null;
  }
}

interface MuseStoreState {
  feed: MuseFeed;
  source: MuseFeedSource;
  lastUpdated: string | null;
  loading: boolean;
  loadMuseData: () => Promise<void>;
}

export const useMuseStore = create<MuseStoreState>()((set, get) => ({
  feed: EMPTY_FEED,
  source: 'unavailable',
  lastUpdated: null,
  loading: false,

  loadMuseData: async () => {
    if (get().loading) return;
    set({ loading: true });
    // Live endpoint first; seed file as the documented fallback.
    const live = await tryFetch('/api/muse-state');
    if (live && live.source === 'live') {
      set({ feed: live, source: 'live', lastUpdated: new Date().toISOString(), loading: false });
      return;
    }
    const seed = await tryFetch('/muse-data.json');
    if (seed) {
      set({ feed: seed, source: 'seed', lastUpdated: new Date().toISOString(), loading: false });
      return;
    }
    set({ feed: EMPTY_FEED, source: 'unavailable', loading: false });
  },
}));

export function startMusePolling(intervalMs = 30000): () => void {
  const id = window.setInterval(() => {
    void useMuseStore.getState().loadMuseData();
  }, intervalMs);
  return () => window.clearInterval(id);
}
