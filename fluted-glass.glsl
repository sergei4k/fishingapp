/** @resolution */
uniform vec2 u_resolution;

/**
 * Image seen through the glass.
 * @label Image
 */
uniform sampler2D u_image;

/** @mouse */
uniform vec2 u_mouse;

/**
 * Width of each glass rib, in pixels.
 * @label Rib Width
 * @default 28
 * @range 4, 150
 */
uniform float u_ribWidth;

/**
 * How much the glass bends the image. 0 = flat glass.
 * @label Distortion
 * @default 0.5
 * @range 0, 2
 */
uniform float u_distortion;

/**
 * How strongly the image bends away from the cursor. High = sharp shear around the mouse, low = nearly flat everywhere.
 * @label Mouse Bend
 * @default 0.5
 * @range 0, 1
 */
uniform float u_mouseBend;

/**
 * Frosted blur. 0 = clear glass.
 * @label Frost
 * @default 0.15
 * @range 0, 1
 */
uniform float u_frost;

/**
 * Rainbow color split at the rib edges.
 * @label Color Split
 * @default 0.2
 * @range 0, 1
 */
uniform float u_colorSplit;

/**
 * Soft shading down each rib edge, for depth.
 * @label Edge Shade
 * @default 0.15
 * @range 0, 1
 */
uniform float u_edgeShade;

const int TAPS = 16;
const float TWO_PI = 6.2831853;
const float INV_IOR = 0.6896552;
const float SIN_FLUTE = 0.8912074;

vec3 toLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

vec3 toSRGB(vec3 c) {
  return pow(c, vec3(1.0 / 2.2));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 coverFit() {
  vec2 iR = vec2(textureSize(u_image, 0));
  float imgA = iR.x / iR.y;
  float scrA = u_resolution.x / u_resolution.y;
  return scrA > imgA ? vec2(1.0, imgA / scrA) : vec2(scrA / imgA, 1.0);
}

vec3 sampleLin(vec2 uv, vec2 scale) {
  vec2 c = (uv - 0.5) * scale + 0.5;
  c.y = 1.0 - c.y;
  return toLinear(texture2D(u_image, clamp(c, 0.0, 1.0)).rgb);
}

float lensX(float local, float ribCenter, float alpha) {
  float u = clamp(local * 2.0, -1.0, 1.0);
  float phi = asin(clamp(u * SIN_FLUTE, -1.0, 1.0));
  float psi = phi + asin(clamp(sin(alpha - phi) * INV_IOR, -1.0, 1.0));
  float psiFlat = asin(clamp(sin(alpha) * INV_IOR, -1.0, 1.0));
  float depth = u_distortion * u_ribWidth * 1.6;
  return ribCenter + local * u_ribWidth + (tan(psi) - tan(psiFlat)) * depth;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 invRes = 1.0 / u_resolution;

  float ribIndex = floor(fc.x / u_ribWidth);
  float ribCenter = (ribIndex + 0.5) * u_ribWidth;
  float local = fc.x / u_ribWidth - (ribIndex + 0.5);

  float camCenter = u_mouse.x;
  float p = clamp(u_mouseBend, 0.0, 1.0);
  float camDist = u_resolution.x * (0.4 + 4.0 * (1.0 - p) * (1.0 - p));
  float alpha = atan((ribCenter - camCenter) / camDist);

  float newX = lensX(local, ribCenter, alpha);
  float footprint = abs(lensX(local + 1.0 / u_ribWidth, ribCenter, alpha) - newX) + 0.5;

  float frostR = u_frost * u_ribWidth * 0.5;
  float abPx = u_colorSplit * u_ribWidth * 1.2 * abs(local);
  bool split = u_colorSplit > 0.001;
  float rnd = hash21(fc);
  vec2 scale = coverFit();

  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float u1 = (float(i) + 0.5) / float(TAPS);
    float ang = u1 * (TWO_PI * 3.0) + rnd * TWO_PI;
    vec2 fo = vec2(cos(ang), sin(ang)) * sqrt(u1) * frostR;
    float sa = newX + (u1 - 0.5) * footprint + fo.x;
    vec2 uv = vec2(sa, fc.y + fo.y) * invRes;

    if (split) {
      vec2 ab = vec2(abPx * invRes.x, 0.0);
      acc += vec3(sampleLin(uv + ab, scale).r, sampleLin(uv, scale).g, sampleLin(uv - ab, scale).b);
    } else {
      acc += sampleLin(uv, scale);
    }
  }

  vec3 col = clamp(acc / float(TAPS), 0.0, 1.0);
  float edge = abs(local) * 2.0;
  col *= 1.0 - u_edgeShade * edge * edge;
  gl_FragColor = vec4(toSRGB(col), 1.0);
}
