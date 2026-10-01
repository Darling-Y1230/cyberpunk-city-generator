// =====================================================================
//  crowd.glsl — the population. Up to 50 000 agents walk a baked path graph
//  entirely on the GPU: the CPU only uploads a path texture once per
//  regeneration and a per-instance table. No per-frame matrix updates.
//
//  uPath texture : RGBA float, width = uPathLen, height = uPathCount
//                  texel = (worldX, worldY, worldZ, cumulativeDistance)
//  aNpc  = (pathIndex, distanceOffset, speed, occupationIndex)
//  aNpc2 = (heightScale, widthScale, seedPhase, flags)
//
//  default            -> cylindrical-billboard SDF pedestrian (mass crowd)
//  #define CROWD_FIGURE -> low-poly articulated figure (near / hero tier)
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aNpc;
attribute vec4 aNpc2;
#ifdef CROWD_FIGURE
attribute float aPart;
#endif

uniform vec3  uOccColor[16];
uniform sampler2D uPath;
uniform float uPathLen;
uniform float uPathCount;
uniform float uSpeedScale;
uniform float uNearRadius;
uniform float uCullRadius;

varying vec2  vUv;
varying vec3  vWorld;
varying vec3  vNormal;
varying vec3  vColor;
varying float vFade;
varying float vPhase;
varying float vSeed;

vec4 pathTexel(float i, float row) {
  return texture2D(uPath, vec2((i + 0.5) / uPathLen, (row + 0.5) / uPathCount));
}

void main() {
  float row   = aNpc.x;
  float off   = aNpc.y;
  float spd   = aNpc.z;
  float occ   = aNpc.w;
  float hS    = aNpc2.x;
  float wS    = aNpc2.y;
  float phase = aNpc2.z;
  float flags = aNpc2.w;

  vUv = uv;
  vSeed = phase;

  // ---- total path length is stored in the last texel -------------------
  float total = pathTexel(uPathLen - 1.0, row).w;
  float d = mod(off + uTime * spd * uSpeedScale, max(total, 0.5));

  // ---- walk the polyline ----------------------------------------------
  vec3 pA = pathTexel(0.0, row).xyz;
  vec3 pB = pathTexel(1.0, row).xyz;
  float tSeg = 0.0;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uPathLen - 1.0) break;
    float da = pathTexel(float(i), row).w;
    float db = pathTexel(float(i) + 1.0, row).w;
    if (d >= da && d <= db) {
      pA = pathTexel(float(i), row).xyz;
      pB = pathTexel(float(i) + 1.0, row).xyz;
      tSeg = (d - da) / max(db - da, 0.001);
      break;
    }
  }
  vec3 pos = mix(pA, pB, tSeg);
  vec3 fwd = normalize(pB - pA + vec3(0.0001, 0.0, 0.0001));

  // ---- personal space: lane offset + micro jitter ----------------------
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  float lane = (fract(phase * 7.13) - 0.5) * 3.0 * wS;
  pos += side * lane;
  pos.x += sin(uTime * 0.7 + phase * 30.0) * 0.12;
  pos.z += cos(uTime * 0.6 + phase * 22.0) * 0.12;

  // ---- distance culling / LOD fade ------------------------------------
  float dist = length(pos - cameraPosition);
  vFade = 1.0 - smoothstep(uCullRadius * 0.65, uCullRadius, dist);
  if (vFade <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vFade *= smoothstep(0.0, 6.0, dist) * 0.35 + 0.65;   // vanish right at the lens

  float height = (1.55 + (fract(phase * 3.77) - 0.5) * 0.30) * hS * mix(0.72, 1.0, step(0.5, vFade));

  // ---- occupation colour ----------------------------------------------
  vec3 c = uOccColor[int(occ)];
  c *= 0.75 + 0.5 * fract(phase * 11.7);
  vColor = c;

  // ---- basis -----------------------------------------------------------
#ifdef CROWD_FIGURE
  // articulated low-poly: legs swing around the hip
  float part = aPart;
  vec3 lp = position;
  float swing = sin(d * 2.6 + phase * 20.0) * 0.55;
  float side2 = (part > 1.5) ? 1.0 : -1.0;
  if (part > 0.5) {
    // pivot at hip (local y = 0.86), rotate about local X
    float pivotY = 0.86;
    float a = swing * side2;
    float cy = cos(a), sy = sin(a);
    float ly = lp.y - pivotY;
    float lz = lp.z;
    lp.y = pivotY + ly * cy - lz * sy;
    lp.z = ly * sy + lz * cy;
  }
  vec3 world = pos;
  world += side * lp.x;
  world.y += lp.y * height;
  world += fwd * lp.z;
  vec3 nrm = normal;
  vNormal = normalize(side * nrm.x + vec3(0.0, 1.0, 0.0) * nrm.y + fwd * nrm.z);
#else
  // cylindrical billboard
  vec3 viewDir = normalize(cameraPosition - pos);
  if (flags > 0.5) {
    // vehicles / drones keep a fixed heading
    side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vNormal = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  } else {
    side = normalize(cross(vec3(0.0, 1.0, 0.0), viewDir));
    vNormal = viewDir;
  }
  float width = 0.62 * wS * height;
  vec3 world = pos + side * (position.x * width) + vec3(0.0, position.y * height, 0.0);
#endif

  vWorld = world;
  vPhase = d;

  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
}
#endif

#ifdef FRAGMENT
uniform vec3  uOccColor[16];
uniform float uCullRadius;

varying vec2  vUv;
varying vec3  vWorld;
varying vec3  vNormal;
varying vec3  vColor;
varying float vFade;
varying float vPhase;
varying float vSeed;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float alpha = 1.0;
  vec3 col = vColor;
  float glow = 0.0;

#ifndef CROWD_FIGURE
  // ---- procedural pedestrian silhouette --------------------------------
  vec2 p = vUv;
  float stride = sin(vPhase * 2.6 + vSeed * 20.0);
  float bob = abs(sin(vPhase * 2.6 + vSeed * 20.0)) * 0.012;

  float body = sdSeg(p, vec2(0.5, 0.79 + bob), vec2(0.5, 0.50 + bob)) - 0.085;
  float head = length((p - vec2(0.5, 0.895 + bob)) * vec2(1.0, 1.08)) - 0.058;
  float legL = sdSeg(p, vec2(0.5, 0.50 + bob), vec2(0.5 + stride * 0.075, 0.045)) - 0.045;
  float legR = sdSeg(p, vec2(0.5, 0.50 + bob), vec2(0.5 - stride * 0.075, 0.045)) - 0.045;
  float armL = sdSeg(p, vec2(0.5, 0.76 + bob), vec2(0.5 - 0.09, 0.545 - stride * 0.03)) - 0.030;
  float armR = sdSeg(p, vec2(0.5, 0.76 + bob), vec2(0.5 + 0.09, 0.545 + stride * 0.03)) - 0.030;

  float d = min(min(body, head), min(min(legL, legR), min(armL, armR)));
  float silk = smoothstep(0.006, -0.006, d);
  if (silk <= 0.01) discard;

  // coat / jacket shading so the silhouette reads in 3D
  float shade = mix(0.55, 1.15, smoothstep(0.30, 0.80, p.y));
  shade *= mix(0.75, 1.0, smoothstep(0.0, 0.25, abs(p.x - 0.5) * 2.0));
  col *= shade;
  alpha = silk * vFade;

  // visor / handheld screen — a few citizens carry their own light
  float h = fract(vSeed * 53.7);
  if (h > 0.80) {
    float visor = smoothstep(0.030, 0.012, length((p - vec2(0.5, 0.898 + bob)) * vec2(1.0, 1.9)));
    glow += visor * 2.4;
  } else if (h > 0.68) {
    float phone = smoothstep(0.028, 0.010, length(p - vec2(0.5 - 0.115, 0.60)));
    glow += phone * 1.8;
  }
#else
  col *= 0.6 + 0.5 * clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
  float h = fract(vSeed * 53.7);
  if (h > 0.80) glow += 0.9;
#endif

  // ---- lighting --------------------------------------------------------
  vec3 N = normalize(vNormal);
  vec3 sun = uSunColor * max(dot(N, normalize(uSunDir)), 0.0) * (0.3 + 0.7 * uDayFactor);
  vec3 amb = skyAmbient(N) * mix(0.22, 0.75, uDayFactor);
  vec3 outc = col * (sun + amb) * 0.9;
  outc += col * uCityGlow * 1.05;
  outc += col * neonLights(vWorld, N, 0.8, 1.5);
  outc += vColor * glow * 2.2;

  // distance haze so the crowd dissolves into the atmosphere
  float dist = length(vWorld - cameraPosition);
  float haze = smoothstep(uCullRadius * 0.25, uCullRadius * 0.95, dist);
  outc = mix(outc, uFogColor, haze * 0.85);

  outc = applyFog(outc, vWorld);
  gl_FragColor = vec4(outc, alpha);
}
#endif
