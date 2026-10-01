# config.json reference

> **Generated file.** Produced by `tools/make-config-doc.mjs` from `config.json`.
> Edit the JSON, then run `npm run assets`. Do not edit this page by hand.

`config.json` is the single source of truth for every tunable in the generator.
Nothing in `src/` hard-codes a number that belongs here.

Every key present in `config.json` is listed below, whether or not it has prose —
so an undocumented knob is still a visible knob.

## Contents

- `(root)`
  - `meta`
  - `world`
  - `planner`
    - `districts.specs.cbd`
      - `districts.specs.corporate`
      - `districts.specs.research`
      - `districts.specs.industrial`
      - `districts.specs.port`
      - `districts.specs.residential`
      - `districts.specs.luxury`
      - `districts.specs.slum`
      - `districts.specs.underground`
      - `districts.specs.sky`
      - `districts.specs.commercial`
      - `districts.specs.nightlife`
      - `districts.specs.medical`
      - `districts.specs.education`
      - `districts.specs.datacenter`
      - `districts.specs.energy`
  - `roads`
    - `roads.levels[]`
    - `transit.viaduct`
    - `transit.maglev`
    - `transit.skybridge`
    - `transit.airLane`
    - `transit.droneLane`
    - `transit.walkway`
  - `corporations`
    - `corporations.pool[]`
  - `lighting`
    - `lighting.neonPalette[]`
    - `lighting.bloom`
  - `ads`
  - `npc`
    - `npc.occupations[]`
  - `environment`
  - `weather`
    - `weather.types.clear`
      - `weather.types.overcast`
      - `weather.types.rain`
      - `weather.types.storm`
      - `weather.types.fog`
      - `weather.types.acid`
      - `weather.types.dust`
  - `render`
    - `render.qualityTiers.ultra`
      - `render.qualityTiers.high`
      - `render.qualityTiers.medium`
      - `render.qualityTiers.low`
  - `controls`

---

## `(root)`

| key | value | meaning |
|---|---|---|
| `$schema` | `"./config.schema.md"` |  |

### `meta`

| key | value | meaning |
|---|---|---|
| `title` | `"NEO-KOWLOON 2087"` |  |
| `subtitle` | `"Procedural Cyberpunk Mega-City Generator"` |  |
| `version` | `"1.0.0"` |  |
| `engine` | `"three.js r160"` |  |

### `world`

| key | value | meaning |
|---|---|---|
| `mapSize` | `"random"` | Square city footprint in metres. `random` picks one of `mapSizeChoices` per generation. |
| `seaLevel` | `0` | World Y of the waterline. Terrain below this is sea. |
| `maxTerrainHeight` | `46` | Upper bound for the surrounding hills, so the horizon never dwarfs the city. |
| `shoreWidth` | `90` | Width of the beach/quay transition band along the coast. |
| `cellSize` | `4` | Planning raster resolution. **Every** overlap guarantee in the project is enforced on this grid 鈥?roads, water, building footprints and collision all read it. Raising it makes the city coarser and the guarantees still hold; lowering it costs memory quadratically. |
| `lotMargin` | `0.75` | Total gap between neighbouring building footprints. This is what keeps adjacent fa莽ades from producing coplanar z-fighting. |
| `wallHeight` | `34` | Height of the perimeter blast wall. The wall is what stops the map edge from reading as a cut. |
| `skyCeiling` | `700` | Highest altitude the fly camera may reach. |

### `planner`

| key | value | meaning |
|---|---|---|
| `landValueDecay` | `340` | Distance constant of the CBD land-value falloff, in metres. Larger = a broader, flatter downtown. |
| `waterfrontPremium` | `0.34` | Land-value bonus applied near the shore, minus wherever the port is placed. |
| `transitWeight` | `0.22` | How much arterial/maglev accessibility feeds back into land value. |
| `nuisanceWeight` | `0.5` | How hard industry, the port and power generation push land value down. |
| `smoothingPasses` | `4` | Majority-filter passes over the zoning raster. This is what makes district borders contiguous instead of noisy. |
| `minDistrictArea` | `900` | Hard floor, in m虏, for every one of the sixteen zones. The planner grows a blob for any zone below it and reports a failure if it still cannot comply. |
| `coastBias` | `0.62` | How strongly the coastline is allowed to wander from its base radius. |

##### `districts.specs.cbd`

| key | value | meaning |
|---|---|---|
| `label` | `"中央商务区 CENTRAL BUSINESS DISTRICT"` |  |
| `color` | `"#59e0ff"` |  |
| `hMin` | `200` | Minimum building height for this zone, metres. |
| `hMax` | `1200` | Maximum building height, metres. |
| `sigma` | `0.52` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `330` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.9` | Probability that a surveyed lot is actually built on. |
| `split` | `0.34` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `1.35` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `12` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.corporate`

| key | value | meaning |
|---|---|---|
| `label` | `"超级企业总部区 MEGA-CORP HEADQUARTERS"` |  |
| `color` | `"#b07cff"` |  |
| `hMin` | `140` | Minimum building height for this zone, metres. |
| `hMax` | `880` | Maximum building height, metres. |
| `sigma` | `0.46` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `240` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.82` | Probability that a surveyed lot is actually built on. |
| `split` | `0.38` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `1.15` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `10` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.research`

| key | value | meaning |
|---|---|---|
| `label` | `"高科技研发区 R&D CAMPUS"` |  |
| `color` | `"#67ffd4"` |  |
| `hMin` | `40` | Minimum building height for this zone, metres. |
| `hMax` | `320` | Maximum building height, metres. |
| `sigma` | `0.44` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `96` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.66` | Probability that a surveyed lot is actually built on. |
| `split` | `0.44` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.9` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `6` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.industrial`

| key | value | meaning |
|---|---|---|
| `label` | `"工业制造区 INDUSTRIAL MANUFACTURING"` |  |
| `color` | `"#ff9a52"` |  |
| `hMin` | `12` | Minimum building height for this zone, metres. |
| `hMax` | `140` | Maximum building height, metres. |
| `sigma` | `0.5` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `34` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.55` | Probability that a surveyed lot is actually built on. |
| `split` | `0.58` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.55` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `3` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.port`

| key | value | meaning |
|---|---|---|
| `label` | `"港口物流区 PORT & LOGISTICS"` |  |
| `color` | `"#4fd2a8"` |  |
| `hMin` | `8` | Minimum building height for this zone, metres. |
| `hMax` | `110` | Maximum building height, metres. |
| `sigma` | `0.55` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `22` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.46` | Probability that a surveyed lot is actually built on. |
| `split` | `0.64` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.6` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `3` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.residential`

| key | value | meaning |
|---|---|---|
| `label` | `"普通住宅区 RESIDENTIAL BLOCKS"` |  |
| `color` | `"#ffd166"` |  |
| `hMin` | `24` | Minimum building height for this zone, metres. |
| `hMax` | `190` | Maximum building height, metres. |
| `sigma` | `0.42` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `58` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.9` | Probability that a surveyed lot is actually built on. |
| `split` | `0.22` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.85` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `6` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.luxury`

| key | value | meaning |
|---|---|---|
| `label` | `"高级住宅区 PREMIUM RESIDENTIAL"` |  |
| `color` | `"#ffe9a8"` |  |
| `hMin` | `70` | Minimum building height for this zone, metres. |
| `hMax` | `420` | Maximum building height, metres. |
| `sigma` | `0.38` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `150` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.7` | Probability that a surveyed lot is actually built on. |
| `split` | `0.36` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.7` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `5` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.slum`

| key | value | meaning |
|---|---|---|
| `label` | `"贫民窟 UNDERCITY SLUMS"` |  |
| `color` | `"#ff5f6d"` |  |
| `hMin` | `3` | Minimum building height for this zone, metres. |
| `hMax` | `50` | Maximum building height, metres. |
| `sigma` | `0.62` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `11` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.99` | Probability that a surveyed lot is actually built on. |
| `split` | `0.12` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.75` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `7` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.underground`

| key | value | meaning |
|---|---|---|
| `label` | `"地下城区 SUBNET / UNDERGROUND"` |  |
| `color` | `"#8a6bff"` |  |
| `hMin` | `0` | Minimum building height for this zone, metres. |
| `hMax` | `0` | Maximum building height, metres. |
| `sigma` | `0.3` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `0` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.8` | Probability that a surveyed lot is actually built on. |
| `split` | `0.2` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.95` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `5` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.sky`

| key | value | meaning |
|---|---|---|
| `label` | `"空中城区 AERIAL CONCESSIONS"` |  |
| `color` | `"#9fe8ff"` |  |
| `hMin` | `0` | Minimum building height for this zone, metres. |
| `hMax` | `0` | Maximum building height, metres. |
| `sigma` | `0.3` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `0` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.55` | Probability that a surveyed lot is actually built on. |
| `split` | `0.5` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `1` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `6` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.commercial`

| key | value | meaning |
|---|---|---|
| `label` | `"娱乐商业区 ENTERTAINMENT & RETAIL"` |  |
| `color` | `"#ff4fd8"` |  |
| `hMin` | `30` | Minimum building height for this zone, metres. |
| `hMax` | `260` | Maximum building height, metres. |
| `sigma` | `0.44` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `70` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.92` | Probability that a surveyed lot is actually built on. |
| `split` | `0.2` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `1.6` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `18` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.nightlife`

| key | value | meaning |
|---|---|---|
| `label` | `"夜生活区 NIGHTLIFE STRIP"` |  |
| `color` | `"#ff2e88"` |  |
| `hMin` | `18` | Minimum building height for this zone, metres. |
| `hMax` | `180` | Maximum building height, metres. |
| `sigma` | `0.48` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `46` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.96` | Probability that a surveyed lot is actually built on. |
| `split` | `0.14` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `1.95` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `20` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.medical`

| key | value | meaning |
|---|---|---|
| `label` | `"医疗中心区 MEDICAL CENTER"` |  |
| `color` | `"#d8fff5"` |  |
| `hMin` | `34` | Minimum building height for this zone, metres. |
| `hMax` | `240` | Maximum building height, metres. |
| `sigma` | `0.4` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `82` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.62` | Probability that a surveyed lot is actually built on. |
| `split` | `0.42` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.8` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `5` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.education`

| key | value | meaning |
|---|---|---|
| `label` | `"教育科研区 ACADEMIC QUARTER"` |  |
| `color` | `"#8fd6ff"` |  |
| `hMin` | `16` | Minimum building height for this zone, metres. |
| `hMax` | `150` | Maximum building height, metres. |
| `sigma` | `0.42` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `38` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.58` | Probability that a surveyed lot is actually built on. |
| `split` | `0.44` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.6` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `4` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.datacenter`

| key | value | meaning |
|---|---|---|
| `label` | `"数据中心区 DATA FORTRESS"` |  |
| `color` | `"#7d8cff"` |  |
| `hMin` | `26` | Minimum building height for this zone, metres. |
| `hMax` | `190` | Maximum building height, metres. |
| `sigma` | `0.36` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `58` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.54` | Probability that a surveyed lot is actually built on. |
| `split` | `0.54` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.9` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `4` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

##### `districts.specs.energy`

| key | value | meaning |
|---|---|---|
| `label` | `"能源供应区 POWER GENERATION"` |  |
| `color` | `"#ffd23f"` |  |
| `hMin` | `10` | Minimum building height for this zone, metres. |
| `hMax` | `210` | Maximum building height, metres. |
| `sigma` | `0.58` | Sigma of that log-normal. Higher = more height variance within the zone. |
| `hMode` | `30` | Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top. |
| `density` | `0.4` | Probability that a surveyed lot is actually built on. |
| `split` | `0.66` | How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator's stop-size rule. |
| `neon` | `0.5` | Multiplier on how many neon emitters the zone's buildings register. |
| `ads` | `2` | Billboard anchors per building before the density multiplier. |
| `walkable` | `true` |  |

### `roads`

| key | value | meaning |
|---|---|---|
| `sidewalkWidth` | `3.4` | Footway width. Buildings are allowed to front directly onto it. |
| `minLotDepth` | `9` | Smallest buildable depth. A street is never cut if either resulting half would fall below this. |
| `crossingEvery` | `4` | Reserved for crossing frequency tuning. |

#### `roads.levels[]`

| key | value | meaning |
|---|---|---|
| `id` | `1` |  |
| `name` | `"arterial"` |  |
| `targetBlock` | `226` | Block size, in metres, at which this tier stops subdividing. Arterials are cut from the largest blocks, alleys from the smallest. |
| `minWidth` | `22` |  |
| `maxWidth` | `46` |  |
| `jitter` | `0.16` | How far a cut may wander from the centre of its parent block. |
| `snapTol` | `0.14` | Tolerance for snapping a new cut onto an existing collinear street. This is what makes arterials run straight for kilometres instead of stair-stepping. |

#### `transit.viaduct`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `count` | `2` |  |
| `deckY` | `15.5` | Deck height above ground for the elevated highway. |
| `width` | `26` |  |
| `pillarEvery` | `32` |  |

#### `transit.maglev`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `count` | `3` |  |
| `beamY` | `24` | Height of the maglev guideway beam. |
| `pillarEvery` | `44` |  |
| `trains` | `6` |  |
| `speed` | `42` | Train speed, m/s. |

#### `transit.skybridge`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `maxSpan` | `118` | Longest gap a skybridge may span, metres. Only placed between two real structures 鈥?nothing floats. |
| `maxHeightDelta` | `46` |  |
| `minY` | `22` |  |
| `maxCount` | `190` |  |

#### `transit.airLane`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `minY` | `100` | Floor of the air-taxi corridor band, metres. |
| `maxY` | `500` | Ceiling of the air-taxi corridor band, metres. |
| `count` | `7` |  |
| `taxis` | `70` |  |

#### `transit.droneLane`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `minY` | `30` | Floor of the delivery-drone band, metres. |
| `maxY` | `96` |  |
| `count` | `22` |  |
| `drones` | `420` |  |

#### `transit.walkway`

| key | value | meaning |
|---|---|---|
| `enabled` | `true` |  |
| `maxCount` | `120` |  |
| `y` | `6.2` |  |

### `corporations`

| key | value | meaning |
|---|---|---|
| `territoryRadius` | `300` | Base radius, metres, of a corporation's Voronoi territory. |

#### `corporations.pool[]`

| key | value | meaning |
|---|---|---|
| `name` | `"Nova Dynamics"` |  |
| `ticker` | `"NVD"` |  |
| `color` | `"#59e0ff"` |  |
| `hanzi` | `"新星动力"` |  |

### `lighting`

| key | value | meaning |
|---|---|---|
| `defaultTime` | `22.4` | Starting hour of the day, 0鈥?4. The city is authored for the night. |
| `artificialRatio` | `0.95` | Target share of illumination that is artificial. The brief asks for 95 %. |
| `dynamicLightPool` | `18` | How many emitters are uploaded to the shader each frame. The city has tens of thousands; the shader shades this many per pixel. Raising it costs fragment time linearly. |
| `dynamicLightRadius` | `46` |  |

#### `lighting.neonPalette[]`

| key | value | meaning |
|---|---|---|
| `color` | `"#2f7bff"` |  |
| `weight` | `0.35` |  |

#### `lighting.bloom`

| key | value | meaning |
|---|---|---|
| `strength` | `0.52` |  |
| `radius` | `0.62` |  |
| `threshold` | `0.88` |  |

### `ads`

| key | value | meaning |
|---|---|---|
| `atlasCols` | `6` | Advertising atlas grid. The whole ad network is one texture; every billboard is an instance that picks a tile. |
| `atlasRows` | `4` |  |
| `tileW` | `512` | Atlas tile size in pixels. The tiles are painted procedurally at load time 鈥?there are no image files in this project. |
| `tileH` | `256` |  |
| `holoShare` | `0.22` | Fraction of signs promoted to volumetric holograms. |
| `dynamic` | `true` |  |

### `npc`

| key | value | meaning |
|---|---|---|
| `count` | `9000` | Population. Simulated entirely in the vertex shader from a baked path atlas 鈥?the CPU never touches an individual agent. |
| `pathPoints` | `12` | Waypoints per baked path. Must stay 鈮?16: the crowd vertex shader unrolls this loop. |
| `maxPaths` | `2600` | How many distinct walks to bake into the path texture. |
| `nearCount` | `700` | Size of the articulated low-poly tier that follows the camera. The rest of the crowd is drawn as SDF billboards. |
| `nearRadius` | `150` |  |

#### `npc.occupations[]`

| key | value | meaning |
|---|---|---|
| `id` | `"hacker"` |  |
| `label` | `"黑客"` |  |
| `color` | `"#67ffd4"` |  |
| `weight` | `0.05` |  |

### `environment`

| key | value | meaning |
|---|---|---|
| `cables` | `true` |  |
| `acUnits` | `true` |  |
| `pipes` | `true` |  |
| `drones` | `true` |  |
| `cameras` | `true` |  |
| `trash` | `true` |  |
| `vendors` | `true` |  |
| `vendingMachines` | `true` |  |
| `steam` | `true` |  |
| `puddles` | `true` |  |
| `holograms` | `true` |  |
| `reflection` | `true` |  |
| `reflectionResolution` | `512` |  |

### `weather`

| key | value | meaning |
|---|---|---|
| `default` | `"rain"` |  |
| `autoCycle` | `true` |  |
| `transitionSeconds` | `22` | Blend time between weather states. States cross-fade; they never snap. |

##### `weather.types.clear`

| key | value | meaning |
|---|---|---|
| `label` | `"晴天 CLEAR"` |  |
| `fog` | `0.00055` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.05` |  |
| `sun` | `1` | Attenuation applied to the sun/moon term. |
| `wet` | `0.06` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#0a0f1e"` |  |
| `wind` | `0.25` |  |

##### `weather.types.overcast`

| key | value | meaning |
|---|---|---|
| `label` | `"阴天 OVERCAST"` |  |
| `fog` | `0.0011` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.72` |  |
| `sun` | `0.45` | Attenuation applied to the sun/moon term. |
| `wet` | `0.18` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#12161f"` |  |
| `wind` | `0.5` |  |

##### `weather.types.rain`

| key | value | meaning |
|---|---|---|
| `label` | `"雨天 RAIN"` |  |
| `fog` | `0.00165` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0.42` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.88` |  |
| `sun` | `0.28` | Attenuation applied to the sun/moon term. |
| `wet` | `0.82` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#0d1622"` |  |
| `wind` | `0.7` |  |

##### `weather.types.storm`

| key | value | meaning |
|---|---|---|
| `label` | `"暴雨 STORM"` |  |
| `fog` | `0.00285` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `1` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `1` |  |
| `sun` | `0.14` | Attenuation applied to the sun/moon term. |
| `wet` | `1` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#101a26"` |  |
| `wind` | `1.5` |  |
| `lightning` | `true` |  |

##### `weather.types.fog`

| key | value | meaning |
|---|---|---|
| `label` | `"雾天 FOG"` |  |
| `fog` | `0.0062` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.6` |  |
| `sun` | `0.3` | Attenuation applied to the sun/moon term. |
| `wet` | `0.34` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#1a2028"` |  |
| `wind` | `0.15` |  |

##### `weather.types.acid`

| key | value | meaning |
|---|---|---|
| `label` | `"酸雨 ACID RAIN"` |  |
| `fog` | `0.0023` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0.55` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.95` |  |
| `sun` | `0.18` | Attenuation applied to the sun/moon term. |
| `wet` | `0.9` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#16240f"` |  |
| `wind` | `0.9` |  |
| `acid` | `true` |  |

##### `weather.types.dust`

| key | value | meaning |
|---|---|---|
| `label` | `"沙尘 SANDSTORM"` |  |
| `fog` | `0.0048` | Fog density. Drives visibility far more than draw distance does. |
| `rain` | `0` | Precipitation amount, 0鈥?. Scales the live particle count. |
| `cloud` | `0.8` |  |
| `sun` | `0.22` | Attenuation applied to the sun/moon term. |
| `wet` | `0.02` | Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is. |
| `tint` | `"#2a1f10"` |  |
| `wind` | `2.2` |  |
| `dust` | `true` |  |

### `render`

| key | value | meaning |
|---|---|---|
| `fov` | `72` |  |
| `near` | `0.35` |  |
| `far` | `4200` | Absolute far plane. |
| `shadows` | `false` |  |
| `maxPixelRatio` | `1.6` | Pixel-ratio ceiling. Dynamic resolution scaling operates below this. |

##### `render.qualityTiers.ultra`

| key | value | meaning |
|---|---|---|
| `drawDistance` | `2600` | Far plane per quality tier. Fog usually hides the cut long before this matters. |
| `npcScale` | `1` | Population multiplier per tier. |
| `rainParticles` | `26000` |  |
| `bloom` | `true` | Whether the bloom pass runs. |
| `reflection` | `true` | Whether the planar wet-surface reflection is rendered. It is a second scene pass, so it is the first thing dropped. |
| `decals` | `1` |  |

##### `render.qualityTiers.high`

| key | value | meaning |
|---|---|---|
| `drawDistance` | `2000` | Far plane per quality tier. Fog usually hides the cut long before this matters. |
| `npcScale` | `0.7` | Population multiplier per tier. |
| `rainParticles` | `17000` |  |
| `bloom` | `true` | Whether the bloom pass runs. |
| `reflection` | `true` | Whether the planar wet-surface reflection is rendered. It is a second scene pass, so it is the first thing dropped. |
| `decals` | `0.8` |  |

##### `render.qualityTiers.medium`

| key | value | meaning |
|---|---|---|
| `drawDistance` | `1400` | Far plane per quality tier. Fog usually hides the cut long before this matters. |
| `npcScale` | `0.4` | Population multiplier per tier. |
| `rainParticles` | `9000` |  |
| `bloom` | `true` | Whether the bloom pass runs. |
| `reflection` | `false` | Whether the planar wet-surface reflection is rendered. It is a second scene pass, so it is the first thing dropped. |
| `decals` | `0.55` |  |

##### `render.qualityTiers.low`

| key | value | meaning |
|---|---|---|
| `drawDistance` | `900` | Far plane per quality tier. Fog usually hides the cut long before this matters. |
| `npcScale` | `0.16` | Population multiplier per tier. |
| `rainParticles` | `4000` |  |
| `bloom` | `false` | Whether the bloom pass runs. |
| `reflection` | `false` | Whether the planar wet-surface reflection is rendered. It is a second scene pass, so it is the first thing dropped. |
| `decals` | `0.25` |  |

### `controls`

| key | value | meaning |
|---|---|---|
| `walkSpeed` | `4.4` | First-person walking speed, m/s. |
| `runSpeed` | `11` |  |
| `flySpeed` | `46` | Free-flight speed, m/s. |
| `flyBoost` | `220` |  |
| `eyeHeight` | `1.72` |  |
| `mouseSensitivity` | `0.0022` |  |
| `topdownHeight` | `900` | Initial survey-camera distance, metres. |
| `defaultMode` | `"topdown"` |  |
