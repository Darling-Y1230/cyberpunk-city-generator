// =====================================================================
//  surface.glsl 鈥?buildings, megastructures, transit, props.
//  One material family, several modes, driven by per-vertex attributes.
//
//   mode 0 : curtain-wall tower      (window grid, setbacks, spires)
//   mode 1 : concrete / composite    (panel lines, grime)
//   mode 2 : emissive architecture   (neon strips, rooftop signage racks)
//   mode 3 : industrial sheet metal  (corrugation, soot, rust)
//   mode 4 : glass monolith          (data fortress, near-black, thin light seams)
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aData;   // seed, styleFlags, litRatio, emissive
attribute vec4 aData2;  // baseY, height, hue, dirt

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vData;
varying vec4 vData2;

void main() {
  vUv = uv;
  vData = aData;
  vData2 = aData2;

  vec4 wp = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);

  gl_Position = projectionMatrix * viewMatrix * wp;
}
#endif

#ifdef FRAGMENT
uniform int   uMode;
uniform vec3  uTint;
uniform float uNeonGain;
uniform float uSignBoost;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vData;
varying vec4 vData2;

void main() {
  float seed  = vData.x;
  float flags = vData.y;
  float litR  = vData.z;
  float emis  = vData.w;
  float baseY = vData2.x;
  float bh    = vData2.y;
  float hue   = vData2.z;
  float dirt  = vData2.w;

  vec2 uv = vUv;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;

  // ---------------------------------------------------------- facade grid
  float floorH = 3.5;
  vec3 albedo = uTint;
  vec3 emissive = vec3(0.0);
  float rough = 0.72;
  float metal = 0.05;

  vec2 cell = vec2(uv.x / 3.3, uv.y / floorH);
  vec2 g = fract(cell);
  vec2 cellId = floor(cell);

  float windowMask = 0.0;
  float lit = 0.0;
  vec3  winTint = vec3(1.0);

  if (uMode == 0 || uMode == 4) {
    // ---- curtain wall -------------------------------------------------
    float insetX = uMode == 4 ? 0.34 : 0.26;
    float insetY = uMode == 4 ? 0.38 : 0.33;
    windowMask = step(insetX, g.x) * step(g.x, 1.0 - insetX) *
                 step(insetY, g.y) * step(g.y, 1.0 - insetY);
    // mullion frame reads slightly lighter
    float frame = max(step(0.5 - 0.5, abs(g.x - 0.5) * 0.0), 0.0);

    float r1 = hash12(cellId + seed * 71.3);
    float r2 = hash12(cellId.yx * 1.7 + seed * 13.1);
    // occupancy ramps up after dusk; some windows are permanently dead
    float dead = step(0.90, hash12(cellId * 0.37 + seed));
    float on = step(1.0 - (0.10 + 0.86 * litR), r1) * (1.0 - dead);
    // slow flicker / someone switching a light
    on *= 0.72 + 0.28 * step(0.5, fract(uTime * (0.05 + r2 * 0.25) + r2 * 9.0));
    lit = windowMask * on;
    // interior colour temperature varies flat-to-flat
    float warm = hash12(cellId * 3.1 + seed * 5.0);
    winTint = mix(vec3(0.55, 0.78, 1.25), vec3(1.45, 1.05, 0.62), warm);
    if (hash12(cellId * 7.7 + seed) > 0.86) winTint = vec3(0.35, 1.15, 0.95); // data-green

    albedo = mix(vec3(0.075, 0.086, 0.115), uTint, 0.85);
    rough = mix(0.16, 0.42, windowMask);
    metal = 0.62;

    // spandrel band between floors
    float band = smoothstep(0.0, 0.08, g.y) * (1.0 - smoothstep(0.92, 1.0, g.y));
    albedo *= mix(0.6, 1.08, band);

    // ---- facade neon -------------------------------------------------
    // Vertical tubes on a share of the bays plus the occasional horizontal
    // band. This is the single detail that makes a night skyline read as
    // cyberpunk rather than as lit windows.
    vec3 neonA = hsv2rgb(vec3(hue, 0.88, 1.0));
    vec3 neonB = hsv2rgb(vec3(fract(hue + 0.42), 0.92, 1.0));
    if (hash12(vec2(cellId.x, 3.71) + seed * 9.13) > 0.70) {
      float tube = smoothstep(0.40, 0.495, abs(g.x - 0.5) * 2.0);
      emissive += neonA * tube * 1.15 * uNeonGain;
    }
    if (hash12(vec2(cellId.y, 11.3) + seed * 3.07) > 0.78) {
      float ledge = smoothstep(0.42, 0.497, abs(g.y - 0.5) * 2.0);
      emissive += neonB * ledge * 0.95 * uNeonGain;
    }
    // signage clutter on the lower storeys
    if (uv.y < 26.0 && hash12(cellId + seed * 51.0) > 0.93) {
      emissive += neonB * (windowMask * 0.55) * 1.5 * uNeonGain;
    }
  }

  if (uMode == 1) {
    // ---- concrete / composite ----------------------------------------
    float seams = step(0.97, fract(uv.x / 5.6)) + step(0.97, fract(uv.y / 3.2));
    albedo = uTint * (1.0 - 0.28 * clamp(seams, 0.0, 1.0));
    float blotch = fbm(uv * 0.35 + seed * 40.0, 4);
    albedo *= 0.78 + 0.44 * blotch;
    // leaked light from windows onto the street facade at night
    lit = 0.0;
    rough = 0.86;
  }

  if (uMode == 2) {
    // ---- emissive architecture ---------------------------------------
    albedo = uTint * 0.16;
    float strip = smoothstep(0.42, 0.5, abs(fract(uv.x / 2.4) - 0.5) * 2.0);
    float pulse = 0.55 + 0.45 * sin(uTime * 1.7 + seed * 30.0 + uv.y * 0.12);
    float race = smoothstep(0.86, 1.0, fract(uv.y * 0.06 - uTime * 0.35 + seed));
    emissive = uTint * (strip * (0.9 + 0.7 * pulse) + race * 1.6) * uNeonGain * 0.7;
    rough = 0.35;
  }

  if (uMode == 3) {
    // ---- industrial sheet metal --------------------------------------
    float corr = 0.5 + 0.5 * sin(uv.x * 9.0);
    albedo = uTint * (0.72 + 0.42 * corr);
    float soot = fbm(uv * 0.18 + seed * 12.0, 4);
    albedo *= mix(0.45, 1.0, soot);
    float rust = smoothstep(0.62, 0.95, fbm(uv * 0.5 + 21.0, 3));
    albedo = mix(albedo, vec3(0.28, 0.13, 0.06), rust * 0.55);
    rough = 0.62 - 0.3 * rust;
    metal = 0.7;
  }

  // ---------------------------------------------------------- grime + wet
  float streak = fbm(vec2(uv.x * 0.6, uv.y * 0.07) + seed * 60.0, 4);
  albedo *= mix(1.0, 0.42, smoothstep(0.45, 0.95, streak) * dirt);
  float wet = uWetness * (0.35 + 0.65 * smoothstep(0.0, 6.0, uv.y));
  albedo *= mix(1.0, 0.55, wet * 0.7);

  // ---------------------------------------------------------- lighting
  float ndl = max(dot(N, normalize(uSunDir)), 0.0);
  vec3 sun = uSunColor * ndl * (0.35 + 0.65 * uDayFactor);
  vec3 amb = skyAmbient(N) * mix(0.16, 0.55, uDayFactor);

  // vertical AO: street canyons go dark near the ground
  float yRel = clamp((vWorld.y - baseY) / max(bh, 1.0), 0.0, 1.0);
  float canyonAO = mix(0.34, 1.0, smoothstep(0.0, 0.22, yRel));

  vec3 col = albedo * (sun + amb) * canyonAO;

  // The city lights itself: every fa莽ade is lit by a hundred thousand tubes it
  // never sees. Without this term the massing reads as black silhouettes.
  col += albedo * uCityGlow * mix(0.50, 1.0, canyonAO);

  // neon bounce 鈥?the dominant local light source of the street
  col += albedo * neonLights(vWorld, N, rough, 1.0) * canyonAO * uNeonGain;

  // window emission (linear HDR, feeds the bloom pass)
  vec3 winEmis = winTint * lit * (0.22 + 1.05 * uNightFactor) * (0.5 + 0.9 * litR);
  col += winEmis * albedo * 2.2 + winEmis * 0.16;

  col += emissive;
  // signage racks glow faintly on their own frames
  col += uTint * flags * 0.02;

  // wet specular sheen picking up neon vertically (fake but convincing)
  if (wet > 0.02) {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(V + vec3(0.0, 1.0, 0.0));
    float spec = pow(max(dot(N, H), 0.0), mix(8.0, 90.0, 1.0 - rough));
    col += spec * wet * (neonLights(vWorld + vec3(0.0, 6.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0, 0.35) + 0.02);
  }

  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
#endif
