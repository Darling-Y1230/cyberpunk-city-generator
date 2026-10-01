// tools/fix-encoding.mjs — detect (and repair) GBK-mojibake in source files.
//
//   node tools/fix-encoding.mjs            repair, then verify
//   node tools/fix-encoding.mjs --check    verify only; exit 1 if damaged
//
// A UTF-8 file round-tripped through a CP936/GBK console loses every multi-byte
// character: `—` becomes `鈥?`, `façade` becomes `fa莽ade`, 霓虹 becomes `闇撳彣`.
// The reason this needs its own guard is that it is invisible in a terminal —
// PowerShell decodes the damaged bytes the same wrong way on the way out, so it
// keeps displaying correct Chinese while the file on disk is wrong.
//
// This runs on Node alone, so `npm test` needs no Python.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

// U+9225 ("鈥") is what GBK makes of the first two bytes of an em/en dash; the
// third byte plus the following character were swallowed into a "?".
const REPLACEMENTS = [
  // comparison operators and units, which ate the character after them
  ['\u922e?16', '\u2264 16'],            // <= 16
  ['m\u864f', 'm\u00b2'],                // m2  -> m²
  ['0\u9225?.', '0\u20131.'],            // 0-1.   (en dash)
  ['0\u9225?4.', '0\u201324.'],          // 0-24.  (en dash)

  // accented latin and CJK that survived as the wrong characters
  ['fa\u83bdade', 'fa\u00e7ade'],        // façade

  // em dash before a space; the space itself was consumed
  ['\u9225?', '\u2014 '],

  // whole words that became CJK pairs
  ['\u95c7\u64b9\u6ae3', '\u9713\u8679'],                                // neon -> 霓虹
  ['\u7ecc\u8f70\u8151\u9369\u5ea1\u5c2f', '\u7a7a\u4e2d\u57ce\u533a'],  // -> 空中城区
  ['\u9366\u9881\u7b05\u9369\u5ea1\u5c2f', '\u5730\u4e0b\u57ce\u533a'],  // -> 地下城区
];

const TARGETS = [
  'shaders/common.glsl',
  'shaders/road.glsl',
  'shaders/surface.glsl',
  'tools/make-config-doc.mjs',
  'tools/geom-test.mjs',
  'src/gen/vertical.js',
];

// The underground programme table, which the HUD is meant to display. Replaced
// as a whole block located by structure — line numbers drift, and the damage
// left some lines with no marker character left to key off.
const PROGRAM_BLOCK = `  const PROGRAM = [
    { id: 'market', label: '黑市 BLACK MARKET', w: [26, 54], d: [24, 46], h: 7.5, neon: 1.6 },
    { id: 'lab', label: '非法实验室 CLANDESTINE LAB', w: [16, 30], d: [16, 28], h: 5.0, neon: 0.9 },
    { id: 'data', label: '数据交易中心 DATA BOURSE', w: [18, 34], d: [18, 30], h: 5.5, neon: 1.2 },
    { id: 'bar', label: '地下酒吧 UNDERGROUND BAR', w: [14, 26], d: [14, 24], h: 4.6, neon: 1.9 },
    { id: 'clinic', label: '义体诊所 RIPPERDOC', w: [12, 22], d: [12, 20], h: 4.4, neon: 1.1 },
    { id: 'shrine', label: '神龛 SHRINE', w: [8, 14], d: [8, 14], h: 5.0, neon: 0.8 },
    { id: 'farm', label: '垂直农场 VERTICAL FARM', w: [20, 40], d: [18, 34], h: 8.0, neon: 0.6 },
  ];`;

// Files that legitimately contain examples of the damaged characters, because
// they exist to document or repair them.
const ALLOWLIST = new Set(['CONTRIBUTING.md', 'tools/fix-encoding.mjs']);

// Corrupted CJK is genuinely hard to detect in general — 地下城区 and 鍦颁笅鍩庡尯
// are both valid Chinese, and telling them apart needs a dictionary. So the
// sweep keys off the specific sequences this repository is known to have
// produced. That is a targeted guard for the actual regression, not a general
// mojibake detector, and it is honest about that.
const KNOWN_BAD_CJK = [
  '\u95c7\u64b9\u6ae3',                                   // was 霓虹
  '\u7ecc\u8f70\u8151\u9369\u5ea1\u5c2f',                 // was 空中城区
  '\u9366\u9881\u7b05\u9369\u5ea1\u5c2f',                 // was 地下城区
  '\u699b\u621d\u7af6', '\u95c8\u70b4\u7876\u7039\u70ba\u7359\u7039',
  '\u93c1\u7248\u5d41\u6d5c', '\u9366\u9881\u7b05\u95b0\u6391\u60c2',
  '\u6d94\u5909\u7d8b\u7487\u5a43\u588d', '\u7ec1\u70ba\u7df5',
  '\u9368\u509c\u6d3f\u9350\u6ec3\u6e80',
];

const EXTS = ['.js', '.mjs', '.json', '.md', '.glsl', '.html', '.yml', '.py', '.txt'];

let applied = 0;
for (const rel of TARGETS) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('  missing:', rel); continue; }
  const before = fs.readFileSync(p, 'utf8');
  let text = before;

  for (const [bad, good] of REPLACEMENTS) {
    if (text.includes(bad)) {
      applied += text.split(bad).length - 1;
      if (!CHECK_ONLY) text = text.split(bad).join(good);
    }
  }

  if (rel.endsWith('vertical.js') && !CHECK_ONLY) {
    const start = text.indexOf('  const PROGRAM = [');
    const end = text.indexOf('\n  ];', start);
    if (start >= 0 && end > start) {
      const block = text.slice(start, end + '\n  ];'.length);
      if (block !== PROGRAM_BLOCK) {
        text = text.slice(0, start) + PROGRAM_BLOCK + text.slice(end + '\n  ];'.length);
        applied++;
      }
    }
  }

  if (text !== before) {
    fs.writeFileSync(p, text);
    console.log(`  repaired ${rel}`);
  } else {
    console.log(`  unchanged ${rel}`);
  }
}
console.log(`\n  ${applied} replacement(s) ${CHECK_ONLY ? 'found' : 'applied'}`);

/* ---- verification: sweep every text file, not just the known ones ---------- */
// Checking only the files above would miss damage in a newly added file, which
// is exactly how this went unnoticed the first time. Walking the tree rather
// than asking git also means this works on a downloaded zip with no .git, and
// avoids capturing a child process's output through a pipe.
const SKIP_DIRS = new Set([
  '.git', 'vendor', '.deps', 'node_modules', '__pycache__', '.edge-profile', 'shots',
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

console.log('\n  verifying (every text file in the tree):');
let problems = 0;
let scanned = 0;
for (const p of walk(ROOT)) {
  const rel = path.relative(ROOT, p).split(path.sep).join('/');
  if (!EXTS.some((e) => rel.endsWith(e))) continue;
  if (ALLOWLIST.has(rel)) continue;
  scanned++;
  const raw = fs.readFileSync(p);
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    console.log(`    ${rel}: UTF-8 BOM present`);
    problems++;
  }
  const t = raw.toString('utf8');
  const hits = [];
  for (let i = 0; i < t.length; i++) {
    const c = t.codePointAt(i);
    if (c === 0x9225 || c === 0xFFFD || (c >= 0xE000 && c <= 0xF8FF)) hits.push(i);
  }
  const knownBad = KNOWN_BAD_CJK.filter((s) => t.includes(s));
  if (hits.length || knownBad.length) {
    const line = hits.length ? t.slice(0, hits[0]).split('\n').length : 0;
    const what = [
      hits.length ? `${hits.length} suspicious character(s)${line ? `, first at line ${line}` : ''}` : '',
      knownBad.length ? `${knownBad.length} known-corrupt sequence(s)` : '',
    ].filter(Boolean).join('; ');
    console.log(`    ${rel}: ${what}`);
    problems += hits.length + knownBad.length;
  }
}
if (!problems) console.log(`    clean (${scanned} files scanned)`);

if (problems) {
  console.log('\n  Run `node tools/fix-encoding.mjs` to repair, then rebuild.');
  process.exit(1);
}
