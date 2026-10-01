// tools/validate-workflows.mjs — parse and structurally check the GitHub
// Actions workflows.
//
// A broken workflow fails silently: the Pages demo simply never deploys and
// nothing tells you. So the YAML is parsed for real (the `yaml` package is
// fetched on demand into .deps/, which is already gitignored — consistent with
// how this project gets every other dependency) and the result is checked
// against the expectations of the actions actually used.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DEPS = path.join(ROOT, '.deps');
const WF = path.join(ROOT, '.github', 'workflows');
const YAML_VERSION = '2.4.5';

async function ensureYaml() {
  const mod = path.join(DEPS, 'yaml-pkg', 'package', 'dist', 'index.js');
  if (!fs.existsSync(mod)) {
    const tgz = path.join(DEPS, `yaml-${YAML_VERSION}.tgz`);
    if (!fs.existsSync(tgz)) {
      process.stdout.write(`  fetching yaml@${YAML_VERSION} (validation only) ... `);
      const res = await fetch(`https://registry.npmjs.org/yaml/-/yaml-${YAML_VERSION}.tgz`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fs.mkdirSync(DEPS, { recursive: true });
      fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
      console.log('ok');
    }
    const dest = path.join(DEPS, 'yaml-pkg');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', dest], { stdio: 'inherit' });
  }
  return (await import(url.pathToFileURL(mod).href)).default;
}

const YAML = await ensureYaml();

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const files = fs.readdirSync(WF).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
if (!files.length) fail('.github/workflows contains no workflow files');

for (const f of files) {
  const src = fs.readFileSync(path.join(WF, f), 'utf8');
  let doc;
  try {
    doc = YAML.parse(src, { uniqueKeys: true });
  } catch (e) {
    fail(`${f}: YAML parse error — ${e.message}`);
    continue;
  }
  notes.push(`${f}: parsed, ${Object.keys(doc.jobs || {}).length} job(s)`);

  // tabs are illegal in YAML but some editors insert them
  if (/\t/.test(src)) fail(`${f}: contains a literal tab (illegal in YAML)`);

  if (!doc.on) fail(`${f}: missing "on" trigger`);
  if (!doc.jobs || !Object.keys(doc.jobs).length) fail(`${f}: missing "jobs"`);

  const allSteps = [];
  for (const [jobName, job] of Object.entries(doc.jobs || {})) {
    if (!job['runs-on']) fail(`${f}: job "${jobName}" has no runs-on`);
    if (!Array.isArray(job.steps)) { fail(`${f}: job "${jobName}" has no steps`); continue; }
    job.steps.forEach((s, i) => allSteps.push({ job: jobName, i, s }));
    for (const { i, s } of job.steps.map((s, i) => ({ i, s }))) {
      if (!s.uses && !s.run) fail(`${f}: ${jobName}.steps[${i}] has neither uses nor run`);
      if (s.uses && !/^[\w.-]+\/[\w.-]+@v?\d/.test(s.uses)) {
        fail(`${f}: ${jobName}.steps[${i}] uses "${s.uses}" without a pinned major version`);
      }
      if (s.uses && !s.uses.startsWith('actions/') && !s.uses.startsWith('.')) {
        notes.push(`${f}: third-party action ${s.uses} (pin by SHA for stricter supply-chain hygiene)`);
      }
    }
  }

  const uses = allSteps.map((x) => x.s.uses).filter(Boolean);
  const usesIndex = (name) => uses.findIndex((u) => u.startsWith(name));

  // --- Pages-specific ordering rules ---------------------------------------
  if (uses.some((u) => u.startsWith('actions/deploy-pages'))) {
    if (!doc.permissions) fail(`${f}: a Pages deploy needs a top-level "permissions" block`);
    for (const need of ['pages', 'id-token']) {
      if (!doc.permissions || !(need in doc.permissions)) {
        fail(`${f}: permissions.${need} is required for actions/deploy-pages`);
      }
    }
    const cfg = usesIndex('actions/configure-pages');
    const up = usesIndex('actions/upload-pages-artifact');
    const dep = usesIndex('actions/deploy-pages');
    if (cfg < 0) fail(`${f}: actions/deploy-pages requires actions/configure-pages`);
    if (up < 0) fail(`${f}: actions/deploy-pages requires actions/upload-pages-artifact`);
    if (cfg >= 0 && up >= 0 && cfg > up) fail(`${f}: configure-pages must come before upload-pages-artifact`);
    if (up >= 0 && dep >= 0 && up > dep) fail(`${f}: upload-pages-artifact must come before deploy-pages`);
    const deployJob = Object.entries(doc.jobs).find(([, j]) =>
      (j.steps || []).some((s) => (s.uses || '').startsWith('actions/deploy-pages')));
    if (deployJob && !deployJob[1].environment) {
      fail(`${f}: the deploy job needs an "environment" so the Pages URL is reported`);
    }
    if (deployJob && !deployJob[1].needs) {
      notes.push(`${f}: deploy job has no "needs" — it may run before the build`);
    }
  }

  // --- everything this project's CI depends on -----------------------------
  for (const step of allSteps) {
    const cmd = step.s.run;
    if (typeof cmd !== 'string') continue;
    for (const m of cmd.matchAll(/node\s+(tools\/[\w.-]+\.mjs)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) fail(`${f}: runs missing script ${m[1]}`);
    }
  }
}

// The README and docs reference paths that must exist in a fresh clone.
const refs = new Map();
for (const f of ['README.md', 'CONTRIBUTING.md', 'docs/ARCHITECTURE.md', 'docs/PIPELINE.md']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) refs.set(m[1], f);
  for (const m of src.matchAll(/src="(docs\/img\/[^"]+)"/g)) refs.set(m[1], f);
}
for (const [rel, from] of refs) {
  const target = rel.startsWith('docs/') || rel.startsWith('.')
    ? path.resolve(ROOT, path.dirname(path.join(ROOT, from)), rel)
    : path.resolve(ROOT, path.dirname(path.join(ROOT, from)), rel);
  if (!fs.existsSync(target)) fail(`${from} links to missing file: ${rel}`);
}
notes.push(`docs: ${refs.size} internal link(s)/image(s) checked`);

for (const n of notes) console.log('  ' + n);
if (problems.length) {
  console.error('\n  WORKFLOW/DOC PROBLEMS:');
  for (const p of problems) console.error('    ✖ ' + p);
  process.exit(1);
}
console.log('\n  workflows parse and are structurally valid; all doc links resolve.');
