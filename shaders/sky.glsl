// =====================================================================
//  sky.glsl — sky dome: gradient, stars, sun/moon, light-pollution dome,
//  stratified cloud deck lit from below by the city.
// =====================================================================

#include "common"

#ifdef VERTEX
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.999999;   // always at far plane
}
#endif

#ifdef FRAGMENT
uniform vec3  uZenith;
uniform vec3  uHorizon;
uniform vec3  uGroundHaze;
uniform vec3  uPollution;
uniform float uStars;
uniform float uCloud;
uniform float uCloudSpeed;
uniform vec3  uMoonDir;
uniform float uSunDisc;
uniform float uLightning;
uniform float uDust;

varying vec3 vDir;

float starField(vec3 d) {
  // quantise the sphere into cells, one candidate star per cell
  vec3 p = d * 220.0;
  vec3 c = floor(p);
  float h = hash13(c);
  if (h < 0.9955) return 0.0;
  vec3 centre = c + 0.5 + (vec3(hash13(c + 1.0), hash13(c + 2.0), hash13(c + 3.0)) - 0.5) * 0.7;
  float dd = length(p - centre);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + h * 40.0) + h * 100.0);
  return smoothstep(0.34, 0.0, dd) * twinkle * (0.5 + 2.0 * hash13(c + 7.0));
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -1.0, 1.0);

  // ---- base gradient ---------------------------------------------------
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  col = mix(col, uGroundHaze, smoothstep(0.04, -0.22, up));

  // ---- light pollution dome -------------------------------------------
  //  the city pours sodium/magenta light into the clouds; strongest on the
  //  side we are standing in, so it reads as a real skyglow.
  float glow = pow(clamp(1.0 - abs(up) * 2.4, 0.0, 1.0), 1.7);
  float band = smoothstep(0.34, 0.0, abs(up - 0.03));
  col += uPollution * (glow * 0.85 + band * 0.55) * uStars;

  // ---- stars ------------------------------------------------------------
  if (up > 0.02) {
    float s = starField(d);
    col += vec3(0.85, 0.9, 1.0) * s * uStars * 2.2 * smoothstep(0.0, 0.25, up);
  }

  // ---- sun / moon -------------------------------------------------------
  float sd = dot(d, normalize(uSunDir));
  float md = dot(d, normalize(uMoonDir));
  // sun: tight disc + wide scatter, only when above horizon
  float sunUp = smoothstep(-0.08, 0.12, uSunDir.y);
  col += uSunColor * smoothstep(0.9985, 0.9995, sd) * 5.0 * sunUp * uSunDisc;
  col += uSunColor * pow(max(sd, 0.0), 26.0) * 0.55 * sunUp * uSunDisc;
  col += uSunColor * pow(max(sd, 0.0), 4.0) * 0.12 * sunUp;
  // moon: cold disc with a halo
  float mUp = smoothstep(-0.05, 0.10, uMoonDir.y);
  col += vec3(0.72, 0.80, 1.0) * smoothstep(0.9993, 0.9997, md) * 3.2 * mUp * uStars;
  col += vec3(0.34, 0.42, 0.62) * pow(max(md, 0.0), 90.0) * 0.7 * mUp * uStars;

  // ---- cloud deck -------------------------------------------------------
  if (up > 0.005) {
    vec2 cuv = d.xz / max(up + 0.16, 0.10);
    cuv = cuv * 0.55 + vec2(uTime * 0.0035 * uCloudSpeed, uTime * 0.0021 * uCloudSpeed);
    float n = fbm(cuv, 5);
    float n2 = fbm(cuv * 2.6 + 7.0, 4);
    float cover = smoothstep(0.62 - uCloud * 0.55, 0.98, n * 0.7 + n2 * 0.3);
    cover *= smoothstep(0.0, 0.22, up);
    // clouds are lit from underneath by the city, from above by sun/moon
    vec3 under = uPollution * 1.5 + uHorizon * 0.6;
    vec3 over = mix(uZenith * 0.9, uSunColor * 0.8, clamp(sd, 0.0, 1.0) * uSunDisc);
    vec3 cloudCol = mix(under, over, clamp(up * 1.3, 0.0, 1.0));
    col = mix(col, cloudCol, cover * (0.55 + 0.45 * uCloud));
  }

  // ---- dust / acid tint -------------------------------------------------
  col = mix(col, vec3(0.28, 0.21, 0.12), uDust * 0.75 * clamp(1.0 - up * 1.4, 0.0, 1.0));
  col = mix(col, vec3(0.10, 0.18, 0.08), uAcid * 0.35);

  // lightning sheet flash
  col += vec3(0.55, 0.62, 0.85) * uLightning;

  gl_FragColor = vec4(col, 1.0);
}
#endif
