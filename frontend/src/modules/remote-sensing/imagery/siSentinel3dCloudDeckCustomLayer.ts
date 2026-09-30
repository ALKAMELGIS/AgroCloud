/**
 * Mapbox custom layer: Sentinel cloud mask as a soft, lit atmospheric volume in 3D.
 */

import mapboxgl, { type CustomLayerInterface, type Map as MapboxMap } from 'mapbox-gl'
import {
  buildAtmosphericCloudMesh,
  buildPixelLiftCloudDeckMesh,
  SI_CLOUD_ATMOSPHERE_SHELLS,
} from './siSentinel3dCloudAtmosphere'

export const SI_SENTINEL_3D_CLOUD_DECK_LAYER_ID = 'si-sentinel-3d-cloud-deck'

export type SiSentinel3dCloudDeckPayload = {
  imageUrl: string
  deckAltitudeM: number
  deckVerticalSpreadM?: number
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  /** Lift the WMS cloud mask as-is (same pixels as 2D); default atmospheric puff mesh when false. */
  pixelLift?: boolean
}

const VERT = `#version 300 es
uniform mat4 u_matrix;
in vec4 a_pos;
in vec2 a_uv;
in float a_density;
out vec2 v_uv;
out float v_density;
void main() {
  gl_Position = u_matrix * a_pos;
  v_uv = a_uv;
  v_density = a_density;
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_texSize;
uniform float u_shellAlpha;
uniform float u_pixelLift;
uniform vec3 u_sunDir;
in vec2 v_uv;
in float v_density;
out vec4 fragColor;

float sampleDensity(vec2 uv) {
  vec4 c = texture(u_image, uv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return c.a * min(1.0, lum * 1.15 + 0.12);
}

void main() {
  vec4 src = texture(u_image, v_uv);
  if (u_pixelLift > 0.5) {
    if (src.a < 0.04) discard;
    fragColor = vec4(src.rgb, src.a * 0.96);
    return;
  }
  float density = max(v_density, sampleDensity(v_uv));
  if (density < 0.035) discard;

  vec2 px = 1.0 / u_texSize;
  float dL = sampleDensity(v_uv - vec2(px.x, 0.0));
  float dR = sampleDensity(v_uv + vec2(px.x, 0.0));
  float dT = sampleDensity(v_uv - vec2(0.0, px.y));
  float dB = sampleDensity(v_uv + vec2(0.0, px.y));
  vec3 n = normalize(vec3(dL - dR, dB - dT, 0.22));

  float diffuse = 0.48 + 0.52 * max(dot(n, normalize(u_sunDir)), 0.0);
  vec3 base = mix(vec3(0.82, 0.86, 0.94), src.rgb, 0.72);
  vec3 lit = base * diffuse;
  float rim = pow(1.0 - clamp(dot(n, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.2) * 0.28;
  lit += vec3(1.0, 0.98, 0.92) * rim;
  lit = mix(lit, vec3(0.75, 0.82, 0.95), (1.0 - density) * 0.35);

  float alpha = clamp(density * u_shellAlpha * 0.95, 0.0, 0.92);
  fragColor = vec4(lit, alpha);
}`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed')
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('createProgram failed')
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed')
  }
  return program
}

type ShellGpu = {
  buffer: WebGLBuffer
  vertexCount: number
  shellAlpha: number
}

type DeckLayerState = {
  map: MapboxMap
  gl: WebGL2RenderingContext
  program: WebGLProgram
  shells: ShellGpu[]
  texture: WebGLTexture | null
  payload: SiSentinel3dCloudDeckPayload | null
  textureReady: boolean
  texWidth: number
  texHeight: number
  posLoc: number
  uvLoc: number
  densityLoc: number
  matrixLoc: WebGLUniformLocation | null
  imageLoc: WebGLUniformLocation | null
  texSizeLoc: WebGLUniformLocation | null
  shellAlphaLoc: WebGLUniformLocation | null
  sunDirLoc: WebGLUniformLocation | null
  pixelLiftLoc: WebGLUniformLocation | null
}

function readImageRgba(img: HTMLImageElement): { data: Uint8ClampedArray; width: number; height: number } {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: imageData.data, width: canvas.width, height: canvas.height }
}

function uploadShellMeshes(
  gl: WebGL2RenderingContext,
  payload: SiSentinel3dCloudDeckPayload,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ShellGpu[] {
  const shells: ShellGpu[] = []
  const pixelLift = payload.pixelLift !== false
  const shellCount = pixelLift ? 1 : SI_CLOUD_ATMOSPHERE_SHELLS.length
  const shellStart = pixelLift ? 1 : 0
  for (let s = shellStart; s < shellStart + shellCount; s += 1) {
    const mesh = pixelLift
      ? buildPixelLiftCloudDeckMesh(payload, s)
      : buildAtmosphericCloudMesh(payload, rgba, width, height, s)
    if (mesh.vertexCount < 3) continue
    const buffer = gl.createBuffer()
    if (!buffer) continue
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.interleaved, gl.STATIC_DRAW)
    shells.push({
      buffer,
      vertexCount: mesh.vertexCount,
      shellAlpha: pixelLift ? 1 : SI_CLOUD_ATMOSPHERE_SHELLS[s]!.alpha,
    })
  }
  return shells
}

function deleteShells(gl: WebGL2RenderingContext, shells: ShellGpu[]) {
  for (const shell of shells) gl.deleteBuffer(shell.buffer)
}

function loadTextureAndRgba(
  gl: WebGL2RenderingContext,
  url: string,
  pixelLift: boolean,
): Promise<{ tex: WebGLTexture; rgba: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const { data, width, height } = readImageRgba(img)
        const tex = gl.createTexture()
        if (!tex) {
          reject(new Error('createTexture failed'))
          return
        }
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const filter = pixelLift ? gl.NEAREST : gl.LINEAR
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        resolve({ tex, rgba: data, width, height })
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('cloud deck image load failed'))
    img.src = url
  })
}

function applyPayload(state: DeckLayerState, payload: SiSentinel3dCloudDeckPayload) {
  state.payload = payload
  state.textureReady = false
  deleteShells(state.gl, state.shells)
  state.shells = []
  if (state.texture) {
    state.gl.deleteTexture(state.texture)
    state.texture = null
  }
  void loadTextureAndRgba(state.gl, payload.imageUrl, payload.pixelLift !== false)
    .then(({ tex, rgba, width, height }) => {
      if (state.payload !== payload) {
        state.gl.deleteTexture(tex)
        return
      }
      state.texture = tex
      state.texWidth = width
      state.texHeight = height
      state.shells = uploadShellMeshes(state.gl, payload, rgba, width, height)
      state.textureReady = state.shells.length > 0
      state.map.triggerRepaint()
    })
    .catch(() => {
      state.textureReady = false
    })
}

function drawShells(state: DeckLayerState, gl: WebGL2RenderingContext, matrix: number[]) {
  const stride = 7 * 4
  gl.useProgram(state.program)
  gl.uniformMatrix4fv(state.matrixLoc, false, matrix)
  gl.uniform3f(state.sunDirLoc, 0.38, 0.22, 0.9)
  gl.uniform1f(state.pixelLiftLoc, state.payload?.pixelLift !== false ? 1 : 0)
  gl.uniform2f(state.texSizeLoc, state.texWidth, state.texHeight)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, state.texture)
  gl.uniform1i(state.imageLoc, 0)

  for (const shell of state.shells) {
    gl.uniform1f(state.shellAlphaLoc, shell.shellAlpha)
    gl.bindBuffer(gl.ARRAY_BUFFER, shell.buffer)
    gl.enableVertexAttribArray(state.posLoc)
    gl.vertexAttribPointer(state.posLoc, 4, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(state.uvLoc)
    gl.vertexAttribPointer(state.uvLoc, 2, gl.FLOAT, false, stride, 16)
    gl.enableVertexAttribArray(state.densityLoc)
    gl.vertexAttribPointer(state.densityLoc, 1, gl.FLOAT, false, stride, 24)
    gl.drawArrays(gl.TRIANGLES, 0, shell.vertexCount)
  }
}

function createDeckCustomLayer(initial: SiSentinel3dCloudDeckPayload): CustomLayerInterface & {
  setDeckPayload: (payload: SiSentinel3dCloudDeckPayload) => void
} {
  const state: DeckLayerState = {
    map: null as unknown as MapboxMap,
    gl: null as unknown as WebGL2RenderingContext,
    program: null as unknown as WebGLProgram,
    shells: [],
    texture: null,
    payload: null,
    textureReady: false,
    texWidth: 1,
    texHeight: 1,
    posLoc: 0,
    uvLoc: 0,
    densityLoc: 0,
    matrixLoc: null,
    imageLoc: null,
    texSizeLoc: null,
    shellAlphaLoc: null,
    sunDirLoc: null,
    pixelLiftLoc: null,
  }

  const layer: CustomLayerInterface & { setDeckPayload: (payload: SiSentinel3dCloudDeckPayload) => void } = {
    id: SI_SENTINEL_3D_CLOUD_DECK_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      state.map = map
      state.gl = gl
      state.program = createProgram(gl)
      state.posLoc = gl.getAttribLocation(state.program, 'a_pos')
      state.uvLoc = gl.getAttribLocation(state.program, 'a_uv')
      state.densityLoc = gl.getAttribLocation(state.program, 'a_density')
      state.matrixLoc = gl.getUniformLocation(state.program, 'u_matrix')
      state.imageLoc = gl.getUniformLocation(state.program, 'u_image')
      state.texSizeLoc = gl.getUniformLocation(state.program, 'u_texSize')
      state.shellAlphaLoc = gl.getUniformLocation(state.program, 'u_shellAlpha')
      state.pixelLiftLoc = gl.getUniformLocation(state.program, 'u_pixelLift')
      state.sunDirLoc = gl.getUniformLocation(state.program, 'u_sunDir')
      applyPayload(state, initial)
    },
    onRemove() {
      deleteShells(state.gl, state.shells)
      if (state.texture) state.gl.deleteTexture(state.texture)
      if (state.program) state.gl.deleteProgram(state.program)
      state.shells = []
      state.texture = null
      state.textureReady = false
      state.payload = null
    },
    render(gl, matrix) {
      if (!state.textureReady || !state.texture || !state.program || !state.shells.length) return
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      drawShells(state, gl, matrix)
      gl.depthMask(true)
    },
    setDeckPayload(payload: SiSentinel3dCloudDeckPayload) {
      if (!state.gl || !state.map) return
      applyPayload(state, payload)
      state.map.triggerRepaint()
    },
  }
  return layer
}

let activeLayer: (CustomLayerInterface & { setDeckPayload?: (p: SiSentinel3dCloudDeckPayload) => void }) | null =
  null

export function syncSiSentinel3dCloudDeckLayer(
  map: MapboxMap | null | undefined,
  payload: SiSentinel3dCloudDeckPayload | null,
): void {
  if (!map?.getStyle) return
  const id = SI_SENTINEL_3D_CLOUD_DECK_LAYER_ID
  if (!payload) {
    if (map.getLayer(id)) map.removeLayer(id)
    activeLayer = null
    return
  }
  const existing = map.getLayer(id)
  if (existing && activeLayer && typeof activeLayer.setDeckPayload === 'function') {
    activeLayer.setDeckPayload(payload)
    return
  }
  if (existing) map.removeLayer(id)
  activeLayer = createDeckCustomLayer(payload)
  map.addLayer(activeLayer)
}
