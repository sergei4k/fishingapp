precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/**
 * The picture to stylize.
 * @label Image
 */
uniform sampler2D u_image;

/**
 * Style: 1 = dither dots, 2 = ASCII characters.
 * @label Style
 * @default 1
 * @range 1, 2
 */
uniform int u_style;

/**
 * Dot / character size, in pixels. Small = detailed, large = chunky.
 * @label Cell Size
 * @default 5
 * @range 1, 30
 */
uniform float u_cellSize;

/**
 * Brightness. Higher opens up the shadows.
 * @label Brightness
 * @default 1.3
 * @range 0.1, 3
 */
uniform float u_brightness;

/**
 * Contrast. Higher is punchier and more graphic.
 * @label Contrast
 * @default 1.15
 * @range 0, 3
 */
uniform float u_contrast;

/**
 * Keep the picture's own colors (1) or use the two tones below (0).
 * @label Keep Colors
 * @default 0
 * @range 0, 1
 */
uniform int u_keepColor;

/**
 * Dark tone: shadows in dither, background in ASCII.
 * @label Dark Color
 * @color
 * @default #16130b
 */
uniform vec3 u_darkColor;

/**
 * Light tone: highlights in dither, characters in ASCII.
 * @label Light Color
 * @color
 * @default #e8e4cf
 */
uniform vec3 u_lightColor;

/**
 * Dither shades. 2 = pure two-tone, higher is smoother.
 * @label Shades
 * @default 2
 * @range 2, 16
 */
uniform float u_shades;

vec2 coverUv(vec2 fragPix) {
  vec2 texSize = vec2(textureSize(u_image, 0));
  float frameAspect = u_resolution.x / u_resolution.y;
  float texAspect = texSize.x / texSize.y;
  vec2 scale = (frameAspect > texAspect) ? vec2(1.0, texAspect / frameAspect) : vec2(frameAspect / texAspect, 1.0);
  vec2 uv = (fragPix / u_resolution - 0.5) * scale + 0.5;
  uv.y = 1.0 - uv.y;
  return uv;
}

vec3 tone(vec3 rgb) {
  rgb = pow(clamp(rgb, 0.0, 1.0), vec3(1.0 / max(u_brightness, 0.1)));
  return clamp((rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

float glyph(int level, vec2 cellUv) {
  vec2 g = floor((cellUv - 0.05) / 0.9 * 8.0);
  if (g.x < 0.0 || g.x > 7.0 || g.y < 0.0 || g.y > 7.0) {
    return 0.0;
  }
  vec3 rows = (level <= 0) ? vec3(0.0)
    : (level == 1) ? vec3(0.0, 786432.0, 12.0)
    : (level == 2) ? vec3(789504.0, 786432.0, 12.0)
    : (level == 3) ? vec3(4128768.0, 4128768.0, 0.0)
    : (level == 4) ? vec3(789504.0, 789567.0, 0.0)
    : (level == 5) ? vec3(1966080.0, 3343155.0, 30.0)
    : (level == 6) ? vec3(6488064.0, 3546166.0, 99.0)
    : (level == 7) ? vec3(1966080.0, 3355443.0, 30.0)
    : (level == 8) ? vec3(1966080.0, 212787.0, 30.0)
    : (level == 9) ? vec3(1966080.0, 3358256.0, 110.0)
    : (level == 10) ? vec3(7208960.0, 4076339.0, 7984.0)
    : (level == 11) ? vec3(6488064.0, 8355691.0, 54.0)
    : (level == 12) ? vec3(8086334.0, 228219.0, 30.0)
    : (level == 13) ? vec3(8336950.0, 3571510.0, 54.0)
    : vec3(8353635.0, 6515583.0, 99.0);

  float fi = floor(g.y / 3.0);
  float comp = fi < 0.5 ? rows.x : fi < 1.5 ? rows.y : rows.z;
  float rowByte = mod(floor(comp / pow(256.0, g.y - fi * 3.0)), 256.0);
  return mod(floor(rowByte / exp2(g.x)), 2.0);
}

void main() {
  bool ascii = u_style == 2;
  float cell = max(u_cellSize, ascii ? 4.0 : 1.0);
  vec2 cellId = floor(gl_FragCoord.xy / cell);
  vec3 rgb = tone(texture2D(u_image, coverUv((cellId + 0.5) * cell)).rgb);
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));

  vec3 color;
  if (ascii) {
    int level = int(clamp(floor(lum * 15.0), 0.0, 14.0));
    vec2 cellUv = fract(gl_FragCoord.xy / cell);
    cellUv.y = 1.0 - cellUv.y;
    vec3 ink = u_keepColor == 1 ? rgb : u_lightColor;
    color = mix(u_darkColor, ink, glyph(level, cellUv));
  } else {
    float levels = max(u_shades, 2.0) - 1.0;
    float t = bayer4(cellId);
    if (u_keepColor == 1) {
      vec3 v = rgb * levels;
      color = (floor(v) + (1.0 - step(fract(v), vec3(t)))) / levels;
    } else {
      float v = lum * levels;
      float shade = clamp((floor(v) + (1.0 - step(fract(v), t))) / levels, 0.0, 1.0);
      color = mix(u_darkColor, u_lightColor, shade);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
