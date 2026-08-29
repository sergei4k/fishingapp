/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float wave = sin(uv.x * 11.0 - u_time * 0.45) * 0.5 + 0.5;
  float field = noise(uv * 14.0 + vec2(u_time * 0.025, 0.0));
  float haze = smoothstep(0.08, 0.82, uv.x + wave * 0.16);
  float grain = step(0.62, field) * (0.18 + 0.5 * haze);

  gl_FragColor = vec4(vec3(grain), grain * 0.72);
}