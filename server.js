// Minimal static server for the Coolify deployment of The Delegation.
// Serves the Vite build output in ./dist on PORT (default 3000) and
// answers GET /health for the container healthcheck, plus GET
// /api/muse-state for the view-only Muse feed (see src/muse/). No
// dependencies, no Gemini key handling anywhere: this fork is view-only,
// Gemini was removed, and no key is ever requested, stored, or sent.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  // VIEW-ONLY Muse feed hook: GET /api/muse-state serves the built
  // dist/muse-data.json (copied from public/ at build time). A later Muse
  // event bridge can replace that file's contents with a live feed whose
  // `source` is 'live'; the UI then switches from seed to live with no
  // UI rewrite. If the file is absent, 404 so the UI falls back to
  // /muse-data.json (same content when served) or to 'unavailable'.
  // This endpoint is read-only: no POST, no commands, no keys.
  if (req.url === '/api/muse-state') {
    const feedPath = path.join(distDir, 'muse-data.json');
    if (fs.existsSync(feedPath)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      fs.createReadStream(feedPath).pipe(res);
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'muse feed not found' }));
    }
    return;
  }
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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

server.listen(port, () => {
  console.log(`The Delegation static server listening on port ${port}`);
});
