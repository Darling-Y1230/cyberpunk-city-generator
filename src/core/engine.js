import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from './grid.js';

/**
 * Renderer, post stack, planar reflection and adaptive resolution.
 *
 * Colour management is deliberately strict: every material writes *linear HDR*
 * (neon routinely exceeds 1.0), the bloom pass thresholds in linear space, and
 * a single OutputPass applies ACES and the sRGB transfer at the very end. That
 * is why the neon can be blindingly bright without clipping to white.
 */
export class Engine {
  constructor(canvas, cfg, opts = {}) {
    this.cfg = cfg;
    this.canvas = canvas;
    // Half-float render targets need a float-colourable attachment. When the
    // device cannot provide one the chain falls back to 8-bit and bloom is
    // switched off, which is a flatter image but a working one.
    this.hdr = opts.hdr !== false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.render.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      cfg.render.fov, window.innerWidth / window.innerHeight, cfg.render.near, cfg.render.far);

    this.quality = 'high';
    this.resolutionScale = 1;
    this._buildComposer();
    this._buildReflector();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _buildComposer() {
    const { renderer, scene, camera } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
      size.x, size.y, { type, samples: 0 }));
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const b = this.cfg.lighting.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), b.strength, b.radius, b.threshold);
    this.composer.addPass(this.bloom);
    if (!this.hdr) this.bloom.enabled = false;

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  _buildReflector() {
    const res = this.cfg.environment.reflectionResolution;
    this.reflectTarget = new THREE.WebGLRenderTarget(res, res, {
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.reflectTarget.texture.minFilter = THREE.LinearFilter;
    this.reflectTarget.texture.magFilter = THREE.LinearFilter;
    this.virtualCamera = new THREE.PerspectiveCamera();
    this.reflectMatrix = new THREE.Matrix4();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._planePos = new THREE.Vector3(0, 0, 0);
    this._rot = new THREE.Matrix4();
    this._view = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._hidden = [];
    this.frame = 0;
  }

  setQuality(tier) {
    const t = this.cfg.render.qualityTiers[tier];
    if (!t) return;
    this.quality = tier;
    this.camera.far = Math.max(1200, Math.min(this.cfg.render.far, t.drawDistance * 2.1));
    this.camera.updateProjectionMatrix();
    this.bloom.enabled = t.bloom;
    this.reflectionEnabled = t.reflection;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.cfg.render.maxPixelRatio));
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    this.bloom.setSize(size.x, size.y);
    this.outputPass.setSize?.(size.x, size.y);
    this._baseSize = size.clone();
  }

  /**
   * Renders the world mirrored through the ground plane. The road material
   * samples the result by screen-space UV, so wet asphalt actually reflects the
   * neon above it instead of faking a gradient.
   */
  updateReflection(uniforms, camPos) {
    if (!this.reflectionEnabled) { uniforms.uReflectReady.value = 0; return; }
    this.frame++;
    if (this.frame % 2 === 0) {
      const cam = this.camera;
      const n = this._normal;
      const rp = this._planePos;
      rp.set(0, camPos.y < 6 ? 0.0 : 0.0, 0);

      this._view.copy(rp).sub(cam.position);
      if (this._view.dot(n) > 0) { uniforms.uReflectReady.value = 0; return; }
      this._view.reflect(n).negate().add(rp);

      this._rot.extractRotation(cam.matrixWorld);
      this._lookAt.set(0, 0, -1).applyMatrix4(this._rot).add(cam.position);
      this._target.copy(rp).sub(this._lookAt);
      this._target.reflect(n).negate().add(rp);

      const vc = this.virtualCamera;
      vc.position.copy(this._view);
      vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
      vc.lookAt(this._target);
      vc.near = cam.near;
      vc.far = cam.far * 0.6;
      vc.updateMatrixWorld();
      vc.projectionMatrix.copy(cam.projectionMatrix);

      this.reflectMatrix.set(
        0.5, 0, 0, 0.5,
        0, 0.5, 0, 0.5,
        0, 0, 0.5, 0.5,
        0, 0, 0, 1);
      this.reflectMatrix.multiply(vc.projectionMatrix);
      this.reflectMatrix.multiply(vc.matrixWorldInverse);

      // oblique near plane so geometry behind the mirror is clipped away
      this._plane.setFromNormalAndCoplanarPoint(n, rp);
      this._plane.applyMatrix4(vc.matrixWorldInverse);
      this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
      const pm = vc.projectionMatrix;
      const q = this._q;
      q.x = (Math.sign(this._clip.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(this._clip.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      this._clip.multiplyScalar(2.0 / this._clip.dot(q));
      pm.elements[2] = this._clip.x;
      pm.elements[6] = this._clip.y;
      pm.elements[10] = this._clip.z + 1.0 - 0.003;
      pm.elements[14] = this._clip.w;

      // cheap passes are skipped in the mirror
      const skip = ['rain', 'particles', 'haze', 'crowd_billboard', 'crowd_figures'];
      for (const name of skip) {
        const o = this.scene.getObjectByName(name);
        if (o) { this._hidden.push([o, o.visible]); o.visible = false; }
      }
      const prevTarget = this.renderer.getRenderTarget();
      const prevAutoClear = this.renderer.autoClear;
      this.renderer.setRenderTarget(this.reflectTarget);
      this.renderer.autoClear = true;
      this.renderer.clear();
      this.renderer.render(this.scene, vc);
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.autoClear = prevAutoClear;
      for (const [o, v] of this._hidden) o.visible = v;
      this._hidden.length = 0;
    }
    uniforms.uReflectMatrix.value.copy(this.reflectMatrix);
    uniforms.uReflectMap.value = this.reflectTarget.texture;
    uniforms.uReflectReady.value = 1;
  }

  render() {
    this.renderer.info.reset();
    this.composer.render();
  }

  /** Drops internal resolution when the frame budget is blown. */
  adaptResolution(fps, target = 55) {
    if (fps < target * 0.7 && this.resolutionScale > 0.55) {
      this.resolutionScale = Math.max(0.55, this.resolutionScale - 0.06);
    } else if (fps > target * 1.15 && this.resolutionScale < 1) {
      this.resolutionScale = Math.min(1, this.resolutionScale + 0.03);
    } else return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.cfg.render.maxPixelRatio) * this.resolutionScale);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    this.bloom.setSize(size.x, size.y);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}

/** Small helper: FPS/ms sampler with a rolling window. */
export class FrameStats {
  constructor(n = 60) {
    this.samples = new Float32Array(n);
    this.i = 0;
    this.fps = 60;
    this.ms = 16.6;
  }
  push(dt) {
    this.samples[this.i] = dt;
    this.i = (this.i + 1) % this.samples.length;
    let s = 0;
    for (let k = 0; k < this.samples.length; k++) s += this.samples[k];
    const avg = s / this.samples.length;
    this.ms = avg * 1000;
    this.fps = avg > 0 ? 1 / avg : 0;
    return this.fps;
  }
}
