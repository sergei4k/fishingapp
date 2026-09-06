precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/**
 * The picture to print.
 * @label Image
 */
uniform sampler2D u_image;

/**
 * @label Paper Color
 * @color
 * @default #f4efe2
 */
uniform vec3 u_paperColor;

/**
 * Print dot size, in pixels. Small = fine, large = comic-book.
 * @label Dot Size
 * @default 6
 * @range 2, 40
 */
uniform float u_dotSize;

/**
 * Brightness. Higher shows more dots in the dark areas.
 * @label Brightness
 * @default 1.5
 * @range 0.1, 3
 */
uniform float u_brightness;

/**
 * Contrast. Higher = punchier and more graphic.
 * @label Contrast
 * @default 1
 * @range 0, 3
 */
uniform float u_contrast;

/**
 * How heavily the ink is laid down. Lower = faded look.
 * @label Ink Amount
 * @default 1
 * @range 0, 2
 */
uniform float u_inkAmount;

/**
 * Dot crispness. Low = soft ink, high = sharp dots.
 * @label Sharpness
 * @default 0.85
 * @range 0, 1
 */
uniform float u_sharpness;

/**
 * Misalignment between the inks, like a cheap print. 0 = aligned.
 * @label Color Offset
 * @default 0
 * @range 0, 10
 */
uniform float u_colorOffset;

/**
 * Speckled paper texture. 0 = clean.
 * @label Grain
 * @default 0
 * @range 0, 0.5
 */
uniform float u_grain;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 coverUv(vec2 fragPix) {
  vec2 texSize = vec2(textureSize(u_image, 0));
  float frameAspect = u_resolution.x / u_resolution.y;
  float texAspect = texSize.x / texSize.y;
  vec2 scale = (frameAspect > texAspect) ? vec2(1.0, texAspect / frameAspect) : vec2(frameAspect / texAspect, 1.0);
  vec2 uv = (fragPix / u_resolution - 0.5) * scale + 0.5;
  uv.y = 1.0 - uv.y;
  return uv;
}

vec4 toCmyk(vec3 rgb) {
  float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
  float inv = 1.0 - k;
  return inv < 1e-4 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4((1.0 - rgb - k) / inv, k);
}

float screen(float angleDeg, int channel, vec2 inkOffset) {
  float a = radians(angleDeg);
  float ca = cos(a);
  float sa = sin(a);
  float cell = max(u_dotSize, 2.0);

  mat2 inv = mat2(ca, sa, -sa, ca);
  vec2 rc = mat2(ca, -sa, sa, ca) * (gl_FragCoord.xy + inkOffset);
  vec2 centerRot = (floor(rc / cell) + 0.5) * cell;
  vec2 centerPix = inv * centerRot - inkOffset;

  vec3 rgb = vec3(0.0);
  for (int sx = 0; sx < 2; sx++) {
    for (int sy = 0; sy < 2; sy++) {
      vec2 tap = inv * ((vec2(float(sx), float(sy)) - 0.5) * cell * 0.6);
      rgb += texture2D(u_image, coverUv(centerPix + tap)).rgb;
    }
  }
  rgb *= 0.25;
  rgb = pow(clamp(rgb, 0.0, 1.0), vec3(1.0 / max(u_brightness, 0.1)));
  rgb = clamp((rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  vec4 cmyk = toCmyk(rgb);
  float value = channel == 0 ? cmyk.x : channel == 1 ? cmyk.y : channel == 2 ? cmyk.z : cmyk.w;
  value = clamp(value * u_inkAmount, 0.0, 1.0);
  value = max(value - 0.05, 0.0) / 0.95;

  float radius = sqrt(value) * cell * 0.5;
  float aa = mix(2.5, 0.6, clamp(u_sharpness, 0.0, 1.0));
  return clamp(smoothstep(radius + aa, radius - aa, distance(rc, centerRot)), 0.0, 1.0);
}

void main() {
  float o = u_colorOffset;
  float c = screen(15.0, 0, vec2(o, 0.0));
  float m = screen(75.0, 1, vec2(-o * 0.5, o * 0.87));
  float y = screen(0.0, 2, vec2(-o * 0.5, -o * 0.87));
  float k = screen(45.0, 3, vec2(0.0, 0.0));

  vec3 color = u_paperColor;
  color.r *= 1.0 - c;
  color.g *= 1.0 - m;
  color.b *= 1.0 - y;
  color *= 1.0 - k;
  color += (hash(gl_FragCoord.xy) - 0.5) * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
