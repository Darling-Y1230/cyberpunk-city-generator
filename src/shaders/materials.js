import * as THREE from 'three';
import { SHADERS } from './generated.js';

export const NEON_MAX = 12;

/**
 * Builds every material the city uses from a single shared uniform block, so
 * weather / time-of-day / neon changes cost one write instead of N.
 */
export class MaterialLibrary {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uCityGlow: { value: new THREE.Color(0.185, 0.150, 0.320) },
      uMoonDir: { value: new THREE.Vector3(-0.3, 0.8, -0.5).normalize() },
      uSunColor: { value: new THREE.Color(0.35, 0.45, 0.75) },
      uSkyUp: { value: new THREE.Color(0.03, 0.05, 0.11) },
      uSkyDown: { value: new THREE.Color(0.06, 0.04, 0.09) },
      uDayFactor: { value: 0.0 },
      uNightFactor: { value: 1.0 },
      uWetness: { value: 0.8 },
      uAcid: { value: 0.0 },
      uDust: { value: 0.0 },
      uExposure: { value: 1.0 },

      uFogColor: { value: new THREE.Color(0.05, 0.07, 0.11) },
      uFogDensity: { value: 0.0016 },
      uFogBase: { value: 6.0 },
      uFogFalloff: { value: 0.012 },

      uNeonPos: { value: Array.from({ length: NEON_MAX }, () => new THREE.Vector3()) },
      uNeonCol: { value: Array.from({ length: NEON_MAX }, () => new THREE.Color(0, 0, 0)) },
      uNeonRange: { value: new Float32Array(NEON_MAX).fill(1) },
      uNeonCount: { value: 0 },
      uNeonGain: { value: 1.0 },

      // sky-only
      uZenith: { value: new THREE.Color(0.02, 0.03, 0.07) },
      uHorizon: { value: new THREE.Color(0.10, 0.07, 0.13) },
      uGroundHaze: { value: new THREE.Color(0.06, 0.05, 0.07) },
      uPollution: { value: new THREE.Color(0.24, 0.10, 0.20) },
      uStars: { value: 1.0 },
      uCloud: { value: 0.85 },
      uCloudSpeed: { value: 1.0 },
      uSunDisc: { value: 0.0 },
      uLightning: { value: 0.0 },

      // rain-only
      uVolume: { value: new THREE.Vector3(46, 34, 46) },
      uWind: { value: new THREE.Vector3(1.6, 0, 0.6) },
      uFall: { value: 34.0 },
      uStreak: { value: 1.5 },
      uAmount: { value: 0.0 },
      uRainColor: { value: new THREE.Color(0.34, 0.46, 0.62) },

      // particle-only
      uRise: { value: 1.0 },
      uTurb: { value: 0.5 },

      // reflection
      uReflectMatrix: { value: new THREE.Matrix4() },
      uReflectMap: { value: null },
      uReflectStrength: { value: 0.75 },
      uReflectReady: { value: 0.0 },
      uPuddle: { value: 0.7 },

      // advertising
      uAtlas: { value: null },
      uAtlasCols: { value: 6 },
      uAtlasRows: { value: 4 },
      uBright: { value: 1.0 },
      uHoloStrength: { value: 1.0 },
      uAdDensity: { value: 1.0 },

      // crowd
      uPath: { value: null },
      uPathLen: { value: 1 },
      uPathCount: { value: 1 },
      uSpeedScale: { value: 1.0 },
      uNearRadius: { value: 150 },
      uCullRadius: { value: 320 },
      uOccColor: { value: Array.from({ length: 16 }, () => new THREE.Color(0.7, 0.7, 0.75)) },
    };
    this.cache = new Map();
    this.materials = [];
  }

  /**
   * Materials share the *same uniform objects* (so one write updates every
   * material) while getting their own `uMode` / `uTint` slot where a shader
   * needs a per-material constant.
   */
  _mk(key, shaderName, { defines = {}, extraUniforms = null, ...opts } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const s = SHADERS[shaderName];
    const uniforms = extraUniforms
      ? Object.assign(Object.create(null), this.uniforms, extraUniforms)
      : this.uniforms;
    const mat = new THREE.ShaderMaterial({
      vertexShader: s.vertex,
      fragmentShader: s.fragment,
      uniforms,
      defines: { ...defines },
      ...opts,
    });
    mat.userData.key = key;
    this.cache.set(key, mat);
    this.materials.push(mat);
    return mat;
  }

  /** Buildings / transit / props. mode: see shaders/surface.glsl */
  surface(mode = 0, tint = 0x3a3f4a) {
    return this._mk('surface' + mode + '_' + tint, 'surface', {
      extraUniforms: {
        uMode: { value: mode },
        uTint: { value: new THREE.Color(tint) },
        uSignBoost: { value: 0 },
      },
    });
  }

  /** Street surface. mode: see shaders/road.glsl */
  road(mode = 0, tint = 0x2a2c31) {
    return this._mk('road' + mode + '_' + tint, 'road', {
      extraUniforms: {
        uMode: { value: mode },
        uTint: { value: new THREE.Color(tint) },
      },
    });
  }

  neon() { return this._mk('neonSolid', 'neon'); }
  neonSolid() { return this._mk('neonSolid', 'neon'); }
  neonBlade() {
    return this._mk('neonBlade', 'neon', { side: THREE.DoubleSide });
  }
  neonHolo() {
    return this._mk('neonHolo', 'neon', {
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }
  /** Unlit structural dark for billboard frames and sign gantries. */
  frame() {
    return this._mk('frame', 'surface', {
      extraUniforms: { uMode: { value: 1 }, uTint: { value: new THREE.Color(0x0b0e14) }, uSignBoost: { value: 0 } },
    });
  }
  wire() { return this._mk('wire', 'wire'); }

  crowdFigure() {
    return this._mk('crowdFig', 'crowd', {
      defines: { CROWD_FIGURE: '' }, transparent: false,
    });
  }
  crowdBillboard() {
    return this._mk('crowdBill', 'crowd', { transparent: true, depthWrite: false });
  }
  rain() {
    return this._mk('rain', 'rain', {
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  particle() {
    return this._mk('particle', 'particle', {
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      extraUniforms: { uRelative: { value: 0 } },
    });
  }
  /** Camera-locked volumetric haze (sandstorm, smog, industrial dust). */
  haze() {
    return this._mk('haze', 'particle', {
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      extraUniforms: {
        uRelative: { value: 1 },
        uHazeVolume: { value: new THREE.Vector3(150, 50, 150) },
      },
    });
  }
  sky() {
    const m = this._mk('sky', 'sky');
    m.side = THREE.BackSide;
    m.depthWrite = false;
    m.depthTest = false;
    return m;
  }

  setTime(t) { this.uniforms.uTime.value = t; }

  dispose() { for (const m of this.materials) m.dispose(); this.materials.length = 0; this.cache.clear(); }
}

/**
 * The per-pixel neon pool. Each frame the N emitters closest to the camera are
 * uploaded; because the pool follows the viewer, the whole city appears to be
 * lit by thousands of lights at the cost of eight.
 */
export class NeonPool {
  constructor(lib, size = NEON_MAX) {
    this.lib = lib;
    this.size = size;
    this.sources = [];         // {x,y,z,r,color:THREE.Color,intensity}
    this._rank = [];
  }
  add(x, y, z, radius, color, intensity = 1) {
    this.sources.push({
      x, y, z, r: radius,
      c: color instanceof THREE.Color ? color : new THREE.Color(color),
      i: intensity,
    });
  }
  /** Cheap spatial pre-bucket so the per-frame scan stays linear-ish. */
  build() {
    this.grid = new Map();
    this.cell = 60;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      const k = this._key(s.x, s.z);
      let b = this.grid.get(k);
      if (!b) { b = []; this.grid.set(k, b); }
      b.push(i);
    }
    this._nearest = [];
  }
  _key(x, z) { return ((Math.floor(x / this.cell)) * 73856093) ^ ((Math.floor(z / this.cell)) * 19349663); }

  update(camPos) {
    const u = this.lib.uniforms;
    if (!this.grid || this.sources.length === 0) { u.uNeonCount.value = 0; return; }
    const r = 3; // search radius in cells (~180 m)
    const cand = this._nearest; cand.length = 0;
    const cx = Math.floor(camPos.x / this.cell), cz = Math.floor(camPos.z / this.cell);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const b = this.grid.get(((cx + dx) * 73856093) ^ ((cz + dz) * 19349663));
        if (b) for (const i of b) cand.push(i);
      }
    if (cand.length === 0) {
      for (let i = 0; i < this.sources.length; i++) cand.push(i);
    }
    // partial selection of the strongest + nearest emitters
    for (const i of cand) {
      const s = this.sources[i];
      const d = (s.x - camPos.x) ** 2 + (s.z - camPos.z) ** 2;
      s._s = s.i * s.r * s.r / (d + 1);
    }
    cand.sort((a, b) => this.sources[b]._s - this.sources[a]._s);
    const n = Math.min(this.size, cand.length);
    for (let k = 0; k < n; k++) {
      const s = this.sources[cand[k]];
      u.uNeonPos.value[k].set(s.x, s.y, s.z);
      u.uNeonCol.value[k].copy(s.c);
      u.uNeonRange.value[k] = s.r;
    }
    u.uNeonCount.value = n;
  }
}

