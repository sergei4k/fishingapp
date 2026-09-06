/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * Freeze the animation at a specific moment, in seconds. 0 = run live off the
 * real clock; any value above 0 overrides the clock and makes the effect static.
 * @label Time
 * @default 0
 * @range 0, 10
 */
uniform float u_timeOverride;

// Effective animation time: the override when set, otherwise the live clock.
float animTime() {
  return u_timeOverride > 0.0 ? u_timeOverride : u_time;
}

/**
 * Content behind the node, seen through the water.
 * @label Backdrop
 * @backdrop
 */
uniform sampler2D u_backdrop;

/**
 * Index of refraction of the water. Physical water is 1.33.
 * @label Index of Refraction
 * @default 1.33
 * @range 1, 2
 */
uniform float u_ior;

/**
 * Water depth — how far the backdrop sits below the surface, as a fraction of
 * the reference size (450 px). Deeper water displaces the backdrop more.
 * @label Depth
 * @default 0.4
 * @range 0, 1.5
 */
uniform float u_depth;

/**
 * Wave height, as a fraction of the reference size (450 px). Controls how
 * steeply the surface tilts, and therefore how hard it refracts.
 * @label Amplitude
 * @default 0.05
 * @range 0, 0.2
 */
uniform float u_amplitude;

/**
 * Size of the swells. Small = fine ripples, large = broad rolling waves.
 * @label Wave Scale
 * @default 3.0
 * @range 0.5, 8
 */
uniform float u_scale;

/**
 * How fast the ripples travel.
 * @label Speed
 * @default 0.5
 * @range 0, 2
 */
uniform float u_speed;

/**
 * Choppiness. 0 = smooth rolling swell, 1 = sharp wind chop.
 * @label Turbulence
 * @default 0.6
 * @range 0, 1
 */
uniform float u_turbulence;

/**
 * Brightness of the specular glints on the crests.
 * @label Highlights
 * @default 0.35
 * @range 0, 1
 */
uniform float u_highlights;

/**
 * Chromatic aberration — how much the red and blue ends of the spectrum refract
 * apart, as a spread in the index of refraction. 0 = off.
 * @label Chromatic Aberration
 * @default 0.0
 * @range 0, 1
 */
uniform float u_dispersion;

// Fixed reference size in pixels. All surface coordinates, depths, and
// amplitudes are expressed relative to this instead of the node size, so the
// ripple wavelength and refraction intensity are identical at any resolution —
// a bigger node just shows more water, not bigger waves.
const float REF_PX = 450.0;

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453123);
}

// A directional wave spectrum: many components fanned around the full circle by
// the golden angle, with jittered non-harmonic wavelengths (so no shared period)
// and deep-water dispersion (omega proportional to sqrt(k), so every wavelength
// travels at its own rate and the interference never resettles into a tile).
// Crests are sharpened Gerstner-style via pow() so the surface reads as water.
//
// Returns the height normalized to roughly [-1, 1] and writes its analytic
// gradient to `grad` — one pass over the spectrum replaces the five
// finite-difference evaluations the normal used to cost.
float surfaceHG(vec2 p, float time, out vec2 grad) {
  // Slow low-frequency domain warp so wavefronts meander instead of running
  // dead straight — the single biggest cue that kills the "tiled" look.
  float t = time * u_speed;
  float wk = 0.12 * (0.6 + u_turbulence);
  float ax = p.y * 1.3 - t * 0.35;
  float bx = p.x * 0.7 + t * 0.24;
  float ay = p.x * 1.1 + t * 0.29;
  float by = p.y * 0.6 - t * 0.21;
  vec2 q = p + vec2(sin(ax) + sin(bx), sin(ay) + sin(by)) * wk;

  // Jacobian of the warped coordinate, so the gradient stays exact through the
  // warp (chain rule): q = p + wk * warp(p).
  float jxx = 1.0 + wk * 0.7 * cos(bx);
  float jxy = wk * 1.3 * cos(ax);
  float jyx = wk * 1.1 * cos(ay);
  float jyy = 1.0 + wk * 0.6 * cos(by);

  float chop = 1.0 + u_turbulence * 2.5;
  float h = 0.0;
  vec2 g = vec2(0.0);
  float norm = 0.0;
  float freq = 1.1;
  const int N = 14;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float ang = fi * 2.39996323 + hash11(fi + 1.0) * 1.2;      // golden angle, full circle
    vec2 d = vec2(cos(ang), sin(ang));
    float jf = freq * (0.8 + 0.4 * hash11(fi + 7.0));          // non-harmonic wavelength
    float omega = sqrt(jf) * (2.4 * u_speed);                  // deep-water dispersion
    float ph = hash11(fi + 3.0) * 6.2831853;
    float amp = 1.0 / jf;                                      // spectrum: long waves taller
    float x = dot(q, d) * jf - time * omega + ph;
    float s = sin(x) * 0.5 + 0.5;
    float sp1 = pow(max(s, 1e-4), chop - 1.0);                 // pow(s, chop) = sp1 * s
    h += amp * (sp1 * s - 0.5) * 2.0;
    g += (amp * chop * sp1 * cos(x) * jf) * d;
    norm += amp;
    freq *= 1.18;
  }
  grad = vec2(g.x * jxx + g.y * jyx, g.x * jxy + g.y * jyy) / norm;
  return h / norm;
}

// Snell refraction of a straight-down view ray through the surface, marched down
// to the backdrop u_depth below. Returns the backdrop UV the ray lands on.
// The displacement is computed in reference units and converted to UV via the
// actual resolution, so it covers the same number of pixels at any node size.
vec2 refractUV(vec3 N, vec2 uv, float eta) {
  vec3 T = refract(vec3(0.0, 0.0, -1.0), N, eta);
  float descend = max(-T.z, 1e-4);
  vec2 dispPx = (T.xy / descend) * u_depth * REF_PX;
  return clamp(uv + dispPx / u_resolution, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 suv = gl_FragCoord.xy / REF_PX;   // isotropic surface coords, in reference units

  // Surface height field (physical units = fraction of the reference size) and
  // its slope, both from a single spectrum evaluation.
  float time = animTime();
  float scale = 2.5 + u_scale * 1.4;
  vec2 grad;
  float h = surfaceHG(suv * scale, time, grad);

  // Slope of the physical surface -> geometric normal N = normalize(-∇H, 1).
  vec2 dH = grad * scale * u_amplitude;
  vec3 N = normalize(vec3(-dH, 1.0));

  // Snell's law refraction, with the index of refraction split across the
  // spectrum: shorter wavelengths (blue) bend hardest. eta = n_air / n_water,
  // so blue gets the largest n_water. When u_dispersion is 0 all three channels
  // share one eta and there is no colour split.
  float d = u_dispersion * 0.08;
  float etaR = 1.0 / max(u_ior - d, 1.0);
  float etaG = 1.0 / max(u_ior, 1.0);
  float etaB = 1.0 / max(u_ior + d, 1.0);

  vec4 col = texture2D(u_backdrop, refractUV(N, uv, etaG));
  if (u_dispersion > 0.001) {
    col.r = texture2D(u_backdrop, refractUV(N, uv, etaR)).r;
    col.b = texture2D(u_backdrop, refractUV(N, uv, etaB)).b;
  }

  // Specular sparkle where crests tilt toward the light (uses the same normal).
  vec3 lightDir = normalize(vec3(0.35, 0.6, 0.7));
  float spec = pow(max(dot(N, lightDir), 0.0), 24.0);
  float crest = smoothstep(0.0, 0.6, h);
  col.rgb += spec * crest * u_highlights;

  gl_FragColor = col;
}
