import * as THREE from 'three';
import CONFIG from './src/config.generated.js';
import { RNG, randomCityName } from './src/core/rng.js';
import { Engine, FrameStats } from './src/core/engine.js';
import { CameraRig } from './src/core/controls.js';
import { MaterialLibrary } from './src/shaders/materials.js';
import { ChunkSet } from './src/gen/optimize.js';
import { planCity } from './src/gen/planner.js';
import { generateRoads } from './src/gen/roads.js';
import { buildGround, GROUND_MODE } from './src/gen/ground.js';
import { generateBuildings } from './src/gen/buildings.js';
import { generateTransit } from './src/gen/transit.js';
import { generateVertical } from './src/gen/vertical.js';
import { generatePerimeter } from './src/gen/perimeter.js';
import { generateAds } from './src/gen/ads.js';
import { generateLighting } from './src/gen/lighting.js';
import { generateCrowd, generateTraffic } from './src/gen/npc.js';
import { generateDetails } from './src/gen/details.js';
import { validateCity } from './src/gen/validate.js';
import { DayNight } from './src/world/daynight.js';
import { Weather, buildHaze } from './src/world/weather.js';
import { Sky } from './src/world/sky.js';
import { HUD } from './src/ui/hud.js';
import { Minimap } from './src/ui/minimap.js';
import { HORIZONTAL_IDS } from './src/gen/districts.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Capability probe.
 *
 * The single-file build is meant to be handed to someone else's laptop, so it
 * has to explain itself when the machine cannot run it rather than showing a
 * black canvas. It also detects a software rasteriser: SwiftShader renders this
 * city at ~30 fps, so those machines start on `low` instead of pretending.
 */
function probeWebGL() {
  const diag = {
    userAgent: navigator.userAgent,
    webgl2: false, webgl1: false, hdrRenderable: false,
    renderer: '(unavailable)', vendor: '(unavailable)', software: false,
  };
  let gl = null;
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (gl2) { gl = gl2; diag.webgl2 = true; } else {
      const gl1 = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl1) { gl = gl1; diag.webgl1 = true; }
    }
    if (!gl) return { ok: false, diag, reason: 'WebGL 上下文创建失败（浏览器未启用或驱动不支持）' };

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      diag.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      diag.vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
    } else {
      diag.renderer = String(gl.getParameter(gl.RENDERER) || '');
      diag.vendor = String(gl.getParameter(gl.VENDOR) || '');
    }
    diag.software = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen|virtualbox|vmware svga/i
      .test(diag.renderer + ' ' + diag.vendor);

    // The post-processing chain renders into half-float targets, which needs a
    // float-colourable attachment. Without it the composer silently produces a
    // black frame, so it is probed rather than assumed.
    diag.hdrRenderable = !!(gl.getExtension('EXT_color_buffer_float')
      || gl.getExtension('EXT_color_buffer_half_float'));

    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return { ok: true, diag, reason: null };
  } catch (e) {
    return { ok: false, diag, reason: 'WebGL 探测异常：' + (e && e.message ? e.message : String(e)) };
  }
}

function showFatal(msg, diag) {
  const box = document.getElementById('fatal');
  const m = document.getElementById('fatal-msg');
  const d = document.getElementById('fatal-diag');
  if (m) m.textContent = msg;
  if (d) {
    d.textContent = Object.entries(diag || {})
      .map(([k, v]) => `${k}: ${v}`).join('   ·   ');
  }
  if (box) box.hidden = false;
  const loader = document.querySelector('.loader');
  if (loader) loader.classList.add('gone');
}

function toast(html, ms = 9000) {
  const el = document.getElementById('toast');
  const msg = document.getElementById('toast-msg');
  if (!el || !msg) return;
  msg.innerHTML = html;
  el.classList.add('on');
  if (ms > 0) setTimeout(() => el.classList.remove('on'), ms);
}

/**
 * Guard for generator context objects. A missing `materials` used to fail deep
 * inside a PropInstancer — or, worse, silently produce a light pool wired to
 * nothing — so every stage now validates its inputs up front and names what is
 * missing.
 */
function ctxOf(name, obj, required) {
  const missing = required.filter((k) => obj[k] === undefined || obj[k] === null);
  if (missing.length) throw new Error(`[${name}] missing context: ${missing.join(', ')}`);
  return obj;
}

class App {
  constructor(opts = {}) {
    this.cfg = JSON.parse(JSON.stringify(CONFIG));
    this.cfg.render.initialQuality = opts.quality || 'high';
    this.capability = opts.capability || { ok: true, diag: {} };
    this.initialQuality = this.cfg.render.initialQuality;
    this.hdr = opts.hdr !== false;
    this.canvas = document.getElementById('view');
    this.materials = new MaterialLibrary();
    this.engine = new Engine(this.canvas, this.cfg, { hdr: this.hdr });
    this.stats = new FrameStats(90);
    this.root = new THREE.Group();
    this.root.name = 'city';
    this.engine.scene.add(this.root);
    this.clock = new THREE.Clock();
    this.generation = 0;
    this._crowdTimer = 0;
    this.flags = { reflection: true, bloom: true, rain: true, fog: true, holograms: true, minimap: true, cables: true, steam: true, crowd: true };
    this.hud = new HUD(this.cfg, {
      onMode: (m) => this.rig.setMode(m),
      onQuality: (q) => this.setQuality(q),
      onWeather: (w) => { this.weather.locked = true; this.weather.set(w); },
      onWeatherAuto: (v) => { this.weather.autoCycle = v; this.weather.locked = !v; },
      onTime: (t) => { this.daynight.auto = false; this.daynight.setTime(t); },
      onTimeCycle: (v) => { this.daynight.auto = v; },
      onFlag: (k, v) => this.setFlag(k, v),
      onRegenerate: (o) => this.regenerate(o),
      onNPC: (n) => this.regenerate({ npc: n }),
      getNPC: () => this.cfg.npc.count,
    });
    this.bindKeys();
    this.setQuality(this.initialQuality);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.code) {
        case 'Digit1': this.rig.setMode('topdown'); this.hud._activate(this.hud.controls.querySelectorAll('.group')[0].querySelectorAll('.chip')[0]); break;
        case 'Digit2': this.rig.setMode('fly'); break;
        case 'Digit3': this.rig.setMode('fps'); break;
        case 'Digit4': this.rig.setMode('tps'); break;
        case 'KeyL': this.daynight.auto = !this.daynight.auto; break;
        case 'KeyH': this.hud.toggle(); break;
        case 'KeyR': if (!e.ctrlKey && !e.metaKey) this.regenerate({}); break;
        default: break;
      }
    });
  }

  setQuality(q) {
    this.engine.setQuality(q);
    this.flags.reflection = this.cfg.render.qualityTiers[q].reflection;
  }

  setFlag(k, v) {
    this.flags[k] = v;
    const u = this.materials.uniforms;
    switch (k) {
      case 'reflection': this.engine.reflectionEnabled = v; break;
      case 'bloom': this.engine.bloom.enabled = v; break;
      case 'rain': if (this.weatherObj) this.weatherObj.rain.visible = v; break;
      case 'fog': u.uFogDensity.value = v ? this._fogBase ?? u.uFogDensity.value : 0.00002; break;
      case 'holograms': for (const m of (this.adMeshes || [])) if (m.name.includes('holo')) m.visible = v; break;
      case 'minimap': this.hud.root.querySelector('.minimap-panel').style.display = v ? '' : 'none'; break;
      case 'cables': if (this.details?.cableMesh) this.details.cableMesh.visible = v; break;
      case 'steam': if (this.details?.particleMesh) this.details.particleMesh.visible = v; break;
      case 'crowd': if (this.crowd) this.crowd.group.visible = v; break;
      default: break;
    }
  }

  /* ================================================================ *
   * GENERATION PIPELINE (the ten agents)
   * ================================================================ */
  async generate(seedText, sizeOverride, npcCount) {
    const t0 = performance.now();
    this.generation++;
    const cfg = this.cfg;
    const seed = seedText || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
    const rng = new RNG(seed, 'city');
    this.seed = seed;
    this.cityName = randomCityName(rng.derive('name'));

    // map size
    const sizes = cfg.world.mapSizeChoices;
    cfg.world.mapSize = sizeOverride && sizeOverride !== 'random'
      ? parseInt(sizeOverride, 10)
      : rng.pick(sizes);
    if (npcCount) cfg.npc.count = Math.max(cfg.npc.countRange[0], Math.min(cfg.npc.countRange[1], npcCount));

    this.disposeCity();
    this.hud.status('生成中 · ' + this.cityName + ' · ' + cfg.world.mapSize + '×' + cfg.world.mapSize);

    const S = cfg.world.mapSize;
    const T = {};
    const tick = (name, fn) => { const t = performance.now(); const v = fn(); T[name] = Math.round(performance.now() - t); return v; };

    /* ---- Agent 1 ---- */
    this.hud.step(0, '运行中');
    await nextFrame();
    const plan = tick('planner', () => planCity(cfg, rng.derive('planner')));
    this.hud.step(0, '完成');

    /* ---- Agent 2 ---- */
    this.hud.step(1, '运行中');
    await nextFrame();
    const roads = tick('roads', () => generateRoads(cfg, rng.derive('roads'), plan));
    this.hud.step(1, '完成');

    /* ---- ground ---- */
    const groundChunks = new ChunkSet(S / 6, 'ground');
    this.hud.status('铺设地表与路面…');
    await nextFrame();
    const ground = tick('ground', () => buildGround(cfg, rng.derive('ground'), plan, roads, groundChunks));

    /* ---- Agent 3 ---- */
    this.hud.step(2, '运行中');
    await nextFrame();
    const buildingChunks = new ChunkSet(S / 6, 'mass');
    const buildings = tick('buildings', () => generateBuildings(cfg, rng.derive('buildings'), plan, roads, buildingChunks));
    this.hud.step(2, '完成');

    /* ---- Agent 4 ---- */
    this.hud.step(3, '运行中');
    await nextFrame();
    const transit = tick('transit', () => generateTransit(cfg, rng.derive('transit'), plan, roads, buildings, buildingChunks, buildings.propReqs));
    this.hud.step(3, '完成');

    /* ---- vertical districts ---- */
    this.hud.status('构建空中城区与地下城区…');
    await nextFrame();
    const vertical = tick('vertical', () => generateVertical(cfg, rng.derive('vertical'), plan, roads, buildings, buildingChunks, transit));

    /* ---- perimeter ---- */
    this.hud.status('生成城市边缘衰减带…');
    await nextFrame();
    const perimeter = tick('perimeter', () => generatePerimeter(cfg, rng.derive('perimeter'), plan, roads, buildings, buildingChunks, buildings.propReqs));

    /* ---- Agent 6 (ads) runs before lighting so signs feed the light pool ---- */
    this.hud.step(5, '运行中');
    await nextFrame();
    const adCtx = ctxOf('Agent 6 · ads', {
      buildings, adAnchors: buildings.adAnchors, corporations: buildings.corporations,
      materials: this.materials,
    }, ['buildings', 'adAnchors', 'corporations', 'materials']);
    const ads = tick('ads', () => generateAds(cfg, rng.derive('ads'), adCtx));
    ads.anchors = buildings.adAnchors;
    this.adMeshes = ads.meshes;
    this.hud.step(5, '完成');

    /* ---- Agent 5 ---- */
    this.hud.step(4, '运行中');
    await nextFrame();
    const lightCtx = ctxOf('Agent 5 · lighting', {
      plan, roads, buildings, transit, vertical, adInfo: ads, materials: this.materials,
    }, ['plan', 'roads', 'buildings', 'transit', 'materials']);
    const lighting = tick('lighting', () => generateLighting(cfg, rng.derive('lighting'), lightCtx));
    this.hud.step(4, '完成');

    /* ---- Agent 7 ---- */
    this.hud.step(6, '运行中');
    await nextFrame();
    const crowdCtx = ctxOf('Agent 7 · population', { plan, roads, materials: this.materials },
      ['plan', 'roads', 'materials']);
    const crowd = tick('crowd', () => generateCrowd(cfg, rng.derive('crowd'), crowdCtx));
    const traffic = tick('traffic', () => generateTraffic(
      cfg, rng.derive('traffic'), ctxOf('Agent 7 · traffic', { materials: this.materials }, ['materials']), transit));
    this.hud.step(6, '完成');

    /* ---- Agent 8 ---- */
    this.hud.step(7, '运行中');
    await nextFrame();
    const detailCtx = ctxOf('Agent 8 · environment',
      { plan, roads, buildings, lighting, transit, materials: this.materials },
      ['plan', 'roads', 'buildings', 'lighting', 'transit', 'materials']);
    const details = tick('details', () => generateDetails(cfg, rng.derive('details'), detailCtx));
    this.hud.step(7, '完成');

    /* ---- Agent 10: bake the batched meshes ---- */
    this.hud.step(9, '运行中');
    await nextFrame();
    const massMeshes = tick('bakeMass', () => buildingChunks.finalize((mode) => this.materials.surface(mode, SURFACE_TINTS[mode] ?? 0x3a3f4a), this.root));
    const groundMeshes = tick('bakeGround', () => groundChunks.finalize((mode) => this.materials.road(mode, GROUND_TINTS[mode]), this.root));
    ground.water.material = this.materials.road(GROUND_MODE.WATER, 0x081420);
    ground.water.renderOrder = -5;
    this.root.add(ground.water);
    for (const m of ads.meshes) this.root.add(m);
    this.root.add(crowd.group);
    this.root.add(traffic.group);
    for (const m of details.propMeshes) this.root.add(m);
    if (details.cableMesh) this.root.add(details.cableMesh);
    if (details.particleMesh) this.root.add(details.particleMesh);
    this.hud.step(9, '完成');

    /* ---- world systems ---- */
    this.weatherObj = new Weather(this.materials, cfg, rng.derive('weather'));
    this.root.add(this.weatherObj.rain);
    this.haze = buildHaze(cfg, rng.derive('haze'), this.materials);
    this.root.add(this.haze);
    this._fogBase = this.materials.uniforms.uFogDensity.value;

    /* ---- Agent 9 ---- */
    this.hud.step(8, '运行中');
    await nextFrame();
    const report = validateCity(cfg, plan, roads, buildings, transit, ads, crowd, lighting, details, vertical);
    report.summary.tris = massMeshes.length + groundMeshes.length;
    this.hud.setReport(report);
    this.hud.step(8, '完成');

    this.world = { plan, roads, buildings, transit, vertical, perimeter, ads, lighting, crowd, traffic, details, ground, report };

    /* ---- rig + minimap ---- */
    this.rig = new CameraRig(this.engine.camera, cfg, plan, buildings, vertical);
    this.rig.setMode(cfg.controls.defaultMode);
    this.minimap = new Minimap(this.hud.mmCanvas, cfg);
    this.minimap.bake(cfg, plan, roads, buildings, vertical);
    this.entities = {
      airLanes: transit.airLanes, maglevLines: transit.maglev.lines, corporations: buildings.corporations,
    };

    this.materials.uniforms.uPath.value = crowd.pathTex;
    this.materials.uniforms.uPathLen.value = crowd.pathPoints;
    this.materials.uniforms.uPathCount.value = crowd.rows;
    this.materials.uniforms.uAtlas.value = ads.atlas.texture;
    this.materials.uniforms.uAtlasCols.value = ads.atlas.cols;
    this.materials.uniforms.uAtlasRows.value = ads.atlas.rows;

    this.hud.hideLoader();
    this.lastTimings = T;
    const ms = (performance.now() - t0).toFixed(0);
    const slowest = Object.entries(T).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `${k}=${v}ms`).join(' ');
    console.log(`[${this.cityName}] seed=${seed} ${S}×${S} built in ${ms} ms — ${report.verdict} — ${slowest}`);
    console.log('TIMINGS ' + JSON.stringify(T));
    console.table(report.checks.map((c) => ({ check: c.id, ok: c.ok, value: c.value, target: c.target })));
    this.hud.brandTitle.textContent = this.cityName;
    this.hud.brandSub.textContent = `SEED ${seed} · ${S}×${S} m · ${report.summary.buildings.toLocaleString()} STRUCTURES · ${report.verdict}`;
    return report;
  }

  disposeCity() {
    if (this.rig) { this.rig.dispose(); this.rig = null; }
    const disposeTree = (o) => {
      o.traverse?.((n) => {
        if (n.geometry) n.geometry.dispose();
      });
    };
    disposeTree(this.root);
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    // materials are pooled and reused across generations
  }

  regenerate(opts = {}) {
    const seed = opts.seed || null;
    const size = opts.size || this.cfg.world.mapSize;
    const npc = opts.npc || 0;
    this.hud.loader?.classList.remove('gone');
    this.generate(seed, size, npc).catch((e) => {
      console.error(e);
      this.hud.status('生成失败: ' + e.message);
    });
  }

  /* ================================================================ *
   * FRAME LOOP
   * ================================================================ */
  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.world || !this.rig) return;   // mid-regeneration: the old rig is gone
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      const u = this.materials.uniforms;
      u.uTime.value = t;

      const { plan, roads, buildings, crowd, traffic, lighting, details, transit } = this.world;

      this.daynight.update(dt);
      this.weatherObj.update(dt, this.engine.camera.position);
      this.daynight.setWeather({
        tint: this.weatherObj.state.tint,
        sun: this.weatherObj.state.sun,
        fog: this.weatherObj.state.fog,
      });
      // fog can be disabled by the user
      if (!this.flags.fog) u.uFogDensity.value = 0.00002;
      else u.uFogDensity.value = this.weatherObj.state.fog * (this.daynight.nightFactor * 0.35 + 0.65);

      this.rig.update(dt);
      this.sky.update(dt, this.engine.camera.position, this.weatherObj.state, t);

      // haze only appears when the air is thick
      const hazeAmt = (this.weatherObj.state.dust ? 1 : 0) * 0.9 + (this.weatherObj.state.wind > 0.8 ? 0.25 : 0);
      this.haze.geometry.instanceCount = Math.round(6000 * Math.min(hazeAmt, 1));
      u.uRise.value = 0.6 + this.weatherObj.state.wind * 0.9;

      lighting.pool.update(this.engine.camera.position);
      this.engine.updateReflection(u, this.engine.camera.position);

      for (const s of traffic.swarms) s.update(dt);

      // hero crowd follows the viewer
      this._crowdTimer -= dt;
      if (this._crowdTimer <= 0) {
        this._crowdTimer = 1.6;
        const pos = this.rig.mode === 'topdown'
          ? new THREE.Vector3(this.rig.td.pan.x, 0, this.rig.td.pan.z)
          : this.rig.position;
        crowd.repoint(pos);
      }

      this.engine.render();

      const fps = this.stats.push(dt);
      if (this.generation > 0 && (this._frames = (this._frames || 0) + 1) % 30 === 0) {
        this.engine.adaptResolution(fps, this.cfg.render.qualityTiers[this.engine.quality].bloom ? 55 : 45);
      }

      const info = this.engine.renderer.info.render;
      const p = this.rig.mode === 'topdown' ? this.rig.td.pan : this.rig.position;
      this.hud.update({
        fps, ms: this.stats.ms, calls: info.calls, tris: info.triangles,
        npc: crowd.total,
        district: this.districtLabel(p.x, p.z),
        weather: this.weatherObj.label,
        time: this.daynight.label, timeRaw: this.daynight.time,
        coords: `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`,
      });
      if (this.flags.minimap) this.minimap.draw(this.engine.camera, this.rig, plan, this.weatherObj, this.daynight, this.entities);
    };
    loop();
  }

  districtLabel(x, z) {
    const d = this.world.plan.districtAt(x, z);
    const id = HORIZONTAL_IDS[d];
    const spec = this.cfg.districts.specs[id];
    return spec ? spec.label.split(' ')[0] : '—';
  }

  /**
   * Aim the camera at a world position — the standard (x, y, z) order.
   * Used by the capture harness and the console; not part of gameplay.
   */
  lookAt(x, y, z) {
    const p = this.rig.mode === 'topdown' ? this.rig.td.pan : this.rig.position;
    const dx = x - p.x, dz = z - p.z;
    this.rig.yaw = Math.atan2(-dx, -dz);
    if (y !== undefined) {
      this.rig.pitch = Math.atan2(y - p.y, Math.hypot(dx, dz) || 1e-3);
    }
    this.rig.apply();
    return { yaw: this.rig.yaw, pitch: this.rig.pitch };
  }

  /** Put the camera inside the subnet's largest lit chamber. Capture-convenience. */
  gotoSubnet() {
    const u = this.world && this.world.vertical && this.world.vertical.underground;
    if (!u || !u.rooms.length) return null;
    // biggest room = best lit, and the most representative of the programme mix
    const room = u.rooms.slice().sort((a, b) => b.w * b.d - a.w * a.d)[0];
    const ey = u.y + room.h * 0.44;
    // stand in one corner and look diagonally across, so the ceiling strips,
    // the fit-out and two walls are all in frame
    this.rig.setMode('fly');
    this.rig.position.set(room.x - room.w * 0.34, ey, room.z - room.d * 0.34);
    this.lookAt(room.x + room.w * 0.30, ey - 0.4, room.z + room.d * 0.30);
    return { room, depth: u.y, shafts: u.shafts.length };
  }
}

/* ------------------------------------------------------------------ */
const SURFACE_TINTS = {
  0: 0x46516a,   // curtain wall
  1: 0x6e6c64,   // concrete
  2: 0x2a2140,   // emissive architecture
  3: 0x726d60,   // sheet metal
  4: 0x2a3242,   // glass monolith
};
const GROUND_TINTS = {
  0: 0x24262c,   // asphalt
  1: 0x4c4e52,   // footway concrete
  2: 0x3a3226,   // wasteland
  3: 0x061019,   // water
  4: 0x2e3138,   // metal deck
  5: 0x8d8f92,   // plaza tile (crosswalk paint)
};

/* ------------------------------------------------------------------ */
const support = probeWebGL();
if (!support.ok) {
  showFatal(support.reason, support.diag);
  console.error('NEO-KOWLOON cannot start:', support.reason, support.diag);
} else {
  const { software, webgl2, hdrRenderable, renderer } = support.diag;
  const app = new App({
    capability: support,
    quality: software ? 'low' : 'high',
    hdr: hdrRenderable,
  });
  app.daynight = new DayNight(app.materials, app.cfg, new RNG('clock', 'world'));
  app.sky = new Sky(app.materials, app.cfg, new RNG('sky', 'world'));
  app.engine.scene.add(app.sky.mesh);
  window.__CITY = app;

  console.log(`[capability] webgl2=${webgl2} hdr=${hdrRenderable} software=${software} renderer="${renderer}"`);
  if (software) {
    toast('<b>检测到软件渲染</b>（' + renderer + '）：已自动切换到 <b>LOW</b> 画质。'
      + '开启浏览器硬件加速后重开可恢复完整画质。');
  } else if (!hdrRenderable) {
    toast('<b>此设备不支持 HDR 渲染缓冲</b>：已关闭泛光并降级为 8 位输出，画面会略平，其余功能正常。');
  }

  const params = new URLSearchParams(location.search);
  app.generate(params.get('seed'), params.get('size')).then(() => {
    const m = params.get('mode');
    if (m) app.rig.setMode(m);
    const wx = params.get('weather');
    if (wx) { app.weatherObj.locked = true; app.weatherObj.set(wx, true); }
    const tt = parseFloat(params.get('t'));
    if (!Number.isNaN(tt)) app.daynight.setTime(tt);
    const q = params.get('q');
    if (q) { app.setQuality(q); app.hud.activateQuality(q); }
    if (params.get('nohud') === '1') {
      app.hud.root.style.display = 'none';
      document.getElementById('vignette').style.display = 'none';
      document.getElementById('grade').style.display = 'none';
    }
    app.start();
  }).catch((e) => {
    console.error(e);
    showFatal('生成阶段出错：' + (e && e.message ? e.message : String(e)), support.diag);
  });
}
