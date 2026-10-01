// =====================================================================
//  rain.glsl — GPU precipitation. Drops live in an axis-aligned volume that
//  is re-centred on the camera every frame, so the player can fly at 400 m
//  and never outrun the storm. Wind, acid grading and lightning are uniforms.
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aDrop;   // seedX, seedZ, seedY, speedScale
attribute vec2 aQuad;   // -1..1 across, 0..1 along

uniform vec3  uVolume;      // half extents around the camera
uniform vec3  uWind;
uniform float uFall;
uniform float uStreak;
uniform float uAmount;

varying vec2  vUv;
varying float vAlpha;
varying float vSpeed;

void main() {
  float sx = aDrop.x, sz = aDrop.y, sy = aDrop.z, sp = aDrop.w;
  vUv = aQuad;
  vSpeed = sp;

  vec3 base = vec3(sx, sy, sz) * uVolume * 2.0 - uVolume;
  // fall + wind drift, wrapped inside the volume
  base.y -= uTime * uFall * (0.7 + sp * 0.6);
  base.x += uTime * uWind.x * (0.5 + sp * 0.5);
  base.z += uTime * uWind.z * (0.5 + sp * 0.5);
  base = mod(base + uVolume, uVolume * 2.0) - uVolume;

  vec3 world = cameraPosition + base;
  vec3 dir = normalize(vec3(uWind.x * 0.35, -uFall, uWind.z * 0.35));
  float len = uStreak * (0.5 + sp);

  vec3 p0 = world;
  vec3 p1 = world + dir * len;

  vec3 viewDir = normalize(cameraPosition - p0);
  vec3 right = normalize(cross(dir, viewDir));

  float w = 0.014 + 0.020 * sp;
  vec3 p = mix(p0, p1, aQuad.y) + right * aQuad.x * w;

  float dist = length(p - cameraPosition);
  vAlpha = uAmount * (1.0 - smoothstep(28.0, 62.0, dist)) * smoothstep(0.4, 3.0, dist);
  vAlpha *= 1.0 - smoothstep(0.0, 0.06, abs(aQuad.x));

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
#endif

#ifdef FRAGMENT
uniform vec3  uRainColor;
uniform float uLightning;

varying vec2  vUv;
varying float vAlpha;
varying float vSpeed;

void main() {
  // taper the tail so the streak reads as a motion-blurred drop
  float t = vUv.y;
  float a = vAlpha * (1.0 - t) * smoothstep(0.0, 0.25, t);
  a *= 0.55 + 0.45 * vSpeed;
  if (a <= 0.002) discard;

  vec3 col = uRainColor * (0.7 + 0.6 * vSpeed);
  col += vec3(0.5, 0.58, 0.8) * uLightning * 1.5;

  // head of the drop is brightest
  col += uRainColor * smoothstep(0.75, 1.0, 1.0 - t) * 1.6;

  gl_FragColor = vec4(col * a, a);
}
#endif
