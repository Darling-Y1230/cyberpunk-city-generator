// tools/strip-bom.mjs — remove a UTF-8 BOM from every text file in the project.
// Several editors/tools on Windows add one, and inside a GLSL file the three
// bytes become an illegal first character, which breaks every shader.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'vendor', '.deps', '.edge-profile', 'shots', '.git']);
const EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.glsl', '.html', '.md', '.css', '.txt', '.ps1']);

let fixed = 0, scanned = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXT.has(path.extname(e.name))) continue;
    scanned++;
    const buf = fs.readFileSync(p);
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      fs.writeFileSync(p, buf.subarray(3));
      fixed++;
      console.log('stripped BOM: ' + path.relative(ROOT, p));
    }
  }
}
walk(ROOT);
console.log(`strip-bom: scanned ${scanned}, fixed ${fixed}`);
