import * as THREE from 'three';
import { instancedQuad } from '../../models/primitives.js';
import { clamp, lerp } from '../core/grid.js';

/**
 * Weather.
 *
 * Seven states — clear, overcast, rain, storm, fog, acid rain and sandstorm —
 * that blend rather than snap, and that genuinely drive the renderer: fog
 * density and colour, sun attenuation, surface wetness (which feeds the planar
 * reflection and the puddle mask), rain volume, lightning and wind for the
 * precipitation drift.
 *
 * The rain itself is a camera-locked volume of GPU streaks, so a player flying
 * at 500 m is still inside the storm.
 */
export class Weather {
  constructor(lib, cfg, rng) {
    this.lib = lib;
    this.cfg = cfg;
    this.rng = rng.derive('weather');
    this.types = cfg.weather.types;
    this.names = Object.keys(this.types);
    this.current = cfg.weather.default in this.types ? cfg.weather.default : 'rain';
    this.target = this.current;
    this.blend = 1;
    this.transition = cfg.weather.transitionSeconds;
    this.autoCycle = cfg.weather.autoCycle;
    this.cycleMin = cfg.weather.cycleSeconds[0];
    this.cycleMax = cfg.weather.cycleSeconds[1];
    this.timer = this.rng.float(this.cycleMin, this.cycleMax);
    this.state = this._decode(this.types[this.current]);
    this.from = this.state;
    this.to = this.state;
    this.time = 0;
    this.locked = false;
    this.windAngle = this.rng.float(0, Math.PI * 2);
    this._buildRain();
    this._apply();
  }

  _decode(t) {
    return {
      fog: t.fog, rain: t.rain, cloud: t.cloud, sun: t.sun,
      wet: t.wet, tint: new THREE.Color(t.tint), wind: t.wind,
      lightning: !!t.lightning, acid: !!t.acid, dust: !!t.dust,
      label: t.label,
    };
  }

  set(name, instant = false) {
    if (!this.types[name] || name === this.target) return;
    this.from = { ...this.state };
    this.target = name;
    this.to = this._decode(this.types[name]);
    this.blend = instant ? 1 : 0;
    this.time = 0;
    if (instant) this.state = this.to;
  }

  next() {
    const pool = this.names.filter((n) => n !== this.target);
    // weight toward atmosphere rather than always picking a clear night
    const w = pool.map((n) => (n === 'clear' ? 0.5 : n === 'dust' ? 0.7 : 1.4));
    let total = w.reduce((a, b) => a + b, 0), r = this.rng.next() * total, pick = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { pick = pool[i]; break; } }
    this.set(pick);
  }

  update(dt, camPos) {
    if (this.autoCycle && !this.locked) {
      this.timer -= dt;
      if (this.timer <= 0) { this.next(); this.timer = this.rng.float(this.cycleMin, this.cycleMax); }
    }
    if (this.blend < 1) {
      this.time += dt;
      this.blend = clamp(this.time / this.transition, 0, 1);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      const a = this.from, b = this.to;
      this.state = {
        fog: lerp(a.fog, b.fog, e),
        rain: lerp(a.rain, b.rain, e),
        cloud: lerp(a.cloud, b.cloud, e),
        sun: lerp(a.sun, b.sun, e),
        wet: lerp(a.wet, b.wet, e),
        wind: lerp(a.wind, b.wind, e),
        lightning: b.lightning,
        acid: lerp(a.acid ? 1 : 0, b.acid ? 1 : 0, e) > 0.5,
        dust: lerp(a.dust ? 1 : 0, b.dust ? 1 : 0, e) > 0.5,
        tint: a.tint.clone().lerp(b.tint, e),
        label: b.label,
      };
      if (this.blend >= 1) this.state = this.to;
    }
    this._moveRain(dt, camPos);
    this._apply();
  }

  _buildRain() {
    const max = this.cfg.render.qualityTiers.ultra.rainParticles;
    const geo = instancedQuad();
    const drops = new Float32Array(max * 4);
    const r = this.rng;
    for (let i = 0; i < max; i++) {
      drops.set([r.next(), r.next(), r.next(), r.float(0.35, 1.0)], i * 4);
    }
    geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(drops, 4));
    geo.instanceCount = 0;
    this.rain = new THREE.Mesh(geo, this.lib.rain());
    this.rain.name = 'rain';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;
    this.maxRain = max;
    this.setRainCount(this.cfg.render.qualityTiers.high.rainParticles);
  }

  setRainCount(n) {
    this.rainCount = Math.min(n, this.maxRain);
    this.rain.geometry.instanceCount = Math.round(this.rainCount * clamp(this.state?.rain ?? 0, 0, 1));
  }

  _moveRain(dt, camPos) {
    const u = this.lib.uniforms;
    const s = this.state;
    const amount = clamp(s.rain, 0, 1);
    u.uAmount.value = amount * 1.6;
    u.uWind.value.set(
      (0.5 + s.wind * 6) * Math.cos(this.windAngle ?? 0),
      0,
      (0.5 + s.wind * 6) * Math.sin(this.windAngle ?? 0));
    u.uFall.value = 30 + s.wind * 14;
    u.uStreak.value = 1.1 + s.wind * 1.2;
    u.uRainColor.value.setRGB(0.30, 0.44, 0.62).lerp(new THREE.Color(0.36, 0.72, 0.28), s.acid ? 0.7 : 0);
    // the volume follows the camera; radius shrinks in fog so drops stay visible
    const vol = u.uVolume.value;
    vol.set(58, 42, 58);
  }

  _apply() {
    const u = this.lib.uniforms;
    const s = this.state;
    u.uFogDensity.value = s.fog;
    u.uWetness.value = s.wet;
    u.uAcid.value = s.acid ? 1 : 0;
    u.uDust.value = 0;              // dust is a sky/particle effect
    u.uPuddle.value = clamp(s.wet * 1.15, 0, 1);
  }

  get label() { return this.state?.label || this.target; }
  get isWet() { return this.state.wet > 0.4; }
}

/**
 * Ambient dust/sand motes for the sandstorm and industrial haze. A second
 * particle layer so the weather reads even when it is not raining.
 */
export function buildHaze(cfg, rng, lib) {
  const geo = instancedQuad();
  const n = 6000;
  const aP = new Float32Array(n * 4);
  const aP2 = new Float32Array(n * 4);
  const aTint = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // normalised box coordinates; the shader expands them into a camera volume
    aP.set([rng.float(-1, 1), rng.float(0, 1), rng.float(-1, 1), rng.float(0.6, 3.2)], i * 4);
    aP2.set([rng.next(), rng.float(0.05, 0.4), rng.float(9, 22), 2], i * 4);
    aTint.set([0.34, 0.27, 0.16], i * 3);
  }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  geo.setAttribute('aP2', new THREE.InstancedBufferAttribute(aP2, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, lib.haze());
  mesh.name = 'haze';
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}
