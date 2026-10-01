// =====================================================================
//  neon.glsl — advertising surfaces, LED walls, holograms, signage racks.
//  One atlas (6x4 procedurally painted tiles) drives tens of thousands of
//  signs through instancing; each instance picks its tile and animates it.
//
//  aSign = (tileX, tileY, mode, seed)
//    mode 0 : solid LED panel (opaque + emissive)
//    mode 1 : volumetric hologram (additive, fresnel rim, scanlines)
//    mode 2 : projected ad (fades on glass, no frame)
//    mode 3 : vertical kanji blade sign
// =====================================================================

#include "common"

#ifdef VERTEX
attribute vec4 aSign;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vSign;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vSign = aSign;
  vec4 wp = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vViewDir = normalize(cameraPosition - vWorld);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
#endif

#ifdef FRAGMENT
uniform sampler2D uAtlas;
uniform float uAtlasCols;
uniform float uAtlasRows;
uniform float uBright;
uniform float uHoloStrength;
uniform float uAdDensity;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vSign;
varying vec3 vViewDir;

void main() {
  float tx = vSign.x, ty = vSign.y, mode = vSign.z, seed = vSign.w;

  // ---- atlas fetch -----------------------------------------------------
  vec2 uv = vUv;
  // panels slowly "scroll" content the way a real LED wall cycles ads
  float cycle = 1.0;
  if (mode < 0.5) {
    float t = fract(uTime * (0.02 + 0.03 * hash11(seed)) + seed);
    cycle = mix(1.0, 1.0 - t, 0.0);
  }
  vec2 auv = (vec2(tx, ty) + fract(uv * vec2(1.0, 1.0))) / vec2(uAtlasCols, uAtlasRows);
  vec3 tex = texture2D(uAtlas, auv).rgb;

  // ---- per-sign animation ---------------------------------------------
  float flick = 1.0;
  float f1 = hash11(floor(uTime * 27.0) + seed * 91.0);
  if (f1 > 0.986) flick = 0.15;                       // tube dropout
  float hum = 0.94 + 0.06 * sin(uTime * (28.0 + 40.0 * hash11(seed)) + seed * 60.0);
  float breathe = 0.86 + 0.14 * sin(uTime * 0.7 + seed * 20.0);

  // slow vertical raster roll (LED multiplexing artefact)
  float roll = smoothstep(0.0, 0.06, abs(fract(uv.y + uTime * 0.09) - 0.5));
  float scan = mix(0.72, 1.0, roll);

  // glitch slicing on a few unlucky panels
  float glitch = 0.0;
  if (hash11(seed * 3.3) > 0.93) {
    float band = step(0.5, hash11(floor(uv.y * 22.0) + floor(uTime * 6.0) + seed));
    glitch = band * step(0.72, hash11(floor(uTime * 6.0) + seed)) * 0.35;
    auv.x += glitch * 0.02;
  }

  // ---- frame / backing -------------------------------------------------
  float frame = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float frameMask = smoothstep(0.0, 0.035, frame);
  vec3 backing = vec3(0.02, 0.022, 0.03);

  vec3 col;
  float alpha = 1.0;

  if (mode < 0.5) {
    // solid LED panel
    col = mix(backing, tex, frameMask) * uBright * flick * hum * scan * breathe;
    col = mix(col, col * 0.35, 1.0 - frameMask);
  } else if (mode < 1.5) {
    // hologram: additive, fresnel rim, strong scanlines, slight ghosting
    float fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), vViewDir)), 0.0, 1.0), 2.0);
    float sl = 0.55 + 0.45 * step(0.5, fract(vWorld.y * 2.4 - uTime * 2.2));
    float ghost = 0.25 * sin(vWorld.y * 0.6 + uTime * 1.5);
    vec3 tint = mix(vec3(0.35, 0.85, 1.25), tex, 0.55);
    col = tint * uBright * uHoloStrength * (0.5 + fres * 1.4) * sl * flick * breathe;
    col += tint * ghost * 0.12;
    alpha = clamp((0.20 + 0.55 * fres) * uHoloStrength * (0.5 + 0.5 * frameMask), 0.0, 1.0);
    col *= alpha;
  } else if (mode < 2.5) {
    // projected advertisement on a wall: no frame, soft edges, low contrast
    float edge = smoothstep(0.0, 0.09, frame);
    col = tex * uBright * 0.62 * flick * hum * edge;
    alpha = 0.88 * edge * uAdDensity;
    col *= alpha;
  } else {
    // vertical blade sign (Japanese style) — bright box, dark glyph field
    float seg = smoothstep(0.0, 0.04, frame);
    col = mix(backing * 0.4, tex, seg) * uBright * 1.25 * flick * hum;
    col += vec3(0.9, 0.25, 0.7) * (1.0 - seg) * 0.35;
    // chase border
    float b = smoothstep(0.02, 0.05, frame) * (1.0 - smoothstep(0.05, 0.075, frame));
    col += vec3(1.4, 0.6, 0.2) * b * (0.5 + 0.5 * sin(uTime * 6.0 + uv.y * 24.0));
  }

  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, alpha);
}
#endif
