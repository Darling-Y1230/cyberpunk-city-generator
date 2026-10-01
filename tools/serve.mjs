// tools/serve.mjs — zero-dependency static server for LAN sharing.
//
// `node tools/serve.mjs` then hand the printed http://<lan-ip>:8173 URL to
// anyone on the same network. Serves the single-file build by default; pass
// --dev to serve the module sources instead (needs the vendor/ tree).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DEV = argv.includes('--dev');
const PORT = parseInt(argv.find((a) => a.startsWith('--port='))?.split('=')[1] || '8173', 10);

if (!DEV) {
  // Serve the standalone build as index.html without duplicating the file.
  const dist = path.join(ROOT, 'dist', 'cyberpunk-city.html');
  if (!fs.existsSync(dist)) {
    console.error('dist/cyberpunk-city.html not found — run `node tools/build.mjs` first.');
    process.exit(1);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = DEV ? '/index.html' : '/dist/cyberpunk-city.html';
  // let the obvious URL work in both modes
  if (rel === '/cyberpunk-city.html' && !DEV) rel = '/dist/cyberpunk-city.html';

  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404 ' + rel); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      // Not required — the build has no workers or SharedArrayBuffer — but it
      // keeps the door open if that ever changes.
      'cross-origin-opener-policy': 'same-origin',
    });
    res.end(data);
  });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  // Labels stay ASCII: a legacy Windows console on code page 936 turns UTF-8
  // into mojibake, and the URLs are the part that has to survive.
  const mode = DEV ? 'development (module sources)' : 'single-file build';
  console.log('');
  console.log('  NEO-KOWLOON  -  ' + mode);
  console.log('');
  console.log('  local      http://127.0.0.1:' + PORT + '/');
  for (const a of lanAddresses()) {
    console.log('  LAN        http://' + a + ':' + PORT + '/     <-- share this on the same WiFi');
  }
  console.log('');
  console.log('  Ctrl+C to stop');
  console.log('');
});
