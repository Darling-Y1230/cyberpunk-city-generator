// tools/serve.mjs — zero-dependency static server.
//
//   node tools/serve.mjs                    the single-file build at /
//   node tools/serve.mjs --dev              the module sources at /
//   node tools/serve.mjs --dir=_site        any directory, index.html at /
//
// The request handler is exported so tools/pages-check.mjs can serve an assembled
// site on an ephemeral port without duplicating it (and without the two drifting).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DEV = argv.includes('--dev');
const DIR = (argv.find((a) => a.startsWith('--dir=')) || '').split('=').slice(1).join('=');
const PORT = parseInt((argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || '8173', 10);

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/**
 * @param {string} root      directory to serve
 * @param {object} [opts]
 * @param {string} [opts.index='index.html']  file to serve for a directory URL
 * @param {(p:string)=>string} [opts.rewrite] map a request path before lookup
 */
export function createStaticServer(root, opts = {}) {
  const { index = 'index.html', rewrite = (p) => p } = opts;
  const base = path.resolve(root);

  return http.createServer((req, res) => {
    let rel = rewrite(decodeURIComponent(req.url.split('?')[0]));
    if (rel.endsWith('/')) rel += index;

    const file = path.join(base, path.normalize(rel).replace(/^([/\\])+/, ''));
    // Refuse anything that escaped the served directory.
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('403');
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('404 ' + rel);
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
        // Not required — the build has no workers or SharedArrayBuffer — but it
        // keeps the door open if that ever changes.
        'cross-origin-opener-policy': 'same-origin',
        'content-length': data.length,
      });
      res.end(data);
    });
  });
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ CLI ---- */
// Only run when invoked directly, so pages-check.mjs can import the factory.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url))) {
  let server;
  let label;

  if (DIR) {
    const dir = path.resolve(ROOT, DIR);
    if (!fs.existsSync(dir)) { console.error(`directory not found: ${dir}`); process.exit(1); }
    server = createStaticServer(dir, { index: 'index.html' });
    label = 'static directory: ' + DIR;
  } else if (DEV) {
    server = createStaticServer(ROOT, { index: 'index.html' });
    label = 'development (module sources)';
  } else {
    const dist = path.join(ROOT, 'dist', 'cyberpunk-city.html');
    if (!fs.existsSync(dist)) {
      console.error('dist/cyberpunk-city.html not found — run `node tools/build.mjs` first.');
      process.exit(1);
    }
    server = createStaticServer(ROOT, {
      index: 'dist/cyberpunk-city.html',
      // let the obvious URL work as well
      rewrite: (p) => (p === '/cyberpunk-city.html' ? '/dist/cyberpunk-city.html' : p),
    });
    label = 'single-file build';
  }

  server.listen(PORT, '0.0.0.0', () => {
    // Labels stay ASCII: a legacy Windows console on code page 936 turns UTF-8
    // into mojibake, and the URLs are the part that has to survive.
    console.log('');
    console.log('  NEO-KOWLOON  -  ' + label);
    console.log('');
    console.log('  local      http://127.0.0.1:' + PORT + '/');
    for (const a of lanAddresses()) {
      console.log('  LAN        http://' + a + ':' + PORT + '/     <-- share this on the same WiFi');
    }
    console.log('');
    console.log('  Ctrl+C to stop');
    console.log('');
  });
}
