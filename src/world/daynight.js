import * as THREE from 'three';

/**
 * Day / night cycle.
 *
 * The city is authored for the night — 95 % of its illumination is its own —
 * so daylight here is deliberately overcast and cold, the way a smog-bound
 * megacity actually receives it. Everything the shaders need lives in the
 * shared uniform block, so a time change is a handful of writes.
 */
export class DayNight {
  constructor(lib, cfg, rng) {
    this.lib = lib;
    this.cfg = cfg;
    this.time = cfg.lighting.defaultTime;
    this.speed = 0;                 // hours per second; 0 = frozen
    this.autoSpeed = 0.06;
    this.auto = false;
    this.tilt = rng.float(-0.5, 0.5);
    this.azimuth = rng.float(0, Math.PI * 2);
    this._sun = new THREE.Vector3();
    this._moon = new THREE.Vector3();
    this._skyUp = new THREE.Color();
    this._skyDown = new THREE.Color();
    this._fog = new THREE.Color();
    this._sunCol = new THREE.Color();
    this.weatherTint = new THREE.Color('#0d1622');
    this.weatherSun = 1;
    this.weatherFog = 1;
    this.apply();
  }

  setTime(t) { this.time = ((t % 24) + 24) % 24; this.apply(); }
  addHours(h) { this.setTime(this.time + h); }

  update(dt) {
    if (this.auto) this.setTime(this.time + (this.speed || this.autoSpeed) * dt);
    else if (this.speed !== 0) this.setTime(this.time + this.speed * dt);
  }

  get isNight() { return this.nightFactor > 0.5; }
  get label() {
    const h = Math.floor(this.time), m = Math.floor((this.time % 1) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  apply() {
    const t = this.time;
    const theta = ((t - 6) / 12) * Math.PI;
    const ct = Math.cos(theta), st = Math.sin(theta);
    this._sun.set(ct * Math.cos(this.tilt), st, ct * Math.sin(this.tilt)).normalize();
    this._moon.copy(this._sun).multiplyScalar(-1);
    if (this._moon.y < 0.05) this._moon.set(-this._sun.x * 0.4, 0.8, -this._sun.z * 0.4).normalize();

    // 0 at night, 1 at solar noon; softened so dusk lingers
    const elev = this._sun.y;
    const raw = THREE.MathUtils.clamp((elev + 0.12) / 0.5, 0, 1);
    const day = raw * raw * (3 - 2 * raw);
    this.dayFactor = day;
    this.nightFactor = 1 - day;

    // sky palette: the city pours its own light into the clouds all night
    const nightZenith = new THREE.Color('#05070f');
    const nightHorizon = new THREE.Color('#191029');
    const dayZenith = new THREE.Color('#3c4759');
    const dayHorizon = new THREE.Color('#8e949e');
    this._skyUp.copy(nightZenith).lerp(dayZenith, day);
    this._skyDown.copy(nightHorizon).lerp(dayHorizon, day);

    // artificial light pollution is strongest after dark
    const poll = 0.18 + 0.82 * this.nightFactor;

    this._sunCol.setRGB(
      (0.10 + 0.85 * day) * (1 - 0.25 * (1 - day)),
      (0.13 + 0.86 * day) * (1 - 0.20 * (1 - day)),
      (0.22 + 0.84 * day),
    );

    const u = this.lib.uniforms;
    u.uSunDir.value.copy(this._sun);
    u.uMoonDir.value.copy(this._moon);
    u.uSunColor.value.copy(this._sunCol).multiplyScalar(this.weatherSun);
    u.uSkyUp.value.copy(this._skyUp);
    u.uSkyDown.value.copy(this._skyDown);
    u.uDayFactor.value = day;
    u.uNightFactor.value = this.nightFactor;

    u.uZenith.value.copy(this._skyUp);
    u.uHorizon.value.copy(this._skyDown);
    u.uGroundHaze.value.copy(this._skyDown).multiplyScalar(0.5);
    u.uPollution.value.setRGB(0.30 * poll, 0.10 * poll, 0.26 * poll);
    u.uStars.value = this.nightFactor;
    u.uSunDisc.value = 1 - this.nightFactor * 0.85;

    // fog colour follows sky + weather tint
    this._fog.copy(this._skyDown).lerp(this.weatherTint, 0.55).multiplyScalar(0.6 + 0.4 * day);
    u.uFogColor.value.copy(this._fog);

    // artificial light dominates: at night the city is its own light source
    const glowNight = new THREE.Color(0.185, 0.150, 0.320);
    const glowDay = new THREE.Color(0.135, 0.145, 0.185);
    this._glow = this._glow || new THREE.Color();
    this._glow.copy(glowNight).lerp(glowDay, day);
    u.uCityGlow.value.copy(this._glow);

    // the natural 5 %: even at midnight a trace of moon survives
    const natural = 0.05;
    u.uSunColor.value.multiplyScalar(0.55 + 0.45 * day);
    u.uSkyUp.value.multiplyScalar(0.35 + 0.65 * day + natural * 0.2);

    this.sunDir = this._sun;
    this.moonDir = this._moon;
  }

  /** Weather drives the day/night layer through these multipliers. */
  setWeather({ tint, sun, fog }) {
    if (tint) this.weatherTint.set(tint);
    if (sun !== undefined) this.weatherSun = sun;
    if (fog !== undefined) this.weatherFog = fog;
    this.apply();
  }
}
