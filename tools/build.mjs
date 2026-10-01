// tools/build.mjs — produces dist/cyberpunk-city.html, one self-contained file.
//
// three.js, the post-processing addons and every shader are bundled in, so the
// artefact runs from file:// with no server, no CDN and no network at all.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ESBUILD } from './lib/esbuild-path.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const THREE = path.join(ROOT, 'vendor', 'three', 'package', 'build', 'three.module.js');
const THREE_ADDONS = path.join(ROOT, 'vendor', 'three', 'package', 'examples', 'jsm');

const run = (args) => execFileSync(ESBUILD, args, { cwd: ROOT, stdio: 'inherit' });

// 1. regenerate shader + config modules from their sources of truth
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-assets.mjs')], { stdio: 'inherit' });

// 2. bundle
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
run([
  'main.js',
  '--bundle',
  '--format=iife',
  '--target=es2020',
  '--minify',
  '--legal-comments=none',
  '--alias:three=' + THREE,
  '--alias:three/addons=' + THREE_ADDONS,
  '--outfile=' + path.join(ROOT, 'dist', 'bundle.js'),
]);

// 3. inline into the shell, stripping the dev entry block.
//
// NOTE: the replacements MUST use function form. A string replacement makes
// String.replace interpret `$&`, `` $` ``, `$'`, `$$` and `$n` inside the
// bundle as substitution patterns — and minified JavaScript is full of them,
// which silently injects fragments of the shell into the program.
const shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'bundle.js'), 'utf8');
const html = shell
  .replace(/<!--\s*DEV\s*-->[\s\S]*?<!--\s*\/DEV\s*-->/, () => '')
  .replace(
    /<!--\s*BUNDLE\s*-->/,
    () => '<script>\n' + bundle.replace(/<\/script>/gi, () => '<\\/script>') + '\n</script>');

fs.writeFileSync(path.join(ROOT, 'dist', 'cyberpunk-city.html'), html);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`\nbuild: dist/cyberpunk-city.html  (${mb} MB, self-contained)`);
