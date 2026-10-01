// tools/bundle-node-test.mjs — bundles a Node-side test (which imports three.js
// and the generator modules) and runs it. The browser tests live in verify.mjs;
// these two run the pure-computation parts — geometry and zoning — in a second,
// with no browser involved.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ESBUILD = path.join(ROOT, 'vendor', 'esbuild', 'package', 'esbuild.exe');
const THREE = path.join(ROOT, 'vendor', 'three', 'package', 'build', 'three.module.js');

const entry = process.argv[2];
if (!entry) { console.error('usage: node tools/bundle-node-test.mjs <entry.mjs> [args...]'); process.exit(1); }
const rest = process.argv.slice(3);

if (!fs.existsSync(ESBUILD)) {
  console.error('esbuild not found — run `node tools/fetch-deps.mjs` first.');
  process.exit(1);
}
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-assets.mjs')], { cwd: ROOT, stdio: 'inherit' });

const out = path.join(ROOT, 'dist', '_' + path.basename(entry, '.mjs') + '.mjs');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
execFileSync(ESBUILD, [
  path.join(ROOT, entry),
  '--bundle', '--format=esm', '--platform=node', '--target=node20',
  '--alias:three=' + THREE,
  '--outfile=' + out,
], { cwd: ROOT, stdio: 'inherit' });

execFileSync(process.execPath, [out, ...rest], { cwd: ROOT, stdio: 'inherit' });
fs.rmSync(out, { force: true });
