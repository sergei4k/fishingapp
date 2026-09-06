/** @resolution */
uniform vec2 u_resolution;

/**  @backdrop */
uniform sampler2D u_backdrop;

/** @sdf */
uniform sampler2D u_sdf;

/**
 * @label Index of Refraction
 * @default 1.2
 * @range 1.0, 2.0
 */
uniform float u_ior;

/**
 * @label Chromatic Aberration
 * @default 0.02
 * @range 0.0, 0.2
 */
uniform float u_chromatic;

/**
 * @label Edge Width
 * @default 24
 * @range 1, 200
 */
uniform float u_edgeWidth;

/**
 * @label Specular Power
 * @default 32.0
 * @range 1.0, 128.0
 */
uniform float u_specPower;

/**
 * @label Specular Intensity
 * @default 0.6
 * @range 0.0, 2.0
 */
uniform float u_specIntensity;

/**
 * @label Fresnel Intensity
 * @default 0.3
 * @range 0.0, 2.0
 */
uniform float u_fresnelIntensity;

/**
 * @label Blur
 * @default 0.0
 * @range 0.0, 5.0
 */
uniform float u_blur;

/**
 * @label Chromatic Split
 * @default 0.0
 * @range 0.0, 1.0
 */
uniform float u_split;

/**
 * @label Split Angle
 * @default 0.0
 * @range 0.0, 360.0
 */
uniform float u_splitAngle;

/**
 * @label Effect Falloff
 * @default 60.0
 * @range 0.0, 300.0
 */
uniform float u_falloff;

/**
 * @mouse
 * @label Light Position
 */
uniform vec2 u_mouse;

vec2 g_invRes;
vec3 g_light;
float g_inset;
float g_blur;
float g_split;

const int BLUR_TAPS = 16;

float surfaceHeight(float t) {
  float s = 1.0 - t;
  float s4 = s * s * s * s;
  return pow(1.0 - s4, 0.25);
}

// Snell displacement with the trig identities folded out:
// sinI = sin(atan(slope)), tanI = tan(atan(slope)) = slope,
// tan(asin(y)) = y * inversesqrt(1 - y*y).
float refractDisp(float sinI, float slope, float n) {
  float sinR = clamp(sinI / n, -0.9999, 0.9999);
  return sinR * inversesqrt(1.0 - sinR * sinR) - slope;
}

vec3 sampleBg(vec2 coord) {
  return texture2D(u_backdrop, coord * g_invRes).rgb;
}

// The finished lens at one point: refraction, specular, fresnel and
// silhouette, premultiplied by coverage so it can be filtered directly.
vec4 lensColor(vec2 coord) {
  vec4 sdf = texture2D(u_sdf, coord * g_invRes);
  // Shrink the shape so blur and split have room to spread inside the bounds.
  float sd = sdf.r - g_inset;

  // Outside the shape edge is 0, which zeroes the premultiplied result below.
  float edge = smoothstep(-1.0, 1.0, sd);
  float ew = max(u_edgeWidth, 1.0);
  float t = clamp(sd / ew, 0.0, 1.0);

  // outward, shape-following surface direction from the SDF gradient
  vec2 borderDir = -normalize(sdf.gb + 1e-6);

  float delta = 0.001;
  float h1 = surfaceHeight(clamp(t - delta, 0.0, 1.0));
  float h2 = surfaceHeight(clamp(t + delta, 0.0, 1.0));
  float slope = (h2 - h1) * (0.5 / delta);

  float sinI = slope * inversesqrt(1.0 + slope * slope);

  float dispG = refractDisp(sinI, slope, u_ior) * ew;

  vec3 refracted;
  if (u_chromatic == 0.0) {
    refracted = sampleBg(coord + borderDir * dispG);
  } else {
    float dispR = refractDisp(sinI, slope, u_ior - u_chromatic) * ew;
    float dispB = refractDisp(sinI, slope, u_ior + u_chromatic) * ew;
    refracted = vec3(
      sampleBg(coord + borderDir * dispR).r,
      sampleBg(coord + borderDir * dispG).g,
      sampleBg(coord + borderDir * dispB).b
    );
  }

  vec3 N = normalize(vec3(-slope * borderDir, 1.0));
  vec3 R = reflect(-g_light, N);
  float spec = pow(max(R.z, 0.0), u_specPower);
  float fresnel = pow(1.0 - N.z, 3.0);

  vec3 col = refracted + vec3(spec * u_specIntensity + fresnel * u_fresnelIntensity);

  return vec4(col * edge, edge);
}

// Golden-angle spiral blur over the whole shaded lens, silhouette included.
vec4 lensBlurred(vec2 coord) {
  // Uniform branch: every fragment takes the same path.
  if (u_blur <= 0.0) {
    return lensColor(coord);
  }
  vec4 sum = lensColor(coord);
  for (int i = 0; i < BLUR_TAPS; i++) {
    float fi = float(i) + 0.5;
    float a = fi * 2.39996323;
    float r = sqrt(fi / float(BLUR_TAPS)) * g_blur;
    sum += lensColor(coord + vec2(cos(a), sin(a)) * r);
  }
  return sum / (float(BLUR_TAPS) + 1.0);
}

void main() {
  g_invRes = 1.0 / u_resolution;

  vec2 d = u_resolution * 0.5 - u_mouse;
  d.y -= 0.1;
  d = normalize(d) * max(length(d), 1.0);
  g_light = normalize(vec3(d, length(d)));

  // Split is a fraction of the blur radius: 1.0 splits by the full radius.
  float splitPx = u_blur * u_split;
  g_inset = u_blur + splitPx;

  vec2 coord = gl_FragCoord.xy;

  // Both effects are strongest at the rim and fade linearly to zero at
  // u_falloff pixels in from the (inset) edge.
  float amount = 1.0 - clamp(
    (texture2D(u_sdf, coord * g_invRes).r - g_inset) / max(u_falloff, 1e-3),
    0.0, 1.0);
  g_blur = u_blur * amount;
  g_split = splitPx * amount;

  // Uniform branch: every fragment takes the same path.
  if (splitPx <= 0.0) {
    gl_FragColor = lensBlurred(coord);
    return;
  }

  // Pull the whole lens apart per channel, silhouette and highlights with it.
  float sa = radians(u_splitAngle);
  vec2 off = vec2(cos(sa), sin(sa)) * g_split;

  vec4 lr = lensBlurred(coord + off);
  vec4 lg = lensBlurred(coord);
  vec4 lb = lensBlurred(coord - off);

  gl_FragColor = vec4(lr.r, lg.g, lb.b, max(max(lr.a, lg.a), lb.a));
}
