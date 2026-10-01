import * as THREE from 'three';
import { fbm2 } from '../core/rng.js';

/**
 * Sky dome.
 *
 * A single off-centre sphere that tracks the camera and never writes depth. It
 * is where the megacity's atmosphere actually lives: the sodium/magenta light
 * dome bouncing off a low cloud deck, the acid-rain green shift, the sandstorm
 * ochre, and the sheet lightning of a big storm.
 */
export class Sky {
  constructor(lib, cfg, rng, radius = 3200) {
    this.lib = lib;
    const geo = new THREE.SphereGeometry(radius, 40, 24);
    this.mesh = new THREE.Mesh(geo, lib.sky());
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.onBeforeRender = () => { };
    this._lightning = 0;
    this._flashTimer = rng.float(4, 16);
    this._rng = rng.derive('sky');
    this.storminess = 0;
  }

  update(dt, camPos, weather, time) {
    this.mesh.position.copy(camPos);
    const u = this.lib.uniforms;
    u.uCloud.value = weather.cloud;
    u.uCloudSpeed.value = 0.6 + weather.wind * 1.6;
    u.uDust.value = weather.dust ? 1 : 0;
    u.uAcid.value = weather.acid ? 1 : 0;

    // sheet lightning during storms
    if (weather.lightning) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) {
        this._flashTimer = this._rng.float(2.5, 11);
        this._lightning = this._rng.float(0.35, 1.0);
      }
      this._lightning *= Math.pow(0.02, dt);
    } else {
      this._lightning *= Math.pow(0.05, dt);
    }
    u.uLightning.value = this._lightning;
  }

  get flash() { return this._lightning; }
}
