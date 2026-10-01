# Contributing

Thanks for looking. This is a self-contained creative-coding project, so the bar
is "does it make the city better or the code clearer", not process.

---

## Getting set up

```bash
git clone https://github.com/Darling-Y1230/cyberpunk-city-generator.git
cd cyberpunk-city-generator
node tools/fetch-deps.mjs      # three.js + esbuild, ~52 MB, one command
node tools/build.mjs           # -> dist/cyberpunk-city.html
node tools/serve.mjs           # -> http://127.0.0.1:8173
```

You need **Node 20+** and nothing else. No package manager is involved anywhere
in this project — dependencies are fetched directly from the npm registry with
Node's own `fetch`, and bundled with a vendored esbuild.

For iterating on the sources with hot reload instead of rebuilding the single
file, serve the module entry and use the import map in `index.html`:

```bash
node tools/serve.mjs --dev      # serves index.html + src/ + vendor/
```

---

## Before you open a pull request

```bash
npm test        # geometry sanity + zoning sanity, ~2 s, no browser
npm run build   # must succeed
```

`npm test` runs two headless suites that catch the two failure modes this project
actually has:

| Suite | Catches |
|---|---|
| `geom-test` | NaN vertices. Builds every prop, vehicle and building type and asserts every coordinate is finite. |
| `plan-test` | Zoning collapse. Runs Agent 1 across 10 seeds × 3 map sizes and asserts all sixteen zones clear their minimum area. |

If you changed anything that affects rendering, also run the browser harness:

```bash
npm run verify              # end-to-end + console errors + screenshots
npm run verify:offline      # proves the single file still needs no network
```

It drives a real headless browser over the Chrome DevTools Protocol and writes
screenshots to `dist/shots/`.

---

## The rules that are not negotiable

These are enforced by the validator and by the brief:

1. **No clipped geometry.** A building may not occupy a live lane. Lots are
   placed against the planning raster — do not add a code path that bypasses it.
2. **No floating structures.** A building's base is the *minimum* terrain height
   over its footprint, or it gets real stilts. Never an average.
3. **No broken roads.** A street spans its whole parent block. If you add a new
   kind of cut, its endpoints must land on existing streets.
4. **All sixteen zones exist** on every seed. `planner.minDistrictArea` is a
   contract, not a goal.
5. **≥ 5 billboards per commercial block.**
6. **Neon colour ratio** stays within 9 points of blue 35 / purple 25 / cyan 20 /
   pink 15 / red 5. Draw from the shuffled bag; do not swap it for independent
   weighted draws.
7. **No external assets.** No image files, no fonts, no CDN, no `fetch` at
   runtime. Textures are painted into canvases; the build must stay one file that
   runs from `file://`.

---

## Where to change things

| You want to… | Start here |
|---|---|
| rebalance districts, heights, lot sizes | `config.json` → see [docs/CONFIG.md](docs/CONFIG.md) |
| change how the city is planned | `src/gen/planner.js` |
| change street hierarchy or block sizes | `src/gen/roads.js`, `config.roads.levels` |
| change building shapes | `models/buildings.js` (massing) vs `src/gen/buildings.js` (placement) |
| add a prop or vehicle | `models/props.js`, `models/vehicles.js` |
| change lighting or the neon palette | `shaders/common.glsl`, `src/gen/lighting.js` |
| change materials | `shaders/*.glsl` + `src/shaders/materials.js` |
| change the crowd | `shaders/crowd.glsl`, `src/gen/npc.js` |

**Shaders live in `shaders/*.glsl`, not in JavaScript.** They are inlined into
`src/shaders/generated.js` by `tools/build-assets.mjs`, which also resolves
`#include "common"`. Never edit `src/shaders/generated.js` or
`src/config.generated.js` — both are generated on every build.

---

## Three traps worth knowing about

**UTF-8 BOM.** A BOM in a `.glsl` file becomes an illegal first character and
breaks every shader that includes it — with an error that points at the wrong
line. On Windows, `Set-Content -Encoding UTF8` writes a BOM. Use
`[IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))`,
or run `node tools/strip-bom.mjs`.

**Never round-trip a UTF-8 file through a PowerShell text pipeline.** This is not
hypothetical: it silently corrupted 53 characters across nine files in this
repository. `Get-Content -Raw` decodes using the console's active code page
(CP936/GBK on a Chinese Windows install), so `—` becomes `鈥?`, `façade` becomes
`fa莽ade`, and 霓虹 becomes `闇撳彣`. `Set-Content`/`WriteAllText` then writes that
back as UTF-8 and the original bytes are gone.

The part that makes it dangerous is that **it looks fine**. PowerShell decodes
the damaged file the same wrong way on the way out, so the terminal shows you
correct Chinese while the file on disk is incorrect. The damage is only visible
to a tool that reads the file as UTF-8 — a browser, a compiler, or Python:

```bash
python tools/repair-encoding.py     # repairs known damage; verifies and is idempotent
```

Use the `edit`/`write` tools, or Node, to modify these files. If you must use
PowerShell, read and write with an explicit encoding:

```powershell
$s = [IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false))
# ... modify $s ...
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
```

**`String.replace` and `$`.** `tools/build.mjs` inlines the bundle into the HTML
shell. Minified JavaScript is full of `` $` `` and `$'`, which `String.replace`
interprets as substitution patterns and expands into fragments of the surrounding
document. The replacement callbacks are function-form for exactly this reason —
do not "simplify" them back to strings.

---

## Style

There is no linter. The conventions that actually matter here:

- Comment the **why**, especially where a choice looks odd. Several comments in
  this codebase exist because a plausible-looking alternative silently broke
  something.
- Prefer a structural guarantee over a runtime check. If a bug class can be made
  unreachable, make it unreachable and then assert it anyway.
- Keep `src/gen/` free of three.js objects so it stays headlessly testable.
- Numbers that a designer might want to tune belong in `config.json`.

---

## Reporting a bug

The validator report is the fastest thing to attach. It is printed to the browser
console as a table on every generation, and shown in the HUD's Agent 9 panel.
Include the seed (`?seed=...`) — every city is reproducible from it.
