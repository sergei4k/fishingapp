/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Color 1
 * @color
 * @default #0d2b3e
 */
uniform vec3 u_color1;

/**
 * @label Color 2
 * @color
 * @default #1b6b5a
 */
uniform vec3 u_color2;

/**
 * @label Color 3
 * @color
 * @default #46c6c0
 */
uniform vec3 u_color3;

/**
 * @label Color 4
 * @color
 * @default #9b7fd4
 */
uniform vec3 u_color4;

/**
 * Direction the gradient flows, in degrees.
 * @label Gradient Direction
 * @default 45
 * @range 0, 360
 */
uniform float u_gradAngle;

/**
 * Detail of the folds. Higher = tighter, busier folds.
 * @label Fold Detail
 * @default 2
 * @range 0.1, 8
 */
uniform float u_gradDetail;

/**
 * How much the flow folds the gradient back on itself.
 * @label Turbulence
 * @default 0.6
 * @range 0, 2
 */
uniform float u_gradTurbulence;

/**
 * How fast the folds drift over time.
 * @label Flow Speed
 * @default 0.2
 * @range 0, 1
 */
uniform float u_gradSpeed;

/**
 * Angle of the glass ribs, in degrees.
 * @label Rib Angle
 * @default 135
 * @range 0, 360
 */
uniform float u_lineAngle;

/**
 * Width of each glass rib, in pixels.
 * @label Rib Width
 * @default 120
 * @range 1, 400
 */
uniform float u_lineWidth;

/**
 * How strongly the glass bends the colors. Negative = grooves instead of bulges.
 * @label Bend
 * @default 55
 * @range -200, 200
 */
uniform float u_strength;

/**
 * Rainbow fringing along the rib edges. 0 = none.
 * @label Color Split
 * @default 0.04
 * @range 0, 1
 */
uniform float u_dispersion;

/**
 * Size of the calm patches. Smaller = bigger, smoother swells.
 * @label Calm Size
 * @default 2.5
 * @range 0.1, 10
 */
uniform float u_noiseScale;

/**
 * How fast the calm patches drift.
 * @label Calm Speed
 * @default 0.15
 * @range 0, 2
 */
uniform float u_noiseSpeed;

/**
 * How much the calm patches flatten the glass. 0 = full bending everywhere.
 * @label Calm Amount
 * @default 1
 * @range 0, 2
 */
uniform float u_noiseAmount;

/**
 * How far the glass twirls around its center, in degrees. 0 = none.
 * @label Twirl
 * @default 0
 * @range -360, 360
 */
uniform float u_twirlAmount;

/**
 * How far out the twirl reaches, as a fraction of the shape.
 * @label Twirl Radius
 * @default 1.2
 * @range 0.1, 3
 */
uniform float u_twirlRadius;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p = p * 2.0 + 19.7;
    amp *= 0.5;
  }
  return sum;
}

float flowOctave(vec2 p, float t) {
  float v = sin(p.x * 3.0 + t);
  v += sin(p.y * 3.7 - t * 0.8);
  v += sin((p.x + p.y) * 2.3 + t * 0.6);
  v += sin(length(p - 0.5) * 6.0 - t);
  return v * 0.25;
}

float flowFbm(vec2 p, float t) {
  float v = 0.0;
  float amp = 0.65;
  for (int i = 0; i < 3; i++) {
    v += flowOctave(p, t) * amp;
    p *= 2.0;
    t *= 1.2;
    amp *= 0.5;
  }
  return v;
}

float ease(float x) {
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

vec3 srgbToLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

vec3 linearToSrgb(vec3 c) {
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(l, 1.0 / 3.0);
  m = pow(m, 1.0 / 3.0);
  s = pow(s, 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  );
}

vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 mixOklab(vec3 a, vec3 b, float t) {
  vec3 la = linearToOklab(srgbToLinear(a));
  vec3 lb = linearToOklab(srgbToLinear(b));
  return linearToSrgb(oklabToLinear(mix(la, lb, t)));
}

vec3 paletteColor(float t) {
  t = abs(fract(t * 0.5) * 2.0 - 1.0);
  float seg = t * 3.0;
  float f = ease(fract(seg));
  if (seg < 1.0) {
    return mixOklab(u_color1, u_color2, f);
  }
  if (seg < 2.0) {
    return mixOklab(u_color2, u_color3, f);
  }
  return mixOklab(u_color3, u_color4, f);
}

vec3 foldedGradient(vec2 uv) {
  float t = u_time * u_gradSpeed;
  float angle = radians(u_gradAngle);
  vec2 dir = vec2(cos(angle), sin(angle));

  vec2 c = uv;
  c.x *= u_resolution.x / u_resolution.y;
  c *= u_gradDetail;

  vec2 drift = dir * 0.5 * t;
  vec2 q = vec2(flowFbm(c + drift, t), flowFbm(c + drift + vec2(5.2, 1.3), t));
  float flow = flowFbm(c + 2.0 * q, t) * u_gradTurbulence;

  float gradient = dot(uv - 0.5, dir) + 0.5;
  return paletteColor(gradient * 0.3 + t + flow);
}

void main() {
  float la = radians(u_lineAngle);
  vec2 lineDir = vec2(cos(la), sin(la));
  vec2 perp = vec2(-lineDir.y, lineDir.x);

  float width = max(u_lineWidth, 1.0);

  vec2 tc = gl_FragCoord.xy - u_resolution * 0.5;
  float reach = max(min(u_resolution.x, u_resolution.y) * 0.5 * u_twirlRadius, 1.0);
  float fall = clamp(1.0 - length(tc) / reach, 0.0, 1.0);
  float ta = radians(u_twirlAmount) * fall * fall;
  float tcos = cos(ta);
  float tsin = sin(ta);
  vec2 twirled = u_resolution * 0.5 + vec2(tc.x * tcos - tc.y * tsin, tc.x * tsin + tc.y * tcos);

  float f = fract(dot(twirled, perp) / width);
  float x = f * 2.0 - 1.0;
  float thick = sqrt(max(1.0 - x * x, 1e-4));
  float disp = clamp(-x / thick, -8.0, 8.0) - x * thick * 1.5;

  vec2 np = gl_FragCoord.xy / u_resolution.x * u_noiseScale;
  vec2 drift = vec2(u_time * u_noiseSpeed, u_time * u_noiseSpeed * 0.6);
  float attenuation = clamp(fbm(np + drift) * u_noiseAmount, 0.0, 1.0);
  float strength = u_strength * (1.0 - attenuation);

  vec2 offset = perp * disp * strength;

  const int SAMPLES = 12;
  vec3 sum = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    vec3 weight = vec3(
        smoothstep(0.55, 0.0, t),
        1.0 - abs(t - 0.5) * 2.0,
        smoothstep(0.45, 1.0, t)
      );
    float spread = (t - 0.5) * 2.0 * u_dispersion;
    vec2 uv = (gl_FragCoord.xy + offset * (1.0 + spread)) / u_resolution;
    sum += foldedGradient(uv) * weight;
    wsum += weight;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
