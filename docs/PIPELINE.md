# The generation pipeline

Ten stages, run in this order, on every regeneration. The loader shows them as
they execute. Total wall clock, measured: **0.23 s** (512²) · **0.59 s** (1024²)
· **1.39 s** (2048²).

Everything below is deterministic given the seed: `RNG.derive(name)` gives each
stage an independent stream, so changing one stage never reshuffles another.

---

## Agent 1 · Terrain, hydrology, land value, zoning
`src/gen/planner.js` — ~150 ms (1024²)

**In** seed · **Out** height field, water mask, land-value field, 14 ground
districts, coastline polyline, nuclei, prevailing wind.

- **Coastline.** A random sea direction plus an fBm-wobbled shore distance gives a
  curved seaboard rather than a straight cut. Terrain descends below sea level
  offshore and rises into hills inland, but only *outside* the built-up radius —
  the city is flattened by design.
- **Land value.** Negative-exponential decay from the CBD, plus a peak at each of
  3–5 secondary nuclei (the multi-nuclei model), plus a waterfront amenity
  premium that is cancelled wherever the port will go, minus a nuisance field
  (port noise, peripherality, industrial drift), plus fBm so borders are never
  ruler-straight.
- **Zoning.** Each ground use submits a **soft distance band**
  `peak · exp(−½((d−c)/w)²)`, where `d` is accessibility distance — 0 at the
  core, ~1 at the edge, pulled down near every nucleus so the bands become lobes
  rather than rings. Situational modifiers then carve genuinely non-concentric
  districts out of it: luxury follows the view, the port follows the water,
  industry goes downwind, slums take the cheapest land.
- **Contiguity.** A 3×3 majority filter, four passes.
- **The sixteen-zone contract.** Any zone below `planner.minDistrictArea` gets a
  260-cell blob grown from its best-scoring unclaimed cell. The BFS expands
  neighbours *before* testing water/claimed, so it flows around obstacles instead
  of stalling — the earlier version could leave a zone with literally zero cells.
  A final balancing pass takes cells from the largest zone if that still fails.

> `tools/plan-test.mjs` asserts this contract across 10 seeds × 3 map sizes.

---

## Agent 2 · Road network
`src/gen/roads.js` — ~30 ms

**In** plan · **Out** road raster, street segments, leaf blocks, junction list,
connectivity audit.

A city plan is a **subdivision history**, and this reproduces it exactly. The
whole map starts as one block; a max-heap repeatedly pops the largest block and
cuts it. Which tier the cut belongs to is decided by how big the block still was
when it was cut:

| Tier | Stop size | Width | Character |
|---|---|---|---|
| 1 arterial | ~226 m | 26–40 m, 6–12 lanes | straight, crosses the whole city, forms superblocks |
| 2 collector | ~128 m | 12–19 m | links districts, allowed to curve |
| 3 alley | ~44 m | 4–7 m | one partial service cut per surviving block |

Two details carry most of the quality:

- **Snapping.** A new cut within `snapTol` of an existing collinear street of the
  same tier snaps onto it, which is what produces arterials that run dead straight
  for kilometres instead of stair-stepping.
- **Carving.** The children of a cut are **land**, not half the parent: the
  carriageway corridor is removed at the moment the block is created. Without
  this every plot loses half an arterial's width to its own edge — the bug that
  once pushed carriageway coverage to 81 % of the map.

Alleys are deliberately *not* a second full grid. Each surviving block gets one
service cut that usually stops short, which keeps the alley share around a tenth
of the map instead of a third, and leaves the leftover fabric as courtyards and
back lots.

**Junctions** are found by intersecting vertical and horizontal centrelines with
a tolerance of `0.62 × max(width)`. Tolerance is required, not laziness: because
streets are carved, a cross-street ends at the *edge* of the carriageway it runs
into, not its centreline. Strict containment silently found **zero** junctions,
which cost the city every traffic signal, every hydrant — and all 28 subway
entrances.

---

## Agent 3 · Building stock
`src/gen/buildings.js` — ~70 ms

**In** plan + roads · **Out** building records, occupancy raster, roof/facade prop
requests, billboard anchors, neon emitters, 3–10 super-corporations.

- **Lots.** Blocks are broken up the way a surveyor would: a perimeter ring of
  frontage lots, then an interior infill grid for the leftover courtyard. Shared
  boundaries are computed once and shared, so neighbours are perfectly adjacent
  and never overlap.
- **Fitting.** A lot that a street crosses is *trimmed* to its largest
  carriageway-free sub-rectangle (halves, then quarters) rather than discarded.
  The first version threw the whole plot away, which is how a single alley
  destroyed the entire frontage either side of it.
- **Height.** Log-normal per district, modulated by local land value, and capped
  by an envelope rule — a 6 m plot cannot carry a 300 m tower.
- **Grounding.** Base Y is the **minimum** terrain height over the lot's four
  corners, so a building is never floating. Steep lots in the slums and port grow
  actual stilts.
- **Corporations.** The best CBD/corporate parcels become HQs, extended upward
  into landmarks with setback segments and a lit crown. Each corporation then
  claims R&D, staff housing and private security assets, and paints its livery
  across every building inside its Voronoi territory.

---

## Agent 4 · Vertical transit
`src/gen/transit.js` — ~40 ms

**In** plan + roads + buildings · **Out** viaducts, maglev lines + stations,
skybridges, walkways, air corridors, drone lanes.

Every elevated element is anchored to something that already exists:

- **Viaducts** follow arterial alignments; piers stand on road cells by
  construction, so a support can never come up through a living room.
- **Maglev** guideways and stations sit above the same arterials.
- **Skybridges** are a greedy priority pairing, not an all-pairs scan (the
  all-pairs version generated millions of candidate pairs and then sorted them —
  a multi-second stall). Structures are ranked so corporate HQs and retail claim
  partners first, and a structure can only be used once.
- **Air corridors** are ribbons above the same arterials, 100–500 m, with two-way
  taxi traffic; **drone lanes** occupy 30–96 m plus rooftop-to-rooftop legs.

---

## Volumetric districts
`src/gen/vertical.js` — ~20 ms

**空中城区 (aerial)** — cantilevered decks on the tallest hosts. Each deck
overlaps its tower's footprint and is carried by real columns and diagonal ties
back into the core, plus a conflict test that rejects any deck whose airspace is
already occupied. Nothing hovers. Deck-to-deck skybridges form the aerial street
grid. A fallback guarantees the district exists even on a map with no tall
buildings.

**地下城区 (subnet)** — service tunnels following the arterial alignments with
carved chambers for the black market, ripperdoc clinics, data bourses, bars,
shrines and vertical farms, reached by lift shafts that break the surface at real
junction corners. The subnet has its own collision raster, so first-person
movement switches layers when you descend.

---

## Perimeter
`src/gen/perimeter.js` — ~4 ms

The edge of a megacity does not stop at a line, it frays. Outward from the last
zoned blocks: collapsed halls, skeletal frames and rubble mounds; then a
quarantine belt with a blast wall, buttresses, watchtowers and five checkpoints;
then open wasteland and hills. The planner fades urban uses out over the same
band (`edgeFade`, 1.0→1.30 Rc), so the zoning and the geometry agree.

---

## Agent 5 · Lighting
`src/gen/lighting.js` — ~6 ms

Registers every emitter — street lights along the carriageways, building neon,
transit underglow, sign backlights, and the subnet's own fixtures — then builds
the spatial grid the per-frame light pool queries.

The mandated霓虹 ratio (blue 35 / purple 25 / cyan 20 / pink 15 / red 5) is
enforced by drawing from a **shuffled bag** containing exactly those proportions,
not by independent weighted draws. Independent draws converge only in the limit;
over a few thousand emitters they routinely land 10+ points off, which the
validator flags.

---

## Agent 6 · Advertising
`src/gen/ads.js` — ~35 ms

Runs **before** lighting so signs can feed the light pool.

The entire ad network is one 6×4 atlas painted procedurally into a canvas at load
time — Chinese, Japanese and Korean copy, product motifs, price strips, barcodes,
CRT scanlines, corner brackets. There are **no image files in this project**.
Every sign is then an instance of one quad picking a tile, split into four
material groups: opaque LED, Japanese-style blade signs, additive volumetric
holograms, and structural frames.

Signs are bucketed spatially so frustum culling still works, and retail frontage
is sorted first and exempt from budget thinning — "at least five billboards per
commercial block" is a hard requirement, and random sampling is exactly how a
block ends up with four.

---

## Agent 7 · Population
`src/gen/npc.js` — ~25 ms

Bakes ~1 600–2 600 random walks over the footway raster into a float path atlas,
then creates 1 000–50 000 agents whose positions are a texture lookup in the
vertex shader. 13 occupations weighted per the district they walk in.

Traffic (air taxis, drones, maglev consists) is CPU-stepped instead, because
vehicles need rigid orientation and banking that the billboard path shader cannot
express.

---

## Agent 8 · Environment
`src/gen/details.js` — ~15 ms

~9 000 street props placed by district character (noodle stalls and vending
machines in the nightlife strip, pipe runs and transformers in industry,
scaffolding and tarp awnings in the slums), ~1 400 catenary cables rendered as
camera-expanded instanced quads, and ~1 500 steam / smoke / spark / dust
particles emitted from street grates, industrial stacks and vendor stalls.

---

## Agent 9 · Validation
`src/gen/validate.js` — ~10 ms

Re-derives twelve constraints **from the generated data**, not from the
algorithms' intent, and reports PASS / CONCERNS / FAIL in the HUD:

1. all 16 districts present and above their minimum area
2. road network connectivity ≥ 98.5 % (largest component)
3. no building footprint intersects a live lane
4. no floating structures
5. no interpenetration
6. ≥ 5 billboards per commercial block
7. neon colour ratio within 9 points of spec
8. population within 1 000–50 000
9. vertical transit actually generated
10. map edge decays (outer frame < 30 % urban)
11. no dead zones (built coverage > 34 %)
12. every aerial platform bears on a tower

This is the stage that found the junction bug: 208 junctions became 0 and the
audit made it a number instead of a mystery.

---

## Agent 10 · Optimisation
`src/gen/optimize.js` — ~30 ms

Bakes the accumulated `MeshBuilder` buckets into one `BufferGeometry` per
(chunk, material mode), computes bounding spheres, and reports the final draw-call
and triangle counts. Runtime counterparts: dynamic resolution scaling, distance
culling, and the twelve-light pool.

---

## What runs after generation

`main.js` wires the world systems — day/night, weather, sky — and starts the
frame loop:

```
daynight.update → weather.update → rig.update → sky.update
  → neonPool.update(camera) → planarReflection → vehicle swarms
  → crowd repoint (every 1.6 s) → composer.render → HUD → minimap
```
