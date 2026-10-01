// tools/pages-check.mjs — prove the GitHub Pages deployment will work, locally.
//
//   node tools/pages-check.mjs
//
// The Pages workflow is only exercised after a push, which is the worst time to
// discover that a referenced file is missing or that the artefact's metadata
// points at a path the site does not serve. This assembles the same _site
// directory, serves it, and fetches every URL the page's own metadata claims.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ARTIFACT = path.join(ROOT, 'dist', 'cyberpunk-city.html');
const SITE = path.join(ROOT, '_site');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'pages.yml');

const USER = process.env.PAGES_USER || 'Darling-Y1230';
const REPO = process.env.PAGES_REPO || 'cyberpunk-city-generator';
const ORIGIN = `https://${USER.toLowerCase()}.github.io/${REPO}`;

const problems = [];
const fail = (m) => problems.push(m);

if (!fs.existsSync(ARTIFACT)) {
  console.error('dist/cyberpunk-city.html not found — run `node tools/build.mjs` first.');
  process.exit(1);
}

/* ---- 0. the workflow must still describe the assembly we are mirroring ----- */
// If pages.yml changes and this does not, the check silently stops testing the
// real thing. Cheap drift guard.
if (fs.existsSync(WORKFLOW)) {
  const wf = fs.readFileSync(WORKFLOW, 'utf8');
  for (const needle of ['cyberpunk-city.html', 'docs/img', '_site']) {
    if (!wf.includes(needle)) fail(`pages.yml no longer mentions "${needle}" — update tools/pages-check.mjs to match`);
  }
} else {
  fail('.github/workflows/pages.yml is missing');
}

/* ---- 1. assemble exactly what the workflow uploads ------------------------- */
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });
fs.copyFileSync(ARTIFACT, path.join(SITE, 'index.html'));
fs.copyFileSync(ARTIFACT, path.join(SITE, 'cyberpunk-city.html'));
const IMG_SRC = path.join(ROOT, 'docs', 'img');
if (!fs.existsSync(IMG_SRC)) {
  fail('docs/img is missing — og:image would 404 and link previews would be blank');
} else {
  fs.cpSync(IMG_SRC, path.join(SITE, 'img'), { recursive: true });
}

const html = fs.readFileSync(ARTIFACT, 'utf8');
console.log(`  assembled _site  (${(fs.statSync(ARTIFACT).size / 1024).toFixed(0)} KB index.html)`);

/* ---- 2. collect every URL the page's metadata references ------------------- */
const meta = {};
for (const [key, re] of Object.entries({
  title: /<title>([^<]*)<\/title>/,
  description: /<meta name="description" content="([^"]*)"/,
  'og:title': /<meta property="og:title" content="([^"]*)"/,
  'og:description': /<meta property="og:description" content="([^"]*)"/,
  'og:image': /<meta property="og:image" content="([^"]*)"/,
  'twitter:card': /<meta name="twitter:card" content="([^"]*)"/,
  favicon: /<link rel="icon" href="([^"]*)"/,
})) {
  const m = html.match(re);
  if (m) meta[key] = m[1];
  else fail(`metadata missing: ${key}`);
}

// Anything the page would actually fetch must live inside the assembly.
for (const [key, value] of Object.entries(meta)) {
  if (!/^(https?:)?\/\//.test(value)) continue;              // relative or data URI
  if (value.startsWith('data:')) continue;
  if (!value.startsWith(ORIGIN)) {
    fail(`${key} points outside the expected Pages origin: ${value}`);
  }
}

/* ---- 3. serve the assembly and fetch what the metadata promises ------------ */
// A GitHub *project* site is served under /<repo>/, not at the domain root.
// Mounting it here is what makes this check faithful: an og:image of
// https://<user>.github.io/<repo>/img/x.png only resolves because the path
// carries the repo prefix. Requests outside the prefix must 404, exactly as
// they would on the real site.
const OUTSIDE = '/__outside_project_site__';
const server = createStaticServer(SITE, {
  index: 'index.html',
  rewrite: (p) => {
    if (p === `/${REPO}`) return '/';
    if (p.startsWith(`/${REPO}/`)) return p.slice(REPO.length + 1) || '/';
    return OUTSIDE + p;
  },
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function get(p) {
  const res = await fetch(base + p);
  const body = await res.arrayBuffer();
  return { status: res.status, type: res.headers.get('content-type') || '', bytes: body.byteLength, text: Buffer.from(body).toString('utf8') };
}

const routes = [
  [`/${REPO}/`, 200, 'text/html'],
  [`/${REPO}/cyberpunk-city.html`, 200, 'text/html'],
];
for (const [p, wantStatus, wantType] of routes) {
  const r = await get(p);
  const ok = r.status === wantStatus && r.type.startsWith(wantType);
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${p} -> ${r.status} ${r.type} ${r.bytes} B`);
  if (!ok) fail(`${p} -> ${r.status} ${r.type}, expected ${wantStatus} ${wantType}`);
}

// The social preview is fetched by GitHub's crawler, not the page, so a broken
// path here shows up only as a blank link preview after sharing.
if (meta['og:image']) {
  const p = new URL(meta['og:image']).pathname;
  const r = await get(p);
  const ok = r.status === 200 && r.type.startsWith('image/');
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${p} -> ${r.status} ${r.type} ${r.bytes} B   (og:image)`);
  if (!ok) fail(`og:image ${p} -> ${r.status} ${r.type}; link previews would be blank`);
  if (ok && r.bytes > 1024 * 1024) fail(`og:image is ${(r.bytes / 1048576).toFixed(1)} MB; GitHub's limit is 1 MB`);
}

// The document itself must survive the copy intact.
const root = await get(`/${REPO}/`);
if (!root.text.startsWith('<!DOCTYPE html>')) fail('/index.html does not start with a doctype');
if (root.text !== html) fail('/index.html differs byte-for-byte from dist/cyberpunk-city.html');
if (meta.title && !root.text.includes(meta.title)) fail('/index.html does not contain its own title');

// A 404 must still 404, so the site cannot silently serve the app for anything.
const missing = await get(`/${REPO}/definitely-not-here.js`);
if (missing.status !== 404) fail(`/${REPO}/definitely-not-here.js -> ${missing.status}, expected 404`);
// And a path outside the project prefix must not reach the app either.
const outside = await get('/img/social-preview.png');
if (outside.status !== 404) fail(`/img/social-preview.png -> ${outside.status}, expected 404 (it lives under /${REPO}/)`);

server.close();

/* ---- 4. report ------------------------------------------------------------- */
console.log('');
if (problems.length) {
  console.log(`  FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.log('    x ' + p);
} else {
  console.log('  PASS — the assembled site serves the app and everything its metadata references.');
  console.log(`  _(served at ${ORIGIN}/ once the workflow runs)_`);
}
// process.exit() straight after awaiting fetch trips a libuv assertion on this
// Node build; setting the code and letting the loop drain does not.
process.exitCode = problems.length ? 1 : 0;
