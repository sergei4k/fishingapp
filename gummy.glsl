/** @resolution */
uniform vec2 u_resolution;

/** @sdf */
uniform sampler2D u_sdf;

/**
 * @label Top Color
 * @color
 * @default #FBFDFF
 */
uniform vec3 u_topColor;

/**
 * @label Bottom Color
 * @color
 * @default #6E8FD6
 */
uniform vec3 u_bottomColor;

/**
 * @label Gradient Low
 * @default 0.08
 * @range 0, 1
 */
uniform float u_gradLow;

/**
 * @label Gradient High
 * @default 0.72
 * @range 0, 1
 */
uniform float u_gradHigh;

/**
 * @label Gradient Bias
 * @default 1
 * @range 0.25, 4
 */
uniform float u_gradBias;

/**
 * @label Gradient Angle
 * @default 0
 * @range 0, 360
 */
uniform float u_gradAngle;

/**
 * @label Slab Thickness
 * @default 0.03
 * @range 0, 0.2
 */
uniform float u_thick;

/**
 * @label Edge Roundness
 * @default 0.1
 * @range 0.01, 0.4
 */
uniform float u_round;

/**
 * @label Bead Size
 * @default 0.35
 * @range 0.05, 1
 */
uniform float u_bead;

/**
 * @label Bead Offset
 * @default 0.35
 * @range 0, 1.5
 */
uniform float u_beadGap;

/**
 * @label Bead Blend
 * @default 0.08
 * @range 0.01, 0.5
 */
uniform float u_beadBlend;

/**
 * @label Density
 * @default 3.5
 * @range 0, 12
 */
uniform float u_density;

/**
 * @label Albedo
 * @default 0.92
 * @range 0, 1
 */
uniform float u_albedo;

/**
 * @label Translucency
 * @default 2.5
 * @range 0, 10
 */
uniform float u_sss;

/**
 * @label Milkiness
 * @default 0.55
 * @range 0, 1.5
 */
uniform float u_milk;

/**
 * @label Milk Scale
 * @default 3
 * @range 0.5, 12
 */
uniform float u_milkScale;

/**
 * @label Light Angle
 * @default 115
 * @range 0, 360
 */
uniform float u_lightAngle;

/**
 * @label Light Elevation
 * @default 42
 * @range 0, 90
 */
uniform float u_lightElev;

/**
 * @label Specular
 * @default 1
 * @range 0, 3
 */
uniform float u_spec;

/**
 * @label Gloss
 * @default 90
 * @range 4, 400
 */
uniform float u_gloss;

/**
 * @label Fresnel
 * @default 1
 * @range 0, 2
 */
uniform float u_fres;

/**
 * @label Fresnel Falloff
 * @default 4
 * @range 1, 8
 */
uniform float u_fresPow;

/**
 * @label Env Bands
 * @default 7
 * @range 0, 24
 */
uniform float u_envBands;

/**
 * @label Band Gain
 * @default 0.35
 * @range 0, 1.5
 */
uniform float u_envBandGain;

/**
 * @label Band Sharpness
 * @default 3
 * @range 1, 12
 */
uniform float u_envBandSharp;

/**
 * @label Band Phase
 * @default 0
 * @range 0, 6.2832
 */
uniform float u_envPhase;

/**
 * @label Dispersion
 * @default 0.4
 * @range 0, 2
 */
uniform float u_disp;

const int STEPS = 24;

// Palette derived from u_topColor / u_bottomColor (see derivePalette).
vec3 g_colAbsorb;
vec3 g_envZenith;
vec3 g_envHorizon;
vec3 g_envFloor;

// --- Color harmony -----------------------------------------------------------
// Everything but the two authored colors is derived in HSL.
// The hue interval between the two colors, dHue = hue(bottom) - hue(top), is the
// harmony unit: the environment ladder sits on the top hue and leans slightly
// against dHue, the absorption tint leans with it, deeper into the interior.
const float HUE_SPAN = 30.0 / 360.0; // max hue lean, keeps wide pairs sane

const float FLOOR_HUE = -0.275; // env floor leans away from the interior hue
const float FLOOR_SAT = 0.585;
const float FLOOR_LUM = 0.879;

const float ZENITH_HUE = 0.05; // env zenith stays essentially on the top hue
const float ZENITH_SAT = 0.550;
const float ZENITH_LUM = 0.708;

const float HORIZON_TINT = 0.03; // horizon is the top color pushed to white

const float ABSORB_HUE = 0.275; // absorption leans toward the interior hue
const float ABSORB_SAT = 1.75;  // ...at the purest chroma the hue allows
const float ABSORB_LUM = 0.27;  // ...and never lighter than this

vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = 0.5 * (mx + mn);
  float d = mx - mn;
  if (d < 1e-5) return vec3(0.0, 0.0, l);

  float s = d / max(1.0 - abs(2.0 * l - 1.0), 1e-5);
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;

  return vec3(h / 6.0, clamp(s, 0.0, 1.0), l);
}

vec3 hsl2rgb(vec3 hsl) {
  vec3 k = clamp(abs(mod(fract(hsl.x) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float l = clamp(hsl.z, 0.0, 1.0);
  float c = (1.0 - abs(2.0 * l - 1.0)) * clamp(hsl.y, 0.0, 1.0);
  return (k - 0.5) * c + l;
}

void derivePalette() {
  vec3 top = rgb2hsl(clamp(u_topColor, 0.0, 1.0));
  vec3 bot = rgb2hsl(clamp(u_bottomColor, 0.0, 1.0));

  float dHue = clamp(fract(bot.x - top.x + 0.5) - 0.5, -HUE_SPAN, HUE_SPAN);

  g_envHorizon = hsl2rgb(vec3(top.x, top.y, mix(1.0, top.z, HORIZON_TINT)));
  g_envFloor = hsl2rgb(vec3(top.x + FLOOR_HUE * dHue, top.y * FLOOR_SAT, top.z * FLOOR_LUM));
  g_envZenith = hsl2rgb(vec3(top.x + ZENITH_HUE * dHue, top.y * ZENITH_SAT, top.z * ZENITH_LUM));
  g_colAbsorb = hsl2rgb(vec3(top.x + ABSORB_HUE * dHue, min(bot.y * ABSORB_SAT, 1.0), min(bot.z, ABSORB_LUM)));
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float fbm3(vec3 p) {
  return vnoise3(p) * 0.62 + vnoise3(p * 2.13) * 0.26 + vnoise3(p * 4.51) * 0.12;
}

vec3 envMap(vec3 d) {
  float t = clamp(d.y, -1.0, 1.0);
  vec3 sky = mix(g_envHorizon, g_envZenith, smoothstep(0.0, 0.72, t));
  vec3 grd = mix(g_envHorizon, g_envFloor, smoothstep(0.0, -0.72, t));
  vec3 base = mix(grd, sky, step(0.0, t));

  float b = 0.5 + 0.5 * cos(t * u_envBands * 6.2831853 + u_envPhase);
  b = pow(b, u_envBandSharp);

  return base + b * u_envBandGain;
}

float smaxf(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

float edgeProfile(float x) {
  float R = max(u_round, 1e-4);
  float rA = max(R * u_bead, 1e-5);
  float rB = R;
  float cxB = R * u_beadGap + rB;

  float da = x - rA;
  float zA = sqrt(max(rA * rA - da * da, 0.0));

  float db = min(x, cxB) - cxB;
  float zB = sqrt(max(rB * rB - db * db, 0.0));

  return smaxf(zA, zB, max(R * u_beadBlend, 1e-4));
}

void main() {
  derivePalette();

  vec2 uv = gl_FragCoord.xy / u_resolution;
  float px = min(u_resolution.x, u_resolution.y);
  float aspect = u_resolution.x / u_resolution.y;

  vec4 sd = texture2D(u_sdf, uv);
  float dN = sd.r / px;
  vec2 gIn = sd.gb;
  float coh = smoothstep(0.1, 0.8, clamp(length(gIn), 0.0, 1.0));
  vec2 outward = -normalize(gIn + vec2(1e-6));

  float H = max(u_thick, 0.0);
  float zHalf = H + edgeProfile(dN);

  float ep = max(u_round, 1e-4) * 0.035;
  float dP = (edgeProfile(dN + ep) - edgeProfile(dN - ep)) / (2.0 * ep);
  dP = clamp(dP, -60.0, 60.0);

  vec3 n = normalize(vec3(outward * dP * coh, 1.0));

  float la = radians(u_lightAngle);
  float le = radians(u_lightElev);
  vec3 L = normalize(vec3(cos(la) * cos(le), sin(la) * cos(le), sin(le)));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hv = normalize(L + V);

  vec3 extinction = (vec3(1.0) - g_colAbsorb) * u_density;

  // Gradient axis: 0 deg points at the top color, rotating counter-clockwise.
  // Aspect-corrected and normalized to the projected extent, so the ramp spans
  // the whole shape at any angle and reduces to uv.y exactly at 0 deg.
  float ga = radians(u_gradAngle);
  vec2 gDir = vec2(-sin(ga), cos(ga));
  float gExt = max(aspect * abs(gDir.x) + abs(gDir.y), 1e-4);
  float gCoord = 0.5 + dot((uv - 0.5) * vec2(aspect, 1.0), gDir) / gExt;

  float gLow = min(u_gradLow, u_gradHigh - 1e-3);
  float gy = 1.0 - smoothstep(gLow, u_gradHigh, gCoord);
  gy = pow(clamp(gy, 0.0, 1.0), u_gradBias);
  vec3 scatterCol = mix(u_topColor, u_bottomColor, gy);

  vec3 trans = vec3(1.0);
  vec3 inscatter = vec3(0.0);
  float ds = 2.0 * zHalf / float(STEPS);

  float jitter = hash3(vec3(gl_FragCoord.xy, 0.0));

  for (int i = 0; i < STEPS; i++) {
    float fi = (float(i) + jitter) / float(STEPS);
    float z = zHalf - fi * 2.0 * zHalf;

    vec3 sp = vec3(uv * vec2(aspect, 1.0) * u_milkScale, z * u_milkScale * 2.0);
    float d = 1.0 + u_milk * (fbm3(sp) - 0.5) * 2.0;
    d = max(d, 0.0);

    vec3 sigmaT = extinction * d;
    vec3 stepT = exp(-sigmaT * ds);

    float toSurface = min(dN, zHalf - abs(z));
    float lightT = exp(-u_sss * max(toSurface, 0.0));
    float topBias = 0.35 + 0.65 * smoothstep(-zHalf, zHalf, z);

    vec3 sIn = u_albedo * scatterCol * (lightT * topBias + 0.06);
    inscatter += trans * sIn * sigmaT * ds;

    trans *= stepT;
  }

  vec3 body = inscatter + vec3(trans);

  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, u_fresPow);
  F = clamp(F * u_fres, 0.0, 1.0);

  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 tang = vec3(outward, 0.0);
  float dsp = u_disp * 0.06 * (1.0 - ndv);

  vec3 nR = normalize(n + tang * dsp);
  vec3 nB = normalize(n - tang * dsp);

  vec3 refl = vec3(
    envMap(reflect(I, nR)).r,
    envMap(reflect(I, n)).g,
    envMap(reflect(I, nB)).b);

  vec3 col = mix(body, refl, F);

  float ndh = clamp(dot(n, Hv), 0.0, 1.0);
  col += pow(ndh, u_gloss) * u_spec;
  col += pow(ndh, u_gloss * 0.15) * 0.08 * u_spec;

  col += (hash3(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * 0.008;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
