# Architecture

This document explains **why** the code is shaped the way it is. If you only want
to run the thing, read the [README](../README.md). If you want to change the
generator, read this first — most of the structure here exists to make a specific
class of bug impossible rather than to be tidy.

---

## 1. The three layers

```
        data                    geometry                  pixels
  ┌───────────────┐      ┌──────────────────┐      ┌──────────────────┐
  │  src/gen/*    │  →   │  models/*        │  →   │  shaders/*.glsl  │
  │  decisions    │      │  vertices        │      │  light           │
  └───────────────┘      └──────────────────┘      └──────────────────┘
          │                       │                         │
          └────────── src/core/ (rng, grid, path, engine, controls) ──────┘
```

- **`src/gen/`** decides *what goes where*. It never creates a `THREE.Mesh`.
  It writes into a `MeshBuilder` or pushes a record onto a list.
- **`models/`** turns a decision into vertices. It is pure: given the same
  arguments it produces the same triangles, and it knows nothing about cities.
- **`shaders/`** decides how those triangles are lit. Nine GLSL files, one
  shared block.

The separation matters because the generator is the part that is hard to debug —
you cannot step through a skyline. Keeping it free of three.js objects means the
whole of `src/gen/` can be exercised headlessly.

---

## 2. The raster is the contract

Every hard guarantee in this project is enforced on **one** `Uint8Array`: the
planning raster at `config.world.cellSize` (default 4 m).

```
 0 empty      1 arterial   2 collector   3 alley
 4 footway    5 junction   255 water
```

Anything that must not overlap reads and writes that grid, in this order:

1. **Roads** stamp their corridors into it.
2. **Buildings** may only occupy cell ranges the raster reports as free.
3. **Props** are rejected if they land on a live lane.
4. **Collision** at runtime is a single array lookup on the same raster.
5. **The minimap** is rasterised straight out of it.

Because every stage consults the same authoritative buffer, "a building sitting
in the road" is not a bug that needs testing for — it is a state the code cannot
reach. The validator checks it anyway (`no-road-overlap`), but it is a regression
guard, not a fix.

> **Why this matters in practice.** The single worst bug in this project's
> history was a subdivision rule that let blocks keep half an arterial's width
> for themselves. The raster did not lie about it: the carriageway went from 35 %
> to 81 % of the map and the building count collapsed from 1 071 to 5. The grid
> made the failure legible in one number.

---

## 3. Named RNG sub-streams

`RNG.derive(name)` returns an independent generator seeded by
`hash(parentSeed + streamName)`.

```js
const rng = new RNG(seed, 'city');
const plan   = planCity(cfg, rng.derive('planner'));
const roads  = generateRoads(cfg, rng.derive('roads'), plan);
const crowd  = generateCrowd(cfg, rng.derive('crowd'), ctx);
```

Without this, adding one `rng.next()` call inside the ad generator would shift
every subsequent random number and produce a completely different city — which
makes A/B tuning impossible, because you can never change one thing at a time.
With it, each stage is reproducible in isolation and `seed=X` pins the whole
city forever.

---

## 4. Draw calls: spatial chunks × material mode

A 2048 m city is ~2 500 buildings, ~22 000 props and ~30 000 billboards. Neither
"one merged mesh" (nothing culls) nor "one mesh per object" (thousands of draw
calls) works.

`ChunkSet` accumulates geometry into a `Map` keyed by
`chunkX,chunkZ|materialMode` and emits **one `BufferGeometry` per bucket**:

```js
const mb = chunks.at(x, z, STYLE.CURTAIN);   // 340 m bucket, style 0
builder(mb, rng, { x, z, width, depth, height, ... });
```

Result: ~350 draw calls for a whole 2048 m metropolis, with frustum culling
operating at 340 m granularity instead of on the entire city.

Repeated small objects (air-conditioning units, vending machines, street lights,
hydrants, cameras) instead go through `PropInstancer` — one `InstancedMesh` per
kind, with per-instance look variation carried in instanced attributes.

---

## 5. Everything speaks one vertex language

Every solid surface in the city — a tower, a slum shack, a cargo crane, a vending
machine — is emitted through `MeshBuilder` with the same attributes:

| attribute | meaning |
|---|---|
| `position`, `normal` | metres, world space |
| `uv` | **metres**, not 0–1. A 4 m alley and a 12-lane boulevard are the same two triangles; the shader derives floor heights and lane markings from real dimensions. |
| `aData` | `(seed, styleFlags, litRatio, emissive)` |
| `aData2` | `(baseY, height, hue, dirt)` |

`aData2.baseY`/`height` give the fragment shader the information it needs to
darken street canyons without any occlusion pass: `canyonAO` interpolates from
0.34 at the base to 1.0 one fifth of the way up the building. That single term is
most of what makes the streets feel deep.

---

## 6. One uniform block, many materials

`MaterialLibrary` holds **one** uniform object. Every material created from it
shares those uniform *objects* (not copies), so a weather change is a handful of
writes rather than a loop over materials:

```js
u.uFogDensity.value = weather.state.fog;
u.uCityGlow.value.copy(glow);
// ...and every material in the city has already changed
```

Materials that need a per-material constant (`uMode`, `uTint`) get a fresh
prototype-chained object via `Object.assign(Object.create(null), shared, extra)`
— shared references for globals, their own slot for the constant.

**`NeonPool`** is the other half of this. The city registers ~17 000 emitters;
each frame the twelve with the best `intensity · r² / distance²` near the camera
are uploaded. The fragment shader loops `NEON_MAX` times and breaks at
`uNeonCount`. The city looks lit by a hundred thousand tubes and costs twelve.

---

## 7. Colour: linear HDR, one tone-map at the end

```
material shaders ──► linear HDR (neon routinely exceeds 1.0)
      │
   RenderPass
      │
   UnrealBloomPass  (thresholds in linear space, so only real emitters bloom)
      │
   OutputPass       (ACES + sRGB, exactly once)
```

The alternative — tone-mapping inside every material and again in the composer —
gives you washed-out neon and bloom that triggers on ordinary lit surfaces.
Getting this wrong is the difference between "bright" and "cinematic".

Devices without `EXT_color_buffer_float` cannot render to half-float targets. The
composer then falls back to `UnsignedByteType` with bloom off rather than
producing a black frame, and says so in a toast.

---

## 8. The crowd is a texture lookup

Baking the path graph once produces a `Float32` `DataTexture` of shape
`pathPoints × pathCount`, each texel holding `(worldX, worldY, worldZ, cumulativeDistance)`.

From then on an agent's position is:

```glsl
float d = mod(aNpc.y + uTime * aNpc.z * uSpeedScale, totalLength);
// walk the polyline, interpolate, done
```

50 000 agents cost the CPU **nothing per frame**. A second, articulated low-poly
tier is *re-pointed* at whichever paths are currently nearest the camera every
1.6 s, so close-up figures have real legs without the CPU simulating a crowd.

---

## 9. Guarantees, not repairs

The brief forbids clipped geometry, floating buildings and broken roads. None of
those are fixed after the fact; each is prevented by construction:

| Requirement | Mechanism |
|---|---|
| No building in the road | Lots are only placed on raster-free cells. |
| No broken roads | A street is always cut across its **whole** parent block, so every endpoint lands on another street. Alleys break out of the block at their head by construction. |
| No floating buildings | Building base = **minimum** terrain height over the lot's four corners. Hillside slums get real stilts, not floating boxes. |
| No interpenetration | Every lot is inset by `world.lotMargin`, and shared frontage boundaries are computed once and shared by both neighbours instead of being jittered independently. |
| Districts contiguous | Majority filter over the zoning raster, then a blob-growth pass that guarantees all sixteen zones clear `planner.minDistrictArea`. |

Agent 9 (`src/gen/validate.js`) re-derives all of this from the generated data and
reports PASS / CONCERNS / FAIL in the HUD. It is a regression guard.

---

## 10. The two headless test harnesses

Browser tests are slow and flaky. The parts of this project that are pure
computation are tested in Node, in about a second:

- **`tools/geom-test.mjs`** builds every procedural mesh — all 25 props, all
  vehicles, every building type × 40 random parameter sets — and asserts that no
  vertex is non-finite. This is what caught the `frustum` shadowing bug that had
  silently collapsed every tower in the city to the world origin.

- **`tools/plan-test.mjs`** runs Agent 1 across ten seeds × three map sizes and
  asserts that all sixteen zones clear their minimum area.

- **`tools/verify.mjs`** drives a real headless browser over the Chrome DevTools
  Protocol: generates, reads the validation report, captures console exceptions,
  switches camera, screenshots, sweeps all three map sizes and stress-tests
  50 000 agents. `--offline=1` cuts the network before navigation to prove the
  single file has no external dependency.

---

## 11. Things that are deliberate, not oversights

- **No touch controls.** The interaction model is pointer-lock + WASD. Mobile
  browsers will render the city and let you watch it, but not play it.
- **No shadows.** With 95 % artificial light and a bloom-heavy look, shadow maps
  cost more than they add. The `canyonAO` term carries the depth cue instead.
- **`vendor/` is not committed.** 52 MB, one file of which is a platform-specific
  binary. `node tools/fetch-deps.mjs` reproduces it.
- **`dist/cyberpunk-city.html` *is* committed.** It is the product, not a build
  artefact — the whole point is that someone can download one file and play.
