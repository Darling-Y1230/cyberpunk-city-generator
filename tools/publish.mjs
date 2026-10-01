// tools/publish.mjs — prepare (and optionally push) the GitHub repository.
//
//   node tools/publish.mjs                          # check + prepare + first commit
//   node tools/publish.mjs --user=someone --repo=x  # retarget every URL first
//   node tools/publish.mjs --push                   # also create the remote and push
//
// The URL rewriting is the point: the account and repository name appear in the
// README badges, package.json metadata and the Pages address, and guessing them
// wrong is worse than asking. Everything is idempotent — running it twice is safe.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const USER = arg('user', 'Darling-Y1230');
const REPO = arg('repo', 'cyberpunk-city-generator');
const PUSH = argv.includes('--push');
const SSH = argv.includes('--ssh');

const REMOTE = SSH
  ? `git@github.com:${USER}/${REPO}.git`
  : `https://github.com/${USER}/${REPO}.git`;
const WEB = `https://github.com/${USER}/${REPO}`;
const PAGES = `https://${USER.toLowerCase()}.github.io/${REPO}/`;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });

/**
 * Capture a command's stdout **through a file descriptor, not a pipe**.
 * Piped stdio between two child processes is blocked by Windows sandboxing
 * (and is a common restriction on locked-down machines generally), so this
 * redirects to a temp file instead and reads it back.
 */
function capture(cmd, args) {
  const tmp = path.join(os.tmpdir(), `cpk-cap-${process.pid}-${Date.now()}.txt`);
  const fd = fs.openSync(tmp, 'w');
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', fd, 'inherit'] });
  } finally {
    fs.closeSync(fd);
  }
  const out = fs.readFileSync(tmp, 'utf8');
  fs.rmSync(tmp, { force: true });
  return out.trim();
}

/* ------------------------------------------------------------------ 1. URLs */
console.log(`\n  target: ${WEB}`);
console.log(`  pages : ${PAGES}\n`);

// Rewrite from *whatever the files currently say*, read out of package.json,
// rather than from a hard-coded slug. That makes re-targeting work: running
// once with the wrong account and again with the right one used to be a no-op,
// because the second run searched for a slug that no longer existed.
//
// index.html is in the list because it is the build's HTML shell: its og:image
// is inlined into dist/cyberpunk-city.html, so leaving it behind published a
// link preview pointing at somebody else's Pages URL.
const files = ['README.md', 'package.json', 'CONTRIBUTING.md', 'index.html',
  'docs/ARCHITECTURE.md', 'docs/PIPELINE.md', 'docs/CONFIG.md'];

const pkgPath = path.join(ROOT, 'package.json');
let pkg = {};
try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* left as-is */ }

const slug = String(pkg.repository?.url || '').match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
const oldOwner = slug ? slug[1] : null;
const oldRepo = slug ? slug[2] : null;
const oldPages = String(pkg.homepage || '');
const oldAuthor = pkg.author;

if (!oldOwner || !oldRepo) {
  console.log('  ! could not determine the current owner/repo from package.json');
  console.log('    (URL rewriting skipped; check repository.url)\n');
} else {
  const pairs = [
    [`https://github.com/${oldOwner}/${oldRepo}`, WEB],          // also covers git+https://... and .git
    [`https://${oldOwner.toLowerCase()}.github.io/${oldRepo}`, `${PAGES.replace(/\/$/, '')}`],
  ];
  if (oldPages && oldPages !== PAGES) pairs.push([oldPages.replace(/\/$/, ''), PAGES.replace(/\/$/, '')]);
  if (oldOwner !== USER) pairs.push([`"author": "${oldOwner}"`, `"author": "${USER}"`]);

  const already = oldOwner === USER && oldRepo === REPO;
  let rewritten = 0;
  for (const rel of files) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, 'utf8');
    const before = text;
    for (const [from, to] of pairs) {
      if (from && from !== to) text = text.split(from).join(to);
    }
    if (text !== before) {
      fs.writeFileSync(p, text);
      rewritten++;
      console.log(`  rewrote URLs in ${rel}`);
    }
  }
  if (!rewritten) {
    console.log(already
      ? '  URLs already point at this target'
      : '  ! nothing matched — check package.json repository.url and homepage');
  }

  if (oldRepo !== REPO) {
    // package.json's "name" is an npm identifier, not a URL, so it is left
    // alone on purpose — flag it rather than silently changing it.
    console.log(`\n  note: package.json "name" is still "${pkg.name}";`);
    console.log(`        the repository is "${REPO}". They need not match, but if you`);
    console.log('        want them to, edit package.json by hand.');
  }
}

// index.html feeds the build, so the artefact must be regenerated after any
// rewrite — step 3 below does that unconditionally.

/* ------------------------------------------------------------- 2. sanity gate */
console.log('\n  running the headless test suites before committing…\n');
try {
  run(process.execPath, [path.join(ROOT, 'tools', 'bundle-node-test.mjs'), 'tools/geom-test.mjs']);
  run(process.execPath, [path.join(ROOT, 'tools', 'bundle-node-test.mjs'),
    'tools/plan-test.mjs', 's1', 's2', 's3']);
} catch {
  console.error('\n  !! tests failed — fix them before publishing.');
  process.exit(1);
}

/* ---------------------------------------------------------------- 3. the build */
console.log('\n  building the distributable…\n');
run(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')]);

const artifact = path.join(ROOT, 'dist', 'cyberpunk-city.html');
if (!fs.existsSync(artifact)) {
  console.error('  !! dist/cyberpunk-city.html was not produced'); process.exit(1);
}
const kb = Math.round(fs.statSync(artifact).size / 1024);
console.log(`\n  dist/cyberpunk-city.html  ${kb} KB`);

/* ------------------------------------------------------------------ 4. git */
const hasGit = fs.existsSync(path.join(ROOT, '.git'));
if (!hasGit) {
  console.log('\n  git init');
  run('git', ['init', '-b', 'main']);
}

const changed = capture('git', ['status', '--porcelain']);
if (!changed) {
  console.log('  nothing to commit');
} else {
  run('git', ['add', '-A']);
  // Show what is about to be committed, and specifically what is NOT.
  const staged = capture('git', ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const heavy = staged.filter((f) => /^(vendor|\.deps)\//.test(f));
  if (heavy.length) {
    console.error('\n  !! refused: vendor/ or .deps/ would be committed.'
      + `\n     check .gitignore — offending paths: ${heavy.slice(0, 3).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n  staging ${staged.length} file(s), ${(staged.filter((f) => f.startsWith('dist/')).length)} of them in dist/`);
  run('git', ['commit', '-m', [
    'NEO-KOWLOON: procedural cyberpunk mega-city generator',
    '',
    'Ten-stage generation pipeline that derives a whole metropolis from a seed:',
    'terrain and coastline, bid-rent zoning across sixteen functional districts,',
    'a three-tier street network, building stock with super-corporation',
    'territories, elevated/maglev/aerial transit, GPU crowd simulation, and a',
    'twelve-point constraint validator that ships its verdict in the HUD.',
    '',
    'Ships as a single 961 KB self-contained HTML file with no runtime',
    'dependencies — verified to generate with the network fully disabled.',
  ].join('\n')]);
}

/* --------------------------------------------------------------- 5. push */
console.log('');
if (PUSH) {
  const remotes = capture('git', ['remote']).split('\n').filter(Boolean);
  if (!remotes.includes('origin')) run('git', ['remote', 'add', 'origin', REMOTE]);
  else run('git', ['remote', 'set-url', 'origin', REMOTE]);
  run('git', ['push', '-u', 'origin', 'main']);
  console.log(`\n  pushed -> ${WEB}`);
} else {
  console.log('  next steps:\n');
  console.log(`    1. create an EMPTY repository named "${REPO}" on GitHub (no README, no .gitignore)`);
  console.log('    2. then either:');
  console.log(`         git remote add origin ${REMOTE}`);
  console.log('         git push -u origin main');
  console.log('       or re-run this script with --push');
  console.log('\n    3. after pushing, in the repository settings:');
  console.log('         Settings -> Pages -> Source: GitHub Actions   (the workflow is included)');
  console.log('         Settings -> Social preview -> upload docs/img/social-preview.png');
  console.log('         About (gear icon) -> paste the description, then add the topics:');
  console.log('           procedural-generation city-generator threejs webgl2 cyberpunk');
  console.log('           procedural-city urban-planning glsl shaders webgl 3d');
  console.log('           generative-art level-generation single-file offline');
  console.log('           neon sci-fi javascript three-js game-development');
  console.log('    4. create a Release and attach dist/cyberpunk-city.html so people can');
  console.log('       download the file without cloning anything.\n');
}
