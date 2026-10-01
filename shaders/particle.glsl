// =====================================================================
//  particle.glsl — steam, smoke, dust, sparks, holographic motes and
//  drone navigation lights. One instanced quad, one draw call, thousands of
//  emitters. Fragments are noise-warped so plumes read as volume, not discs.
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aP;    // x, y, z, size
attribute vec4 aP2;   // seed, rise, life, type
attribute vec2 aQuad;
attribute vec3 aTint;

uniform float uRise;      // global multiplier (weather driven)
uniform float uTurb;
uniform float uRelative;  // 1 = positions are a camera-locked volume (haze)
uniform vec3  uHazeVolume;

varying vec2  vUv;
varying float vFade;
varying float vSeed;
varying float vType;
varying vec3  vTint;
varying vec3  vWorld;

void main() {
  vUv = aQuad;
  vSeed = aP2.x;
  vType = aP2.w;
  vTint = aTint;

  float life = aP2.z;
  float t = fract(uTime / life + aP2.x);      // 0..1 lifetime phase
  float ease = t;

  vec3 world;
  if (uRelative > 0.5) {
    // ambient haze: a box of motes that wraps around the viewer
    vec3 rel = aP.xyz * uHazeVolume;
    rel.x += uTime * 1.6;
    rel.z += uTime * 0.7;
    world = cameraPosition + mod(rel + uHazeVolume, uHazeVolume * 2.0) - uHazeVolume;
    world.y -= uHazeVolume.y * 0.35;
  } else {
    world = aP.xyz;
  }
  world.y += ease * aP2.y * uRise;
  // turbulent drift
  world.x += sin(uTime * 0.6 + aP2.x * 40.0) * uTurb * (0.4 + ease) * aP2.y * 0.35;
  world.z += cos(uTime * 0.5 + aP2.x * 27.0) * uTurb * (0.4 + ease) * aP2.y * 0.35;

  float size = aP.w * (0.35 + ease * 1.65) * (vType > 2.5 ? 0.35 : 1.0);

  // billboard toward camera
  vec3 toCam = normalize(cameraPosition - world);
  vec3 up = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 upv = cross(toCam, up);
  world += up * aQuad.x * size + upv * aQuad.y * size;

  vWorld = world;
  vFade = sin(t * 3.14159);
  vFade *= 1.0 - smoothstep(140.0, 260.0, length(world - cameraPosition));

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
#endif

#ifdef FRAGMENT
varying vec2  vUv;
varying float vFade;
varying float vSeed;
varying float vType;
varying vec3  vTint;
varying vec3  vWorld;

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;

  // two octaves of warped alpha give the plume a ragged edge
  float n = fbm(vUv * 1.9 + vec2(vSeed * 30.0, uTime * 0.05), 4);
  float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.75);
  a *= vFade;

  vec3 col = vTint;

  if (vType < 0.5) {
    // steam — nearly white, catches the neon above it
    col = mix(vec3(0.62, 0.68, 0.78), vec3(1.0), n * 0.4);
    a *= 0.34;
  } else if (vType < 1.5) {
    // smoke / soot
    col = mix(vec3(0.05, 0.05, 0.06), vec3(0.16, 0.14, 0.13), n);
    a *= 0.55;
  } else if (vType < 2.5) {
    // dust
    col = mix(vec3(0.34, 0.26, 0.15), vec3(0.52, 0.42, 0.27), n);
    a *= 0.30;
  } else if (vType < 3.5) {
    // spark / ember — additive
    col = mix(vec3(1.6, 0.55, 0.12), vec3(1.9, 1.1, 0.4), n);
    a *= 0.75;
  } else {
    // holographic mote
    col = vTint * 1.8;
    a *= 0.25;
  }

  col += col * neonLights(vWorld, vec3(0.0, 1.0, 0.0), 1.0, 0.55) * 0.6;
  col = applyFog(col, vWorld);

  gl_FragColor = vec4(col * a, a);
}
#endif
