import * as THREE from 'three';
import { HORIZONTAL_IDS } from '../gen/districts.js';

/**
 * Minimap.
 *
 * The base image is rasterised once per regeneration straight out of the same
 * buffers the generator used — zoning, carriageway class and building cover —
 * so the map can never disagree with the world. Only the live overlay (player,
 * heading, waypoints, air lanes) is redrawn per frame.
 */
export class Minimap {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.size = 200;
    this.zoom = 1;
    this.rotate = true;
    this.base = document.createElement('canvas');
    this.markers = [];
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.size * this._dpr;
    canvas.height = this.size * this._dpr;
  }

  /** Rasterise the static layer. */
  bake(cfg, plan, roads, buildings, vertical) {
    const R = plan.raster;
    const n = R.cols;
    const c = this.base;
    c.width = n; c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const d = img.data;

    const districtRGB = HORIZONTAL_IDS.map((id) => {
      const col = new THREE.Color(cfg.districts.specs[id].color);
      return [col.r * 255, col.g * 255, col.b * 255];
    });

    for (let i = 0; i < n * n; i++) {
      const cx = i % n, cy = (i / n) | 0;
      let r, gg, b;
      if (plan.water[i]) {
        r = 6; gg = 14; b = 26;
      } else {
        const did = plan.district[i];
        const col = districtRGB[did] || [120, 120, 130];
        const built = buildings.solid.data[i];
        const k = built ? 0.62 : 0.32;
        r = col[0] * k; gg = col[1] * k; b = col[2] * k;
        const rv = R.data[i];
        if (rv >= 1 && rv <= 3) {
          // carriageway: arterial brightest
          const t = rv === 1 ? 1.0 : rv === 2 ? 0.68 : 0.42;
          r = 40 + 200 * t; gg = 34 + 168 * t; b = 26 + 120 * t;
        } else if (rv === 4 || rv === 5) {
          r = 46; gg = 48; b = 54;
        }
      }
      const o = i * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);

    // the subnet, drawn as a schematic overlay
    if (vertical?.underground) {
      const G = vertical.underground.gallery;
      g.globalAlpha = 0.5;
      g.fillStyle = '#ff7a1a';
      const step = 1;
      for (let cy = 0; cy < G.rows; cy += step)
        for (let cx = 0; cx < G.cols; cx += step)
          if (G.data[cy * G.cols + cx] === 2) g.fillRect(cx, cy, 1, 1);
      g.globalAlpha = 1;
    }
  }

  draw(camera, rig, plan, weather, daynight, entities) {
    const ctx = this.ctx;
    const S = this.size * this._dpr;
    const n = this.base.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);

    const p = this.cfg.world.mapSize;
    const scale = (S / n) * this.zoom * (512 / p) * 2.2;

    const target = rig.mode === 'topdown'
      ? { x: rig.td.pan.x, z: rig.td.pan.z }
      : { x: rig.position.x, z: rig.position.z };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.clip();
    // background so edges never show through
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, S, S);

    ctx.translate(S / 2, S / 2);
    if (this.rotate) {
      const yaw = rig.mode === 'topdown' ? rig.td.yaw : rig.yaw;
      ctx.rotate(yaw);
    }
    ctx.scale(scale * (n / p), scale * (n / p));
    // world -> raster pixel: px = (x + p/2) / cell
    const toPx = (x) => (x + p / 2) / plan.cell;
    ctx.translate(-toPx(target.x), -toPx(target.z));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0);

    /* ---- live overlay ---- */
    const yaw = rig.mode === 'topdown' ? rig.td.yaw : rig.yaw;
    // air corridors
    ctx.lineWidth = 1.6 / (scale * n / p);
    for (const lane of (entities.airLanes || [])) {
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.beginPath();
      lane.path.pts.forEach((pt, i) => {
        const X = toPx(pt.x), Z = toPx(pt.z);
        i ? ctx.lineTo(X, Z) : ctx.moveTo(X, Z);
      });
      ctx.stroke();
    }
    // maglev
    for (const l of (entities.maglevLines || [])) {
      ctx.strokeStyle = 'rgba(255,120,220,0.55)';
      ctx.lineWidth = 2.4 / (scale * n / p);
      ctx.beginPath();
      ctx.moveTo(toPx(l.line.x0), toPx(l.line.z0));
      ctx.lineTo(toPx(l.line.x1), toPx(l.line.z1));
      ctx.stroke();
      for (const [sx, sz] of l.stations) {
        ctx.fillStyle = '#ffb3ec';
        ctx.beginPath();
        ctx.arc(toPx(sx), toPx(sz), 5 / (scale * n / p), 0, 6.283);
        ctx.fill();
      }
    }
    // corporate territories
    for (const c of (entities.corporations || [])) {
      ctx.strokeStyle = c.color + '66';
      ctx.lineWidth = 2 / (scale * n / p);
      ctx.beginPath();
      ctx.arc(toPx(c.x), toPx(c.z), c.radius / plan.cell, 0, 6.283);
      ctx.stroke();
    }
    // view cone
    ctx.save();
    ctx.translate(toPx(target.x), toPx(target.z));
    ctx.rotate(-yaw + Math.PI);
    const cone = 46 / plan.cell;
    const grd = ctx.createLinearGradient(0, 0, 0, -cone);
    grd.addColorStop(0, 'rgba(120,230,255,0.55)');
    grd.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, cone, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    /* ---- north arrow + frame ---- */
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(S - 20 * this._dpr, 20 * this._dpr);
    ctx.rotate(-(this.rotate ? yaw : 0));
    ctx.fillStyle = 'rgba(140,235,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -9 * this._dpr);
    ctx.lineTo(5 * this._dpr, 7 * this._dpr);
    ctx.lineTo(0, 3 * this._dpr);
    ctx.lineTo(-5 * this._dpr, 7 * this._dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Simple panel builder used by the HUD. */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
