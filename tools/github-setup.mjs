// tools/github-setup.mjs — configure the repository through the GitHub API.
//
// The parts of "publish it so people can find it" that are pure data entry —
// description, homepage, twenty topics, Pages source — are fast and reliable
// through the API and tedious by hand. The social preview has no API and stays
// manual; this script says so rather than pretending otherwise.
//
//   node tools/github-setup.mjs --dry-run                 # show the requests
//   GH_TOKEN=ghp_... node tools/github-setup.mjs          # apply
//   node tools/github-setup.mjs --token=ghp_... --user=x --repo=y
import path from 'node:path';
import url from 'node:url';
import { fetchChecked, ensureTrustedTlsSync } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const USER = arg('user', 'Darling-Y1230');
const REPO = arg('repo', 'cyberpunk-city-generator');
const TOKEN = arg('token', process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '');
const DRY = argv.includes('--dry-run');

const PAGES = `https://${USER.toLowerCase()}.github.io/${REPO}/`;
const DESCRIPTION = 'Procedural cyberpunk mega-city generator - real urban planning, '
  + 'GPU crowd simulation and neon rendering in one self-contained 961 KB HTML file. '
  + 'No runtime dependencies, works offline.';

// 20 topics: the single highest-leverage discoverability lever on GitHub.
const TOPICS = [
  'procedural-generation', 'city-generator', 'threejs', 'webgl2', 'cyberpunk',
  'procedural-city', 'urban-planning', 'glsl', 'shaders', 'webgl',
  '3d', 'generative-art', 'level-generation', 'single-file', 'offline',
  'neon', 'sci-fi', 'javascript', 'three-js', 'game-development',
];

const api = (method, endpoint, body) => ({
  method,
  url: `https://api.github.com/repos/${USER}/${REPO}${endpoint}`,
  body,
});

const CALLS = [
  api('PATCH', '', { description: DESCRIPTION, homepage: PAGES, has_wiki: false, has_projects: false }),
  api('PUT', '/topics', { names: TOPICS }),
  api('POST', '/pages', { build_type: 'workflow' }),
];

/* --------------------------------------------------------------- dry run */
if (DRY || !TOKEN) {
  if (!DRY) {
    console.log('\n  no token found. Set GH_TOKEN, or pass --token=..., or use --dry-run.');
    console.log('  A classic token with the "repo" scope is enough.\n');
  }
  console.log(`  target: ${USER}/${REPO}\n`);
  for (const c of CALLS) {
    console.log(`  ${c.method} ${c.url.replace(`https://api.github.com/repos/${USER}/${REPO}`, '') || '/'}`);
    if (c.body) console.log(`      ${JSON.stringify(c.body).slice(0, 150)}`);
  }
  console.log('\n  NOT automatable - GitHub has no API for it:');
  console.log('    Settings -> Social preview -> upload docs/img/social-preview.png');
  console.log('    Releases -> Draft a new release -> attach dist/cyberpunk-city.html\n');
} else {
  await main();
}

/* ------------------------------------------------------------------ apply */
async function main() {
  // Must run before any fetch; it may re-exec this script. See tools/lib/net.mjs.
  ensureTrustedTlsSync();

  const headers = {
    authorization: `Bearer ${TOKEN}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'neo-kowloon-publish',
    'x-github-api-version': '2022-11-28',
  };

  async function call(c) {
    let res;
    try {
      res = await fetchChecked(c.url, {
        method: c.method, headers, body: c.body ? JSON.stringify(c.body) : undefined,
      });
    } catch (e) {
      console.error(`\n  x ${c.method} ${c.url}\n    ${e.message}\n`);
      process.exitCode = 1;
      return null;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    return { status: res.status, ok: res.ok, json, text };
  }

  console.log(`\n  configuring ${USER}/${REPO}\n`);

  // Fail fast with a useful message rather than three confusing errors.
  const probe = await call(api('GET', ''));
  if (!probe) return;
  if (!probe.ok) {
    const hint = probe.status === 404
      ? 'repository not found - create it on GitHub first (empty, no README)'
      : probe.status === 401
        ? 'token rejected - check it has not expired and has the "repo" scope'
        : probe.status === 403
          ? 'token lacks permission for this repository'
          : probe.text.slice(0, 200);
    console.error(`  x GET /repos/${USER}/${REPO} -> ${probe.status}: ${hint}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ok repository reachable (${probe.json.private ? 'private' : 'public'})`);

  let failures = 0;
  for (const c of CALLS) {
    const label = `${c.method} ${c.url.replace(`https://api.github.com/repos/${USER}/${REPO}`, '') || '/'}`;
    const r = await call(c);
    if (!r) { failures++; continue; }
    // enabling Pages on an already-enabled site returns 409; that is success for us
    const benign = r.status === 409 && c.url.endsWith('/pages');
    if (r.ok || benign) {
      console.log(`  ok ${label} -> ${r.status}${benign ? ' (already enabled)' : ''}`);
    } else {
      failures++;
      console.error(`  x ${label} -> ${r.status}: ${(r.json && r.json.message) || r.text.slice(0, 160)}`);
    }
  }

  console.log('');
  if (failures) {
    console.error(`  ${failures} call(s) failed - fix the token scope and re-run.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`  done. Pages will publish at ${PAGES} once the workflow runs.\n`);
  console.log('  still manual (no API exists):');
  console.log('    Settings -> Social preview -> upload docs/img/social-preview.png');
  console.log('    Releases -> Draft a new release -> attach dist/cyberpunk-city.html\n');
}
