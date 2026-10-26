// Minimal server for the Coolify deployment of The Delegation.
// Serves the Vite build output in ./dist on PORT (default 3000) and
// answers GET /health for the container healthcheck, plus the view-only
// Muse feed (see src/muse/). No Gemini key handling anywhere: this fork
// is view-only, Gemini was removed, and no key is ever requested,
// stored, or sent by the dashboard itself.
//
// WEBSOCKET NEAR-REALTIME (branch websocket-realtime):
//   GET  /api/muse-state  — current live feed (in-memory, see below).
//   POST /api/muse-events — publish ONE milestone event. Auth: Bearer
//     token from env MUSE_EVENT_TOKEN, compared in constant time.
//     If MUSE_EVENT_TOKEN is NOT set, ALL posts are rejected (403) —
//     unauthenticated posts are never accepted. No token is invented,
//     generated, or hardcoded here; setting it is an owner/parent step
//     (see README "WebSocket realtime" section). Only metadata is
//     accepted: ids, names, statuses, file paths, short reports (<=500
//     chars). Anything that looks like a secret is rejected.
//   WS   /ws               — WebSocket broadcast. On connect the server
//     sends {type:'state', feed}. On each accepted POST it broadcasts
//     {type:'event', event, feed} to all connected clients within
//     milliseconds. The dashboard also keeps its 10s GitHub-raw polling
//     as a fallback, so a WebSocket failure never breaks the feed.
// View-only by design: no commands, no agent start, no LLM calls.
// Milestone events only — this is NOT a live terminal/thinking stream:
// Muse does not expose such a stream, and this server never pretends
// otherwise.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const EVENT_TYPES = new Set(['started', 'milestone', 'file_changed', 'commit', 'done', 'blocked']);
const STATUSES = new Set(['idle', 'running', 'done', 'blocked', 'pending']);
const MAX_EVENTS = 200;
const MAX_REPORT_LEN = 500;
const SECRET_ASSIGN_RE = /(api[_-]?key|token|password|passwd|secret|session|bearer|private[_-]?key)\s*[:=]\s*\S+/i;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{40,}\b/;

// In-memory live state, seeded from dist/muse-data.json at boot so
// GET /api/muse-state works exactly as before until the first POST.
let liveFeed = null;
try {
  const seedPath = path.join(distDir, 'muse-data.json');
  if (fs.existsSync(seedPath)) liveFeed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
} catch {
  liveFeed = null;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function looksLikeSecret(text) {
  return typeof text === 'string' && (SECRET_ASSIGN_RE.test(text) || LONG_TOKEN_RE.test(text));
}

function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return 'event must be an object';
  if (!EVENT_TYPES.has(ev.type)) return 'event.type is not a valid Muse event type';
  if (!ev.workspaceId || typeof ev.workspaceId !== 'string') return 'event.workspaceId is required';
  if (ev.report !== undefined && (typeof ev.report !== 'string' || ev.report.length > MAX_REPORT_LEN)) {
    return 'event.report must be a string of at most 500 characters';
  }
  if (ev.report && looksLikeSecret(ev.report)) return 'event.report looks like a secret; metadata only';
  if (Array.isArray(ev.filesChanged)) {
    for (const f of ev.filesChanged) {
      if (typeof f !== 'string' || f.startsWith('/') || f.includes('..') || looksLikeSecret(f)) {
        return 'event.filesChanged must be relative paths, metadata only';
      }
    }
  }
  return null;
}

function applyEvent(ev, agentStatus, taskStatus) {
  if (!liveFeed || liveFeed.version !== 1 || !Array.isArray(liveFeed.events)) {
    liveFeed = {
      version: 1, source: 'live', sourceLabel: 'LIVE — real Muse event feed (WebSocket).',
      generatedAt: new Date().toISOString(),
      workspaces: [], agents: [], tasks: [], events: [],
    };
  }
  const event = {
    id: ev.id || `evt-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: ev.timestamp || new Date().toISOString(),
    type: ev.type,
    workspaceId: ev.workspaceId,
    agentId: ev.agentId ?? null,
    taskId: ev.taskId ?? null,
    report: ev.report ?? '',
    filesChanged: Array.isArray(ev.filesChanged) ? ev.filesChanged : [],
  };
  liveFeed.events.push(event);
  liveFeed.events = liveFeed.events.slice(-MAX_EVENTS);
  if (agentStatus && STATUSES.has(agentStatus) && event.agentId) {
    const agent = liveFeed.agents.find((a) => a.id === event.agentId);
    if (agent) { agent.status = agentStatus; if (event.report) agent.lastReport = event.report; }
  }
  if (taskStatus && STATUSES.has(taskStatus) && event.taskId) {
    const task = liveFeed.tasks.find((t) => t.id === event.taskId);
    if (task) { task.status = taskStatus; if (event.report) task.report = event.report; }
  }
  liveFeed.source = 'live';
  liveFeed.sourceLabel = 'LIVE — real Muse event feed, updated via WebSocket. View-only: control stays in Muse chat.';
  liveFeed.generatedAt = new Date().toISOString();
  return event;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/api/muse-state') {
    if (liveFeed) {
      sendJson(res, 200, liveFeed);
    } else {
      const feedPath = path.join(distDir, 'muse-data.json');
      if (fs.existsSync(feedPath)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        fs.createReadStream(feedPath).pipe(res);
      } else {
        sendJson(res, 404, { error: 'muse feed not found' });
      }
    }
    return;
  }
  if (url.pathname === '/api/muse-events') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed, POST only' });
      return;
    }
    const expected = process.env.MUSE_EVENT_TOKEN;
    if (!expected) {
      sendJson(res, 403, { error: 'MUSE_EVENT_TOKEN is not configured; posts are rejected' });
      return;
    }
    const auth = req.headers.authorization || '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const ok = supplied.length > 0 && supplied.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!ok) {
      sendJson(res, 401, { error: 'invalid or missing Bearer token' });
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch { sendJson(res, 400, { error: 'invalid JSON body' }); return; }
      const ev = payload.event || payload;
      const err = validateEvent(ev);
      if (err) { sendJson(res, 400, { error: err }); return; }
      const event = applyEvent(ev, payload.agentStatus, payload.taskStatus);
      const msg = JSON.stringify({ type: 'event', event, feed: liveFeed });
      for (const client of wss.clients) {
        if (client.readyState === 1) { try { client.send(msg); } catch { /* ignore dead client */ } }
      }
      sendJson(res, 200, { ok: true, event });
    });
    return;
  }
  let urlPath = decodeURIComponent(url.pathname);
  let filePath = path.normalize(path.join(distDir, urlPath));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
    if (liveFeed) {
      try { ws.send(JSON.stringify({ type: 'state', feed: liveFeed })); } catch { /* ignore */ }
    }
  });
});

server.listen(port, () => {
  console.log(`The Delegation static server listening on port ${port}`);
  console.log(`WebSocket realtime: /ws, POST /api/muse-events (token ${process.env.MUSE_EVENT_TOKEN ? 'configured' : 'NOT configured — posts rejected'})`);
});
