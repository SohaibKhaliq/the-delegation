// WebSocket realtime client (VIEW-ONLY).
//
// Connects to the same origin's /ws endpoint (wss: on https, ws: on http).
// On connect the server sends {type:'state', feed}; on each accepted
// POST /api/muse-events it broadcasts {type:'event', event, feed} within
// milliseconds, and this client applies that feed to the muse store via
// applyLiveFeed() — no polling wait, no command sent back, no key used.
//
// FALLBACK BY DESIGN: if the socket fails, closes, or the server has no
// /ws, nothing breaks — the existing 10s GitHub-raw polling in
// museStore.ts keeps refreshing the feed. The socket only accelerates
// updates; it is never the sole feed source. Reconnect is attempted
// with backoff (5s, capped at 30s) in the background.
import { useMuseStore } from './museStore';
import type { MuseFeed } from './museTypes';

function isValidFeed(data: unknown): data is MuseFeed {
  if (!data || typeof data !== 'object') return false;
  const f = data as Partial<MuseFeed>;
  return f.version === 1 && Array.isArray(f.workspaces) && Array.isArray(f.agents);
}

export function connectMuseSocket(): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {};
  let socket: WebSocket | null = null;
  let closed = false;
  let retryMs = 5000;

  const connect = () => {
    if (closed) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      socket = new WebSocket(`${proto}//${window.location.host}/ws`);
    } catch {
      scheduleRetry();
      return;
    }
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type?: string; feed?: unknown };
        if ((msg.type === 'state' || msg.type === 'event') && isValidFeed(msg.feed)) {
          useMuseStore.getState().applyLiveFeed(msg.feed);
          retryMs = 5000;
        }
      } catch {
        // Ignore malformed socket messages; polling remains the fallback.
      }
    };
    socket.onclose = () => { if (!closed) scheduleRetry(); };
    socket.onerror = () => { try { socket?.close(); } catch { /* ignore */ } };
  };

  const scheduleRetry = () => {
    if (closed) return;
    const delay = retryMs;
    retryMs = Math.min(retryMs * 2, 30000);
    window.setTimeout(connect, delay);
  };

  connect();
  return () => {
    closed = true;
    try { socket?.close(); } catch { /* ignore */ }
  };
}
