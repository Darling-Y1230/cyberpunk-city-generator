// tools/make-test.mjs — injects a console/error harness into the built file so a
// headless browser run can prove the city actually generates and renders.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'dist', 'cyberpunk-city.html');
const out = path.join(ROOT, 'dist', 'test.html');

const HARNESS = `
<script>
window.__ERR = [];
window.__LOG = [];
window.addEventListener('error', e => { window.__ERR.push('ERROR: ' + (e.message||'') + ' @ ' + (e.filename||'?') + ':' + (e.lineno||0)); });
window.addEventListener('unhandledrejection', e => {
  const r = e.reason; window.__ERR.push('REJECT: ' + (r && (r.stack || r.message) || String(r)));
});
const _ce = console.error;
console.error = function(){ try { window.__ERR.push('CONSOLE: ' + [].map.call(arguments, a => (a && a.stack) ? a.stack : String(a)).join(' ')); } catch(_){} _ce.apply(console, arguments); };
const _cl = console.log;
console.log = function(){ try { window.__LOG.push([].map.call(arguments, a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ').slice(0, 400)); } catch(_){} _cl.apply(console, arguments); };
window.addEventListener('load', () => {
  setTimeout(() => {
    const stat = (window.__CITY && window.__CITY.world) ? {
      seed: window.__CITY.seed,
      name: window.__CITY.cityName,
      size: window.__CITY.cfg.world.mapSize,
      verdict: window.__CITY.world.report.verdict,
      buildings: window.__CITY.world.buildings.list.length,
      npc: window.__CITY.world.crowd.total,
      signs: window.__CITY.world.ads.total,
      sources: window.__CITY.world.lighting.sources,
      timings: window.__CITY.lastTimings,
      drawCalls: window.__CITY.engine.renderer.info.render.calls,
      triangles: window.__CITY.engine.renderer.info.render.triangles,
      sceneChildren: window.__CITY.root.children.length,
      checks: window.__CITY.world.report.checks.map(c => (c.ok ? 'OK  ' : 'FAIL') + ' ' + c.id + ' = ' + c.value + '  [' + c.target + ']'),
    } : {
      FAILED: 'still generating',
      loaderStep: (document.querySelector('.loader-step.active .step-t') || {}).textContent || '?',
      loaderStatus: (document.querySelector('.loader-status') || {}).textContent || '?',
    };
    const d = document.createElement('pre');
    d.id = '__report';
    d.textContent = '###ERRORS###\\n' + (window.__ERR.length ? window.__ERR.join('\\n@@@\\n') : 'NONE')
      + '\\n###STATE###\\n' + JSON.stringify(stat, null, 1)
      + '\\n###LOG###\\n' + window.__LOG.join('\\n');
    document.body.appendChild(d);
  }, 25000);
});
<\/script>
`;

let html = fs.readFileSync(src, 'utf8');
// Inject AFTER <meta charset> — anything before it pushes the encoding
// declaration out of the browser's sniffing window and the UTF-8 CJK strings in
// the bundle get mis-decoded (which looks exactly like a syntax error).
const anchor = '<meta name="viewport"';
if (!html.includes(anchor)) throw new Error('charset anchor not found');
// function-form replacement: a string would let `$` patterns in the harness
// (or the bundle) expand into fragments of the surrounding document
html = html.replace(anchor, () => HARNESS + anchor);
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' (' + (Buffer.byteLength(html) / 1048576).toFixed(2) + ' MB)');
