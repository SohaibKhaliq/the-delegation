// Muse-data adapter store (VIEW-ONLY).
//
// FAST feed load order (the Coolify deploy is no longer on the critical
// path for feed freshness — it still matters for code changes, not for
// feed data):
//   1. FIRST: the fresh feed file straight from GitHub, with a
//      cache-busting timestamp query and fetch cache: 'no-store':
//        https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json
//      It is accepted ONLY if it is a valid v1 feed whose `source` is
//      'live'. A seed file from GitHub is never accepted here as live;
//      in that case the store falls through to the next sources below,
//      so seed data can never be mislabelled as live.
//   2. Otherwise GET /api/muse-state — served by server.js from the
//      deployed dist/muse-data.json. Accepted only if `source` is 'live'.
//   3. Otherwise GET /muse-data.json — the bundled file copied into
//      dist/ at build time. It is shown as 'seed' unless its own
//      `source` is 'live', in which case it is shown as 'live'.
//   4. Otherwise `unavailable` (empty lists, banner explains the state).
//
// This store never POSTs, never starts an agent, and never calls an LLM.
// Polling (10s) only re-reads the feed; it is a display refresh, not a
// command channel. The dashboard has no write path to Muse by design.
// The feed file itself is public metadata only (this is a public repo),
// so reading it directly from GitHub needs no key and no secret.
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

const RAW_FEED_URL =
  'https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json';

async function tryFetch(url: string, noStore = false): Promise<MuseFeed | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      ...(noStore ? { cache: 'no-store' as RequestCache } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MuseFeed>;
    if (!data || data.version !== 1 || !Array.isArray(data.workspaces) || !Array.isArray(data.agents)) return null;
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
    // 1. Fresh GitHub file first, cache-busted. Live only — a seed
    //    file here falls through instead of being shown as live.
    const raw = await tryFetch(`${RAW_FEED_URL}?t=${Date.now()}`, true);
    if (raw && raw.source === 'live') {
      set({ feed: raw, source: 'live', lastUpdated: new Date().toISOString(), loading: false });
      return;
    }
    // 2. Deployed server feed. Live only.
    const live = await tryFetch('/api/muse-state');
    if (live && live.source === 'live') {
      set({ feed: live, source: 'live', lastUpdated: new Date().toISOString(), loading: false });
      return;
    }
    // 3. Bundled file. Label it from its own source, never upgrade seed to live.
    const bundled = await tryFetch('/muse-data.json');
    if (bundled) {
      set({
        feed: bundled,
        source: bundled.source === 'live' ? 'live' : 'seed',
        lastUpdated: new Date().toISOString(),
        loading: false,
      });
      return;
    }
    set({ feed: EMPTY_FEED, source: 'unavailable', loading: false });
  },
}));

export function startMusePolling(intervalMs = 10000): () => void {
  const id = window.setInterval(() => {
    void useMuseStore.getState().loadMuseData();
  }, intervalMs);
  return () => window.clearInterval(id);
}
