import * as THREE from 'three';
import { clamp } from './grid.js';

/**
 * Four camera modes over one shared rig.
 *
 *   fly      — free 6-DOF spectating, no collision (the default establishing view)
 *   topdown  — city-builder survey camera: pan, orbit and zoom
 *   fps      — eye-level walking with grid collision and kerb/terrain following
 *   tps      — third-person boom over the same walker
 *
 * Collision is answered by the same rasters the generator used, so if you can
 * see a wall you cannot walk through it, and the subnet has its own layer.
 */
export const MODES = ['topdown', 'fly', 'fps', 'tps'];

export class CameraRig {
  constructor(camera, cfg, plan, buildings, vertical) {
    this.camera = camera;
    this.cfg = cfg;
    this.plan = plan;
    this.buildings = buildings;
    this.vertical = vertical;

    this.mode = cfg.controls.defaultMode || 'topdown';
    this.position = new THREE.Vector3(0, 0, 0);   // the walker / pivot
    this.yaw = -Math.PI * 0.25;
    this.pitch = -0.12;
    this.velocity = new THREE.Vector3();
    this.flyBoost = false;
    this.flying = false;
    this.onGround = true;
    this.boom = 6.5;

    // top-down rig
    this.td = { dist: cfg.controls.topdownHeight, yaw: -Math.PI / 4, elev: 0.95, pan: new THREE.Vector3() };

    this.keys = new Set();
    this.pointerLocked = false;
    this.dragging = false;
    this.sensitivity = cfg.controls.mouseSensitivity;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3();

    this.spawn(plan);
    this._bind();
    this.apply(0);
  }

  spawn(plan) {
    // start on the best-connected arterial near the core
    this.position.set(0, plan.heightAt(0, 0) + this.cfg.controls.eyeHeight, 0);
    this.td.pan.set(0, 0, 0);
    this.td.dist = Math.min(this.cfg.controls.topdownHeight, plan.Rc * 1.85);
  }

  toggleFly() { this.flying = !this.flying; }

  setMode(m) {
    if (!MODES.includes(m) || m === this.mode) return;
    this.mode = m;
    if (m === 'topdown') { this.td.pan.set(this.position.x, 0, this.position.z); }
    if (m === 'fps' || m === 'tps') {
      this.position.y = this.plan.heightAt(this.position.x, this.position.z) + this.cfg.controls.eyeHeight;
    }
  }

  _bind() {
    const c = this.camera;
    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF' && (this.mode === 'fps' || this.mode === 'tps' || this.mode === 'fly')) this.toggleFly();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.pointerLocked) {
        this.yaw -= e.movementX * this.sensitivity;
        this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.45, 1.45);
      } else if (this.dragging) {
        if (this.mode === 'topdown') {
          this.td.yaw -= e.movementX * 0.005;
          this.td.elev = clamp(this.td.elev + e.movementY * 0.004, 0.16, 1.52);
        } else {
          this.yaw -= e.movementX * this.sensitivity * 0.8;
          this.pitch = clamp(this.pitch - e.movementY * this.sensitivity * 0.8, -1.45, 1.45);
        }
      }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        if (this.mode !== 'topdown' && !this.pointerLocked) this.requestLock();
        else this.dragging = true;
      }
      if (e.button === 2 || e.button === 1) this.dragging = true;
    };
    this._onMouseUp = () => { this.dragging = false; };
    this._onWheel = (e) => {
      if (this.mode === 'topdown') {
        this.td.dist = clamp(this.td.dist * (1 + Math.sign(e.deltaY) * 0.12), 40, 2600);
      } else {
        this.boom = clamp(this.boom + Math.sign(e.deltaY) * 0.8, 2.2, 34);
      }
      e.preventDefault();
    };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.camera.domElement ||
        document.pointerLockElement === document.body;
      if (!this.pointerLocked) this.keys.clear();
      this.onLockChange?.(this.pointerLocked);
    };
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock(canvas) {
    const el = canvas || document.body;
    el.requestPointerLock?.();
  }
  exitLock() { document.exitPointerLock?.(); }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  /* ---------------------------------------------------------------- */
  blocked(x, z, y) {
    const { plan, buildings, vertical } = this;
    if (vertical && y < -3 && vertical.underground) {
      const g = vertical.underground.gallery;
      const [cx, cy] = g.worldToCell(x, z);
      if (!g.inside(cx, cy)) return true;
      return g.get(cx, cy) === 0;
    }
    if (plan.isWater(x, z) && y < 1.2) return true;
    const s = buildings.solid;
    const [cx, cy] = s.worldToCell(x, z);
    if (!s.inside(cx, cy)) return true;
    const i = cy * s.cols + cx;
    if (s.data[i] && y < buildings.solidTop[i] - 0.4) return true;
    return false;
  }

  _tryMove(dx, dz, y) {
    const r = 0.42;
    const p = this.position;
    const ok = (nx, nz) =>
      !this.blocked(nx + r, nz, y) && !this.blocked(nx - r, nz, y) &&
      !this.blocked(nx, nz + r, y) && !this.blocked(nx, nz - r, y) &&
      !this.blocked(nx, nz, y);
    if (ok(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return; }
    if (ok(p.x + dx, p.z)) { p.x += dx; }
    if (ok(p.x, p.z + dz)) { p.z += dz; }
  }

  update(dt) {
    const K = this.keys;
    const C = this.cfg.controls;
    const shift = K.has('ShiftLeft') || K.has('ShiftRight');
    const fwd = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0);
    const strafe = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    const up = (K.has('Space') ? 1 : 0) - (K.has('ControlLeft') || K.has('KeyC') ? 1 : 0);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);

    if (this.mode === 'topdown') {
      const speed = (shift ? 300 : 110) * (this.td.dist / 600 + 0.35) * dt;
      const y = this.td.yaw;
      const fx = -Math.sin(y), fz = -Math.cos(y);
      const rx = Math.cos(y), rz = -Math.sin(y);
      this.td.pan.x += (fx * fwd + rx * strafe) * speed;
      this.td.pan.z += (fz * fwd + rz * strafe) * speed;
      const lim = this.plan.size * 0.62;
      this.td.pan.x = clamp(this.td.pan.x, -lim, lim);
      this.td.pan.z = clamp(this.td.pan.z, -lim, lim);
      if (K.has('KeyQ')) this.td.yaw += dt * 0.7;
      if (K.has('KeyE')) this.td.yaw -= dt * 0.7;
    } else if (this.mode === 'fly' || ((this.mode === 'fps' || this.mode === 'tps') && this.flying)) {
      const speed = (shift ? C.flyBoost : C.flySpeed) * dt;
      const fx = -sy * cp, fy = sp, fz = -cy * cp;
      this.position.x += (fx * fwd + cy * strafe) * speed;
      this.position.y += (fy * fwd + up) * speed;
      this.position.z += (fz * fwd + -sy * strafe) * speed;
      const lim = this.plan.size * 0.75;
      this.position.x = clamp(this.position.x, -lim, lim);
      this.position.z = clamp(this.position.z, -lim, lim);
      this.position.y = clamp(this.position.y, -120, this.cfg.world.skyCeiling);
    } else {
      const speed = (shift ? C.runSpeed : C.walkSpeed) * dt;
      const y = this.position.y;
      const dx = (-sy * fwd + cy * strafe) * speed;
      const dz = (-cy * fwd - sy * strafe) * speed;
      this._tryMove(dx, dz, y);
      // terrain following, step up to 0.65 m
      const gy = this.plan.heightAt(this.position.x, this.position.z) + C.eyeHeight;
      if (this.position.y < -3) {
        // inside the subnet: the floor is a flat slab
        this.position.y = (this.vertical?.underground?.y ?? -26) + C.eyeHeight;
      } else {
        this.position.y += clamp(gy - this.position.y, -14 * dt, 8 * dt);
      }
    }

    // head bob while walking on the ground
    this.bob = (this.mode === 'fps' || this.mode === 'tps')
      ? Math.sin(performance.now() * 0.009) * Math.min(0.05, Math.abs(fwd) + Math.abs(strafe)) * 0.9
      : 0;

    this.apply(dt);
  }

  _unusedShaftCell() { return [-1, -1]; }

  apply() {
    const cam = this.camera;
    if (this.mode === 'topdown') {
      const d = this.td.dist;
      const ce = Math.cos(this.td.elev), se = Math.sin(this.td.elev);
      cam.position.set(
        this.td.pan.x + d * ce * Math.sin(this.td.yaw),
        d * se,
        this.td.pan.z + d * ce * Math.cos(this.td.yaw));
      cam.lookAt(this.td.pan.x, 0, this.td.pan.z);
    } else if (this.mode === 'tps' && !this.flying) {
      const p = this.position;
      const d = this.boom;
      const tx = p.x + Math.sin(this.yaw) * d * Math.cos(this.pitch);
      const ty = p.y + 1.2 - Math.sin(this.pitch) * d;
      const tz = p.z + Math.cos(this.yaw) * d * Math.cos(this.pitch);
      cam.position.set(tx, Math.max(ty, this.plan.heightAt(tx, tz) + 0.6), tz);
      cam.lookAt(p.x, p.y + 0.9, p.z);
    } else {
      const p = this.position;
      cam.position.set(p.x, p.y + (this.bob || 0), p.z);
      const cp = Math.cos(this.pitch);
      cam.lookAt(
        p.x - Math.sin(this.yaw) * cp,
        p.y + (this.bob || 0) + Math.sin(this.pitch),
        p.z - Math.cos(this.yaw) * cp);
    }
  }
}
