// tools/fetch-deps.mjs — vendor three.js and esbuild.
//
// The repository deliberately does NOT commit its dependencies (52 MB, and one
// of them is a platform-specific binary). This script reproduces them from the
// npm registry instead, so a fresh clone needs exactly one command:
//
//     node tools/fetch-deps.mjs
//
// It uses Node's global fetch rather than npm on purpose: no package manager,
// no lockfile, no node_modules — and it keeps working on machines where the
// system TLS stack is blocked but Node's is fine.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import { fetchChecked } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.deps');
const VENDOR = path.join(ROOT, 'vendor');

const THREE_VERSION = '0.160.1';
const ESBUILD_VERSION = '0.20.2';
const WIN = process.platform === 'win32';

/** esbuild ships as a per-platform binary package. */
function esbuildPackage() {
  const p = process.platform, a = process.arch;
  if (p === 'win32' && a === 'arm64') return '@esbuild/win32-arm64';
  if (p === 'win32') return '@esbuild/win32-x64';
  if (p === 'darwin' && a === 'arm64') return '@esbuild/darwin-arm64';
  if (p === 'darwin') return '@esbuild/darwin-x64';
  if (p === 'linux' && a === 'arm64') return '@esbuild/linux-arm64';
  if (p === 'linux') return '@esbuild/linux-x64';
  throw new Error(`no prebuilt esbuild for ${p}/${a}`);
}

const ESBUILD_PKG = esbuildPackage();
const ESBUILD_NAME = ESBUILD_PKG.split('/')[1];

const TARGETS = [
  {
    label: `three.js r${THREE_VERSION}`,
    file: `three-${THREE_VERSION}.tgz`,
    url: `https://registry.npmjs.org/three/-/three-${THREE_VERSION}.tgz`,
    dest: path.join(VENDOR, 'three'),
    keep: path.join(VENDOR, 'three', 'package', 'build', 'three.module.js'),
    extra: path.join(VENDOR, 'three', 'package', 'examples', 'jsm'),
  },
  {
    label: `esbuild ${ESBUILD_VERSION} (${ESBUILD_PKG})`,
    file: `${ESBUILD_NAME}-${ESBUILD_VERSION}.tgz`,
    url: `https://registry.npmjs.org/${ESBUILD_PKG}/-/${ESBUILD_NAME}-${ESBUILD_VERSION}.tgz`,
    dest: path.join(VENDOR, 'esbuild'),
    keep: path.join(VENDOR, 'esbuild', 'package', WIN ? 'esbuild.exe' : 'bin/esbuild'),
  },
];

/** `tar` ships with Windows 10+, macOS and every Linux CI image. */
function extract(tgz, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', dest], { stdio: 'inherit' });
}

async function download(t) {
  const out = path.join(CACHE, t.file);
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) return out;
  process.stdout.write(`  downloading ${t.label} ... `);
  const res = await fetchChecked(t.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${t.url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
  return out;
}

console.log('NEO-KOWLOON dependency bootstrap\n');
let fetched = 0;
for (const t of TARGETS) {
  if (fs.existsSync(t.keep)) { console.log(`  ${t.label} — already present`); continue; }
  const tgz = await download(t);
  process.stdout.write(`  extracting ${t.label} ... `);
  extract(tgz, t.dest);
  if (!fs.existsSync(t.keep)) throw new Error(`extraction did not produce ${t.keep}`);
  if (t.extra && !fs.existsSync(t.extra)) throw new Error(`extraction did not produce ${t.extra}`);
  if (!WIN && t.keep.endsWith('esbuild')) fs.chmodSync(t.keep, 0o755);
  console.log('ok');
  fetched++;
}

console.log(`\nready: ${fetched} fetched, ${TARGETS.length - fetched} already present.`);
console.log('next:  node tools/build.mjs    ->  dist/cyberpunk-city.html');
console.log('       node tools/serve.mjs    ->  http://127.0.0.1:8173');
