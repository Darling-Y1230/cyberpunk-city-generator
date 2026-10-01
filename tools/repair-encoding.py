"""
tools/repair-encoding.py — repair GBK-mojibake damage in source file comments.

A UTF-8 file was once round-tripped through a CP936/GBK console, which decoded
every multi-byte character as a GBK pair and re-encoded the result. The damage
is confined to comments and a handful of CJK label strings, but it is visible in
a published repository and, in the case of the underground room labels, in the
running application.

Each replacement below is derived from the known original text, so this is an
exact repair rather than a guess. It is idempotent: running it twice is a no-op.
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# U+9225 ("鈥") is what GBK makes of the first two bytes of an em/en dash.
# The third byte plus the following character were swallowed into a "?".
REPLACEMENTS = [
    # --- comparison operators and units, which ate the character after them
    ("\u922e?16", "\u2264 16"),          # <= 16
    ("m\u864f", "m\u00b2"),              # m2  -> m²
    ("0\u9225?.", "0\u20131."),          # 0-1.   (en dash)
    ("0\u9225?4.", "0\u201324."),        # 0-24.  (en dash)

    # --- accented latin and CJK that survived as wrong characters
    ("fa\u83bdade", "fa\u00e7ade"),      # façade

    # --- em dash before a space; the space itself was consumed
    ("\u9225?", "\u2014 "),

    # --- whole words that became CJK pairs
    ("\u95c7\u64b9\u6ae3", "\u9713\u8679"),            # neon   -> 霓虹
    ("\u7ecc\u8f70\u8151\u9369\u5ea1\u5c2f", "\u7a7a\u4e2d\u57ce\u533a"),  # aerial -> 空中城区
    ("\u9366\u9881\u7b05\u9369\u5ea1\u5c2f", "\u5730\u4e0b\u57ce\u533a"),  # subnet -> 地下城区
]

TARGETS = [
    "shaders/common.glsl",
    "shaders/road.glsl",
    "shaders/surface.glsl",
    "tools/make-config-doc.mjs",
    "tools/geom-test.mjs",
    "src/gen/vertical.js",
]

# The underground programme table, which the HUD displays verbatim. Replaced as
# a whole block located by structure — line numbers drift, and the damage left
# some lines without any marker character to key off.
PROGRAM_BLOCK = """  const PROGRAM = [
    { id: 'market', label: '\u9ed1\u5e02 BLACK MARKET', w: [26, 54], d: [24, 46], h: 7.5, neon: 1.6 },
    { id: 'lab', label: '\u975e\u6cd5\u5b9e\u9a8c\u5ba4 CLANDESTINE LAB', w: [16, 30], d: [16, 28], h: 5.0, neon: 0.9 },
    { id: 'data', label: '\u6570\u636e\u4ea4\u6613\u4e2d\u5fc3 DATA BOURSE', w: [18, 34], d: [18, 30], h: 5.5, neon: 1.2 },
    { id: 'bar', label: '\u5730\u4e0b\u9152\u5427 UNDERGROUND BAR', w: [14, 26], d: [14, 24], h: 4.6, neon: 1.9 },
    { id: 'clinic', label: '\u4e49\u4f53\u8bca\u6240 RIPPERDOC', w: [12, 22], d: [12, 20], h: 4.4, neon: 1.1 },
    { id: 'shrine', label: '\u795e\u9f9b SHRINE', w: [8, 14], d: [8, 14], h: 5.0, neon: 0.8 },
    { id: 'farm', label: '\u5782\u76f4\u519c\u573a VERTICAL FARM', w: [20, 40], d: [18, 34], h: 8.0, neon: 0.6 },
  ];"""

total = 0
for rel in TARGETS:
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(p):
        print("  missing:", rel)
        continue
    with io.open(p, encoding="utf-8") as fh:
        text = fh.read()
    before = text

    for bad, good in REPLACEMENTS:
        if bad in text:
            total += text.count(bad)
            text = text.replace(bad, good)

    if rel.endswith("vertical.js"):
        start = text.find("  const PROGRAM = [")
        end = text.find("\n  ];", start)
        if start >= 0 and end > start:
            block = text[start:end + len("\n  ];")]
            if block != PROGRAM_BLOCK:
                text = text[:start] + PROGRAM_BLOCK + text[end + len("\n  ];"):]
                total += 1

    if text != before:
        with io.open(p, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"  repaired {rel}")
    else:
        print(f"  unchanged {rel}")

print(f"\n  {total} replacement(s) applied")

# --- verification: no U+9225, no PUA characters, no stray replacement chars ---
print("\n  verifying:")
problems = 0
for rel in TARGETS:
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    with io.open(p, encoding="utf-8") as fh:
        t = fh.read()
    bad = [(i, c) for i, c in enumerate(t)
           if c == "\u9225" or c == "\ufffd" or 0xE000 <= ord(c) <= 0xF8FF]
    if bad:
        problems += len(bad)
        print(f"    {rel}: {len(bad)} suspicious character(s) remain")
    b = open(p, "rb").read(3)
    if b == b"\xef\xbb\xbf":
        print(f"    {rel}: BOM present")
        problems += 1
if not problems:
    print("    clean")
sys.exit(1 if problems else 0)
