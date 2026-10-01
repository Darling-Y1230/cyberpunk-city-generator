// =====================================================================
//  wire.glsl — overhead cabling, utility pipes, maglev power rails, laundry
//  lines and drone tethers. Rendered as camera-expanded instanced quads so
//  they keep real thickness at any distance (WebGL has no fat lines).
//
//  aSegA/aSegB : segment endpoints (world)
//  aSegC       : (thickness, sag, seed, type)
//      type 0 = black rubber cable      1 = glowing data conduit
//      2 = steam pipe (lagged)          3 = laundry / tarp line
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec3 aSegA;
attribute vec3 aSegB;
attribute vec4 aSegC;
attribute vec2 aQuad;

varying vec2  vUv;
varying vec3  vWorld;
varying float vSeed;
varying float vType;

void main() {
  vUv = aQuad;
  vSeed = aSegC.z;
  vType = aSegC.w;

  float t = aQuad.y;
  vec3 p = mix(aSegA, aSegB, t);
  // catenary sag: 4t(1-t) peaks at mid-span
  p.y -= aSegC.y * 4.0 * t * (1.0 - t);

  vec3 dir = normalize(aSegB - aSegA);
  dir.y -= aSegC.y * 4.0 * (1.0 - 2.0 * t) / max(length(aSegB - aSegA), 0.01);
  dir = normalize(dir);

  vec3 toCam = normalize(cameraPosition - p);
  vec3 right = normalize(cross(dir, toCam));

  float thick = aSegC.x * (1.0 + 0.06 * sin(uTime * 1.3 + vSeed * 30.0));
  vec3 world = p + right * aQuad.x * thick;

  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
#endif

#ifdef FRAGMENT
varying vec2  vUv;
varying vec3  vWorld;
varying float vSeed;
varying float vType;

void main() {
  float edge = 1.0 - abs(vUv.x);
  if (edge < 0.05) discard;

  vec3 col;
  float emis = 0.0;

  if (vType < 0.5) {
    col = vec3(0.030, 0.028, 0.032);
    col *= 0.6 + 0.6 * edge;
  } else if (vType < 1.5) {
    col = vec3(0.03, 0.05, 0.06);
    float pulse = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * (2.0 + 3.0 * fract(vSeed * 7.0)));
    emis = pulse * edge * 0.9;
  } else if (vType < 2.5) {
    col = vec3(0.13, 0.125, 0.115);
    col *= 0.55 + 0.7 * edge;
  } else {
    col = vec3(0.35, 0.16, 0.22);
    col *= 0.5 + 0.8 * edge;
  }

  vec3 N = normalize(cameraPosition - vWorld);
  vec3 lit = col * (skyAmbient(vec3(0.0, 1.0, 0.0)) * mix(0.25, 0.8, uDayFactor)
                    + uSunColor * (0.25 + 0.75 * uDayFactor) * 0.5);
  lit += col * uCityGlow * 0.9;
  lit += col * neonLights(vWorld, N, 0.9, 1.2);

  if (emis > 0.0) lit += vec3(0.25, 0.85, 1.0) * emis * 0.55;

  lit = applyFog(lit, vWorld);
  gl_FragColor = vec4(lit, 1.0);
}
#endif
