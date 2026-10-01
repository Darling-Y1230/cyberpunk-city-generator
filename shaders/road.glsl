// =====================================================================
//  road.glsl — street surface, sidewalks, lots, wasteland, water, decks.
//  Planar-reflection aware: the generator owns a mirrored render pass and
//  hands this material a texture matrix, so wet asphalt actually mirrors the
//  neon above it instead of faking it.
//
//  mode 0 asphalt   1 sidewalk/concrete   2 dirt/wasteland
//  mode 3 water     4 metal deck          5 plaza tile
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aRoad;   // level, direction(0=x,1=z), width, seed
uniform mat4 uReflectMatrix;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vRoad;
varying vec4 vReflect;

void main() {
  vUv = uv;
  vRoad = aRoad;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vReflect = uReflectMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
#endif

#ifdef FRAGMENT
uniform sampler2D uReflectMap;
uniform float uReflectStrength;
uniform int   uMode;
uniform vec3  uTint;
uniform float uPuddle;
uniform float uReflectReady;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vRoad;
varying vec4 vReflect;

void main() {
  float level = vRoad.x;
  float dir   = vRoad.y;
  float rw    = vRoad.z;
  float seed  = vRoad.w;

  vec3 N = normalize(vNormal);
  vec3 albedo = uTint;
  vec3 emissive = vec3(0.0);
  float rough = 0.85;
  float metal = 0.0;

  vec2 uv = vUv;

  // ------------------------------------------------------------ surfaces
  if (uMode == 0) {
    // asphalt: aggregate grain plus long tar seams
    float grain = fbm(uv * 3.1 + seed * 17.0, 4);
    albedo = uTint * (0.72 + 0.5 * grain);
    float seam = smoothstep(0.965, 1.0, fract(uv.y * 0.08 + seed));
    albedo *= 1.0 - 0.35 * seam;

    // ---- lane markings -------------------------------------------------
    float halfW = rw * 0.5;
    float x = uv.x;                       // signed across-road coord (m)
    float y = uv.y;                       // along-road coord (m)
    float lanes = max(2.0, floor(rw / 3.6));
    float laneW = rw / lanes;
    float mark = 0.0;
    float side = step(0.0, x) * 2.0 - 1.0;
    float ax = abs(x);
    // edge line + dashed lane dividers
    mark += (1.0 - smoothstep(0.14, 0.24, abs(ax - (halfW - 0.9))));
    for (int i = 1; i < 8; i++) {
      float fi = float(i);
      if (fi >= lanes) break;
      float lx = -halfW + fi * laneW;
      float dash = step(0.42, fract(y / 7.0));
      mark += (1.0 - smoothstep(0.10, 0.18, abs(x - lx))) * dash;
    }
    // centre double line
    mark += (1.0 - smoothstep(0.10, 0.16, abs(ax - 0.35))) * 0.9;
    float wear = 0.45 + 0.55 * fbm(uv * 0.7 + 3.0, 3);
    vec3 paint = vec3(0.85, 0.86, 0.80) * 0.16;
    albedo = mix(albedo, paint, clamp(mark, 0.0, 1.0) * wear);
    // crossing stripes near intersections handled by geometry (zebra quads)
    rough = 0.78;
  } else if (uMode == 1) {
    float tile = step(0.94, fract(uv.x / 1.6)) + step(0.94, fract(uv.y / 1.6));
    albedo = uTint * (1.0 - 0.22 * clamp(tile, 0.0, 1.0));
    albedo *= 0.82 + 0.36 * fbm(uv * 1.1 + seed, 4);
    rough = 0.9;
  } else if (uMode == 2) {
    float n = fbm(uv * 0.35 + seed * 6.0, 5);
    albedo = mix(vec3(0.10, 0.088, 0.070), vec3(0.20, 0.17, 0.13), n);
    float cracks = smoothstep(0.72, 0.78, fbm(uv * 0.9 + 11.0, 4));
    albedo *= 1.0 - 0.5 * cracks;
    rough = 0.96;
  } else if (uMode == 3) {
    // harbour water — animated normals, oil film, reflected skyline
    vec2 w = uv * 0.06;
    float n1 = fbm(w + vec2(uTime * 0.035, uTime * 0.021), 4);
    float n2 = fbm(w * 2.7 - vec2(uTime * 0.055, uTime * 0.012), 3);
    N = normalize(vec3((n1 - 0.5) * 0.55, 1.0, (n2 - 0.5) * 0.55));
    float oil = smoothstep(0.55, 0.95, fbm(uv * 0.09 + 3.0, 4));
    albedo = mix(vec3(0.008, 0.014, 0.026), vec3(0.05, 0.02, 0.09), oil);
    rough = 0.06;
    metal = 1.0;
  } else if (uMode == 4) {
    float plate = step(0.97, fract(uv.x / 2.4)) + step(0.97, fract(uv.y / 2.4));
    albedo = uTint * (0.85 + 0.3 * fbm(uv * 2.0, 3)) * (1.0 - 0.4 * clamp(plate, 0.0, 1.0));
    rough = 0.5; metal = 0.75;
  } else if (uMode == 5) {
    float g1 = step(0.96, fract(uv.x / 3.0)) + step(0.96, fract(uv.y / 3.0));
    albedo = uTint * (1.0 - 0.3 * clamp(g1, 0.0, 1.0)) * (0.8 + 0.4 * fbm(uv * 0.8, 3));
    rough = 0.55; metal = 0.2;
  }

  // ------------------------------------------------------------ puddles
  float puddle = 0.0;
  if (uMode == 0 || uMode == 1 || uMode == 2) {
    float pm = fbm(uv * 0.24 + seed * 31.0, 4);
    puddle = smoothstep(0.46, 0.66, pm) * uPuddle;
    puddle *= smoothstep(0.30, 0.75, fbm(uv * 0.7 + 5.0, 3));
    albedo = mix(albedo, albedo * 0.24, puddle);
    rough = mix(rough, 0.03, puddle);
    metal = mix(metal, 1.0, puddle);
  }

  // ------------------------------------------------------------ lighting
  float ndl = max(dot(N, normalize(uSunDir)), 0.0);
  vec3 sun = uSunColor * ndl * (0.4 + 0.6 * uDayFactor);
  vec3 amb = skyAmbient(N) * mix(0.20, 0.70, uDayFactor);
  vec3 col = albedo * (sun + amb);
  col += albedo * uCityGlow * 0.9;
  col += albedo * neonLights(vWorld + N * 1.5, N, rough, 1.35);

  // emissive inlays: road studs, luminous lane edges on arterials
  if (uMode == 0 && level < 1.5) {
    float stud = smoothstep(0.92, 1.0, fract(uv.y / 12.0)) *
                 (1.0 - smoothstep(0.55, 0.95, abs(abs(uv.x) - (rw * 0.5 - 0.6))));
    emissive += vec3(0.12, 0.55, 1.0) * stud * 1.6;
  }
  col += emissive;

  // ------------------------------------------------------------ reflection
  float refl = (1.0 - rough) * uReflectStrength * uReflectReady;
  if (refl > 0.01 && vReflect.w > 0.0) {
    vec2 ruv = vReflect.xy / vReflect.w;
    // perturb by surface + puddle normals so the mirror ripples
    vec2 jitter = (N.xz - vec2(0.0, 1.0)) * (0.06 + 0.35 * puddle);
    jitter += vec2(fbm(uv * 0.9 + uTime * 0.25, 3) - 0.5) * 0.004;
    ruv += jitter;
    ruv = clamp(ruv, vec2(0.001), vec2(0.999));
    vec3 rc = texture2D(uReflectMap, ruv).rgb;
    // chroma smear: sample the channels at slightly different offsets
    rc.r = texture2D(uReflectMap, ruv + vec2(0.0016, 0.0)).r;
    rc.b = texture2D(uReflectMap, ruv - vec2(0.0016, 0.0)).b;
    float fres = pow(1.0 - clamp(dot(N, normalize(cameraPosition - vWorld)), 0.0, 1.0), 3.0);
    col = mix(col, col * 0.25 + rc * (1.4 + 2.2 * puddle), clamp(refl * (0.35 + 0.65 * fres), 0.0, 0.94));
  }

  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
#endif

