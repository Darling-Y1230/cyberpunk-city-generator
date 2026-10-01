// =====================================================================
//  common.glsl — shared GLSL chunks for every NEO-KOWLOON material.
//  Included via `#include "common"` and inlined by tools/build-shaders.mjs
// =====================================================================

#ifndef NEON_MAX
#define NEON_MAX 12
#endif

uniform vec3  uNeonPos[NEON_MAX];
uniform vec3  uNeonCol[NEON_MAX];
uniform float uNeonRange[NEON_MAX];
uniform int   uNeonCount;

uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogFalloff;
uniform vec3  uSkyUp;
uniform vec3  uSkyDown;
// Integrated artificial light of the whole city. A real megacity is an
// integrating sphere: every façade is lit by a hundred thousand tubes it never
// sees. Without this the masses read as black silhouettes at night.
uniform vec3  uCityGlow;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uDayFactor;    // 0 = deep night, 1 = noon
uniform float uNightFactor;  // 1 = deep night, 0 = noon
uniform float uWetness;      // 0..1 road/air humidity
uniform float uTime;
uniform float uAcid;         // acid-rain grade
uniform float uExposure;

// ---------------------------------------------------------------- hash
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; a *= 0.5; p *= 2.03; }
  return s / max(n, 1e-4);
}
float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * hash13(floor(p)); n += a; a *= 0.5; p *= 2.03; }
  return s / max(n, 1e-4);
}

// ---------------------------------------------------------------- colour
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 srgbToLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }

// ---------------------------------------------------------------- neon point pool
// 12-ish closest霓虹 emitters are uploaded each frame and shaded per-pixel.
vec3 neonLights(vec3 wp, vec3 n, float rough, float gain) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < NEON_MAX; i++) {
    if (i >= uNeonCount) break;
    vec3 d = uNeonPos[i] - wp;
    float dd = dot(d, d);
    float r = uNeonRange[i];
    if (dd > r * r) continue;
    float dl = sqrt(dd) + 1e-3;
    vec3 l = d / dl;
    float ndl = max(dot(n, l), 0.0) * 0.75 + 0.25;
    float att = 1.0 - dl / r;
    att *= att * att;
    acc += uNeonCol[i] * ndl * att * gain * (1.0 + rough * 1.4);
  }
  return acc;
}

// ---------------------------------------------------------------- atmosphere
vec3 skyAmbient(vec3 n) {
  float t = n.y * 0.5 + 0.5;
  return mix(uSkyDown, uSkyUp, t);
}

vec3 applyFog(vec3 color, vec3 wp) {
  float d = length(wp - cameraPosition);
  float lowland = exp(-max(wp.y - uFogBase, 0.0) * uFogFalloff);
  float dens = uFogDensity * (0.30 + 0.70 * lowland);
  float f = 1.0 - exp(-dens * dens * d * d);
  // acid rain eats contrast with a sickly green-grey veil
  vec3 fc = uFogColor;
  if (uAcid > 0.001) fc = mix(fc, vec3(0.10, 0.16, 0.07), uAcid * 0.6);
  return mix(color, fc, clamp(f, 0.0, 1.0));
}

// Cheap ACES-ish filmic curve; keeps neon highlights from clipping to white.
vec3 tonemap(vec3 x) {
  x *= uExposure;
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Signed distance to an axis-aligned box, in world space. Used for cheap
// analytic ambient occlusion against the street canyon.
float boxAO(vec3 p, vec3 c, vec3 h) {
  vec3 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

