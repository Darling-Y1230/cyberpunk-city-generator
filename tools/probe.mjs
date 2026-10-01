// tools/probe.mjs — one-shot CDP probe: load the build, wait for the world,
// evaluate an arbitrary expression, print it. For debugging the capture
// harness without a full verification run.
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9444;
const EXPR = process.argv[2] || '1';
const SIZE = process.argv[3] || '1024';
// optional full URL override, e.g. http://127.0.0.1:8173/ to probe an HTTP origin
const OVERRIDE = process.argv[4] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = path.join(os.tmpdir(), 'cpk-probe-' + Date.now());

const child = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up */ }
}
if (!target) { console.error('no target'); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pend.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.result?.exceptionDetails) return 'EXCEPTION: ' + r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '');
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
const file = OVERRIDE || ('file:///' + path.join(ROOT, 'dist', 'cyberpunk-city.html').replace(/\\/g, '/') + '?size=' + SIZE);
await send('Page.navigate', { url: file });

for (let i = 0; i < 200; i++) {
  await sleep(1500);
  const w = await ev(`!!(window.__CITY && window.__CITY.world)`);
  if (w === true) break;
}
await sleep(2500);
console.log(await ev(EXPR));
ws.close(); child.kill();
await sleep(400);
try { fs.rmSync?.(profile, { recursive: true, force: true }); } catch { }
process.exit(0);
