/** GLSL sources for fullscreen ray-marched volumetric clouds (WebGL2). */

export const CLOUD_RAYMARCH_VERT = `#version 300 es
out vec2 v_uvClip;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uvClip = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const CLOUD_RAYMARCH_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform mat4 u_invMatrix;
uniform vec2 u_viewport;
uniform vec3 u_centerMerc;
uniform float u_meterScale;
uniform vec3 u_halfExtents;
uniform vec3 u_sunDir;
uniform float u_shadowStep;

in vec2 v_uvClip;
out vec4 fragColor;

const int STEPS = 36;
const int SHADOW_STEPS = 6;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

vec3 mercatorToLocal(vec3 mc) {
  return vec3(
    (mc.x - u_centerMerc.x) / u_meterScale,
    (mc.y - u_centerMerc.y) / u_meterScale,
    (mc.z - u_centerMerc.z) / u_meterScale
  );
}

vec2 uvFromLocal(vec3 p) {
  return vec2(p.x / (2.0 * u_halfExtents.x) + 0.5, p.y / (2.0 * u_halfExtents.y) + 0.5);
}

float sampleDensity(vec3 p) {
  if (abs(p.x) > u_halfExtents.x || abs(p.y) > u_halfExtents.y || abs(p.z) > u_halfExtents.z) {
    return 0.0;
  }
  vec2 uv = uvFromLocal(p);
  if (uv.x < 0.01 || uv.x > 0.99 || uv.y < 0.01 || uv.y > 0.99) return 0.0;
  vec4 tex = texture(u_image, uv);
  float mask = tex.a * smoothstep(0.035, 0.32, tex.a);
  float hz = p.z / u_halfExtents.z;
  float vertical = exp(-hz * hz * 2.6);
  float n = noise3(p * vec3(0.014, 0.014, 0.022));
  float micro = mix(0.42, 1.0, n);
  return mask * vertical * micro;
}

float selfShadow(vec3 p, vec3 sunDir) {
  float od = 0.0;
  for (int i = 1; i <= SHADOW_STEPS; i++) {
    od += sampleDensity(p + sunDir * float(i) * u_shadowStep);
  }
  return exp(-od * 1.85);
}

bool intersectAABB(vec3 ro, vec3 rd, vec3 halfSize, out float t0, out float t1) {
  vec3 invRd = 1.0 / rd;
  vec3 tA = (-halfSize - ro) * invRd;
  vec3 tB = (halfSize - ro) * invRd;
  vec3 tSm = min(tA, tB);
  vec3 tBg = max(tA, tB);
  t0 = max(max(tSm.x, tSm.y), tSm.z);
  t1 = min(min(tBg.x, tBg.y), tBg.z);
  return t1 > max(t0, 0.0);
}

void main() {
  vec2 ndc = vec2(
    gl_FragCoord.x / u_viewport.x * 2.0 - 1.0,
    1.0 - gl_FragCoord.y / u_viewport.y * 2.0
  );
  vec4 near4 = u_invMatrix * vec4(ndc, -1.0, 1.0);
  vec4 far4 = u_invMatrix * vec4(ndc, 1.0, 1.0);
  vec3 roMerc = near4.xyz / near4.w;
  vec3 rdMerc = normalize(far4.xyz / far4.w - roMerc);

  vec3 ro = mercatorToLocal(roMerc);
  vec3 rd = normalize(mercatorToLocal(roMerc + rdMerc) - ro);

  float tEnter;
  float tExit;
  if (!intersectAABB(ro, rd, u_halfExtents, tEnter, tExit)) {
    discard;
  }

  float stepLen = (tExit - tEnter) / float(STEPS);
  vec3 accum = vec3(0.0);
  float trans = 1.0;

  for (int i = 0; i < STEPS; i++) {
    float t = tEnter + (float(i) + 0.5) * stepLen;
    vec3 p = ro + rd * t;
    float d = sampleDensity(p);
    if (d < 0.008) continue;

    vec2 uv = uvFromLocal(p);
    vec3 texCol = texture(u_image, uv).rgb;
    float sh = selfShadow(p, u_sunDir);
    float heightLight = 0.62 + 0.38 * clamp(p.z / u_halfExtents.z + 0.55, 0.0, 1.0);
    vec3 light = (0.28 + 0.72 * sh) * heightLight;
    float sigma = d * stepLen * 2.65;
    vec3 contrib = texCol * sigma * trans * light;
    accum += contrib;
    trans *= exp(-sigma);
    if (trans < 0.03) break;
  }

  float alpha = clamp(1.0 - trans, 0.0, 0.96);
  if (alpha < 0.02) discard;
  fragColor = vec4(accum, alpha);
}`
