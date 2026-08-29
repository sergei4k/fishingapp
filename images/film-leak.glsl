precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/**
 * The photo to add light leaks to.
 * @label Image
 */
uniform sampler2D u_image;

/**
 * Overall brightness of the light leaks.
 * @label Leak Intensity
 * @default 1
 * @range 0, 1
 */
uniform float u_leakIntensity;

/**
 * How many light leaks appear.
 * @label Leak Count
 * @default 2
 * @range 0, 6
 */
uniform float u_leakCount;

/**
 * Main leak color.
 * @label Leak Color 1
 * @color
 * @default #ff3b1e
 */
uniform vec3 u_leakColor1;

/**
 * Second leak color. Set both colors the same for a single tone.
 * @label Leak Color 2
 * @color
 * @default #1ecbff
 */
uniform vec3 u_leakColor2;

/**
 * How wide and spread out the leaks are.
 * @label Leak Width
 * @default 1
 * @range 0, 3
 */
uniform float u_leakWidth;

/**
 * How wavy the leaks are. 0 = straight streaks.
 * @label Leak Curve
 * @default 0.5
 * @range 0, 1
 */
uniform float u_leakCurve;

/**
 * Rotation of the leaks, in degrees.
 * @label Leak Angle
 * @default 0
 * @range 0, 360
 */
uniform float u_leakAngle;

/**
 * How easily the brightest part burns out to white.
 * @label Burn Out
 * @default 0.8
 * @range 0, 2
 */
uniform float u_leakHeat;

/**
 * Rainbow color fringing along the leak edges. 0 = off.
 * @label Rainbow Fringe
 * @default 0.4
 * @range 0, 1
 */
uniform float u_leakRainbow;

/**
 * Changes the random placement of the leaks.
 * @label Seed
 * @default 1
 * @range 0, 100
 */
uniform float u_seed;

/**
 * Film grain amount.
 * @label Film Grain
 * @default 0.09
 * @range 0, 0.5
 */
uniform float u_grain;

/**
 * Dust speck amount.
 * @label Dust
 * @default 0.5
 * @range 0, 1
 */
uniform float u_dust;

/**
 * Size of the dust specks.
 * @label Dust Size
 * @default 1.3
 * @range 0.5, 5
 */
uniform float u_dustSize;

/**
 * Faint film scratches.
 * @label Scratches
 * @default 0.4
 * @range 0, 1
 */
uniform float u_scratches;

vec2 coverUv(vec2 fragPix) {
  vec2 texSize = vec2(textureSize(u_image, 0));
  float frameAspect = u_resolution.x / u_resolution.y;
  float texAspect = texSize.x / texSize.y;
  vec2 scale = (frameAspect > texAspect)
    ? vec2(1.0, texAspect / frameAspect)
    : vec2(frameAspect / texAspect, 1.0);
  vec2 uv = (fragPix / u_resolution - 0.5) * scale + 0.5;
  uv.y = 1.0 - uv.y;
  return uv;
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453123);
}

float osc(float x) {
  return 0.5 + 0.5 * sin(x);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

vec3 toLinear(vec3 c) {
  return pow(max(c, 0.0), vec3(2.2));
}

vec3 toSRGB(vec3 c) {
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

float edgeWash(vec2 p, int edge, float reach, float bend) {
  float d = (edge == 0) ? p.x : (edge == 1) ? (1.0 - p.x) : (edge == 2) ? (1.0 - p.y) : p.y;
  float along = (edge < 2) ? p.y : p.x;
  d += sin(along * (2.5 + bend * 4.0) + bend * 10.0) * 0.07;
  return exp(-pow(max(d, 0.0) / reach, 1.5));
}

float scratchLines(vec2 p, float seed) {
  float s = 0.0;
  float across = dot(p, vec2(-0.4472, 0.8944)) * 70.0;
  float lines = smoothstep(0.96, 1.0, sin(across) * 0.5 + 0.5);
  s += lines * smoothstep(0.55, 0.8, fbm(p * vec2(3.0, 9.0) + seed)) * 0.1;

  for (int i = 0; i < 2; i++) {
    float b = seed * 5.0 + float(i) * 13.7;
    if (hash11(b + 1.0) < 0.45) {
      continue;
    }
    float x = 0.1 + 0.8 * hash11(b + 2.0) + (0.02 + 0.05 * hash11(b + 3.0)) * sin(p.y * (4.0 + 6.0 * hash11(b + 4.0)) + hash11(b + 5.0) * 6.28);
    float yc = hash11(b + 6.0);
    float seg = smoothstep(0.0, 0.12, p.y - yc + 0.3) * smoothstep(0.0, 0.12, yc + 0.3 - p.y);
    s += smoothstep(0.003, 0.0, abs(p.x - x)) * seg * 0.7;
  }
  return s;
}

float dustLayer(vec2 frag, float scale, float thresh) {
  vec2 cell = floor(frag / scale);
  if (hash21(cell + 0.5) < thresh) {
    return 0.0;
  }
  vec2 center = (cell + vec2(hash21(cell + 3.1), hash21(cell + 5.9))) * scale;
  float rad = 1.0 + 2.0 * hash21(cell + 9.2);
  vec2 d = frag - center;
  d.x *= 0.8 + 0.4 * hash21(cell + 13.7);
  float dist = length(d) + (fbm(frag * 0.9 + cell * 2.0) - 0.5) * rad * 0.45;
  return (1.0 - smoothstep(rad * 0.6, rad, dist)) * (0.2 + 0.8 * hash21(cell + 11.3));
}

vec3 leakField(vec2 p) {
  float ang = radians(u_leakAngle);
  float aspect = u_resolution.x / u_resolution.y;
  vec2 q = (p - 0.5) * vec2(aspect, 1.0);
  q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
  p = q / vec2(aspect, 1.0) + 0.5;

  float tex = 0.65 + 0.55 * fbm(p * 1.6);
  float w = max(u_leakWidth, 0.05);
  vec3 leak = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= u_leakCount) {
      break;
    }
    float b0 = u_seed * 19.19 + float(i) * 7.123;
    float type = hash11(b0 + 2.1);
    float rx = hash11(b0 + 3.9);
    float rw = hash11(b0 + 4.5);
    float rs = hash11(b0 + 6.7);
    float ra = hash11(b0 + 9.4);
    float strength = 0.5 + hash11(b0 + 8.2) * 0.4;
    vec3 c = toLinear(mix(u_leakColor1, u_leakColor2, step(0.5, hash11(b0 + 4.1))));

    float heat;
    if (type < 0.6) {
      float curve = u_leakCurve;
      float a = p.y * (1.8 + hash11(b0 + 5.3) * 2.5) + hash11(b0 + 1.1) * 6.28;
      float cx = rx + curve * 0.12 * sin(a);
      float bw = (0.06 + rw * 0.18) * w * mix(1.0, 0.6 + 0.8 * osc(a * 1.2), curve);

      float asym = mix(1.0, 0.7 + 0.5 * sin(a * 0.9), curve);
      float dxg = (p.x - cx) / (bw * (p.x < cx ? asym : 2.0 - asym));
      float dxc = (p.x - cx - curve * bw * 0.45 * sin(a * 1.5)) / (bw * (0.18 + 0.22 * osc(a * 1.8)));

      float glow = exp(-dxg * dxg * 1.25);
      float core = exp(-dxc * dxc) * (0.7 + 0.9 * osc(a * 1.1));

      float hotEnd = (rs < 0.5) ? p.y : 1.0 - p.y;
      heat = (glow * 0.7 + core * 1.3) * (0.45 + 0.55 * hotEnd + 0.35 * smoothstep(0.85, 1.0, 1.0 - hotEnd));
    } else {
      int edge = int(min(floor(ra * 4.0), 3.0));
      float reach = (0.22 + rs * 0.4) * w;
      heat = edgeWash(p, edge, reach, ra) * 0.7 + edgeWash(p, edge, reach * 0.4, ra) * 1.3;
    }

    leak += c * heat * strength * tex;
  }
  return leak * u_leakIntensity;
}

void main() {
  vec2 p = gl_FragCoord.xy / u_resolution;
  vec3 base = texture2D(u_image, coverUv(gl_FragCoord.xy)).rgb;

  float ab = u_leakRainbow * 0.02;
  vec3 leak = (ab > 0.0001)
    ? vec3(leakField(p + vec2(ab, 0.0)).r, leakField(p).g, leakField(p - vec2(ab, 0.0)).b)
    : leakField(p);

  float lmax = max(max(leak.r, leak.g), leak.b);
  leak += vec3(max(lmax - 1.0, 0.0)) * u_leakHeat;

  vec3 lin = toLinear(base) + leak;
  lin += toLinear(vec3(0.95, 0.96, 1.0)) * scratchLines(p, u_seed) * u_scratches;

  vec3 col = toSRGB(lin);

  float sz = max(u_dustSize, 0.5);
  float dust = dustLayer(gl_FragCoord.xy, sz * 9.0, 0.965) + dustLayer(gl_FragCoord.xy, sz * 15.0, 0.955);
  col += vec3(dust) * u_dust * 0.9;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 g = vec3(hash21(gl_FragCoord.xy), hash21(gl_FragCoord.xy + 19.3), hash21(gl_FragCoord.xy + 47.1));
  g = mix(vec3(dot(g, vec3(0.3333))), g, 0.25) - 0.5;
  col += g * u_grain * (0.5 + lum * (1.0 - lum) * 2.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
