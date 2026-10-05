import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { useMap } from 'react-leaflet'
import { weatherFieldPane } from './weatherMapPanes'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import type { FieldGridPoint } from './weatherFieldGrid'
import { buildColorLutRgba } from './weatherColorLut'
import {
  buildScalarMesh,
  legendValueRange,
  meshDimensionsForZoom,
  type ScalarMesh,
} from './weatherScalarMesh'
import { interpolateColor, windDirectionColor } from './weatherColorRamp'

type Props = {
  samples: FieldGridPoint[]
  layer: WeatherMapLayerDef
  enabled: boolean
  opacity?: number
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_field;
uniform sampler2D u_lut;
uniform float u_opacity;
out vec4 outColor;
void main() {
  float n = texture(u_field, v_uv).r;
  if (n < 0.001) {
    discard;
  }
  vec4 c = texture(u_lut, vec2(n, 0.5));
  outColor = vec4(c.rgb, c.a * u_opacity);
}
`

function createGlProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!vs || !fs) return null
  gl.shaderSource(vs, vert)
  gl.shaderSource(fs, frag)
  gl.compileShader(vs)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    return null
  }
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  return prog
}

function drawCanvas2d(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mesh: ScalarMesh,
  layer: WeatherMapLayerDef,
  opacity: number,
  map: L.Map,
) {
  const isWindDir = layer.id === 'wind_direction'
  const img = ctx.createImageData(w, h)
  const data = img.data
  const step = w > 900 ? 2 : 1
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const latlng = map.containerPointToLatLng([x, y])
      const v = sampleMeshAt(mesh, latlng.lat, latlng.lng)
      if (v == null) continue
      const css = isWindDir ? windDirectionColor(v) : interpolateColor(layer.legendStops, v)
      const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (!m) continue
      const r = Number(m[1])
      const g = Number(m[2])
      const b = Number(m[3])
      const a = Math.round(255 * opacity)
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const px = x + dx
          const py = y + dy
          if (px >= w || py >= h) continue
          const i = (py * w + px) * 4
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = a
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

function sampleMeshAt(mesh: ScalarMesh, lat: number, lng: number): number | null {
  const { bbox, cols, rows, values } = mesh
  if (lng < bbox.west || lng > bbox.east || lat < bbox.south || lat > bbox.north) return null
  const fx = ((lng - bbox.west) / Math.max(bbox.east - bbox.west, 1e-9)) * (cols - 1)
  const fy = ((lat - bbox.south) / Math.max(bbox.north - bbox.south, 1e-9)) * (rows - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const v00 = values[y0 * cols + x0]
  const v10 = values[y0 * cols + x1]
  const v01 = values[y1 * cols + x0]
  const v11 = values[y1 * cols + x1]
  if (![v00, v10, v01, v11].every(Number.isFinite)) return null
  const top = v00 + (v10 - v00) * tx
  const bot = v01 + (v11 - v01) * tx
  return top + (bot - top) * ty
}

export function WeatherScalarFieldOverlay({ samples, layer, enabled, opacity = 0.78 }: Props) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const meshRef = useRef<ScalarMesh | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || samples.length < 4) return

    const canvas = document.createElement('canvas')
    canvas.className = 'weather-scalar-field-overlay'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '212'
    canvasRef.current = canvas
    weatherFieldPane(map).appendChild(canvas)

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
    glRef.current = gl
    let program: WebGLProgram | null = null
    let fieldTex: WebGLTexture | null = null
    let lutTex: WebGLTexture | null = null
    let buf: WebGLBuffer | null = null

    if (gl) {
      program = createGlProgram(gl, VERT, FRAG)
      if (program) {
        buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        fieldTex = gl.createTexture()
        lutTex = gl.createTexture()
      }
    }

    const render = () => {
      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = size.x
      const h = size.y
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      const b = map.getBounds()
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
      const { cols, rows } = meshDimensionsForZoom(map.getZoom())
      const mesh = buildScalarMesh(samples, bbox, cols, rows, layer)
      meshRef.current = mesh
      if (!mesh) return

      const { min, max } = legendValueRange(layer)

      if (gl && program && fieldTex && lutTex && buf && layer.id !== 'wind_direction') {
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        const fieldData = new Uint8Array(mesh.cols * mesh.rows * 4)
        for (let i = 0; i < mesh.values.length; i++) {
          const v = mesh.values[i]
          const n = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0
          const byte = Math.round(n * 255)
          fieldData[i * 4] = byte
          fieldData[i * 4 + 1] = 0
          fieldData[i * 4 + 2] = 0
          fieldData[i * 4 + 3] = Number.isFinite(v) ? 255 : 0
        }

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, fieldTex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mesh.cols, mesh.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, fieldData)

        const lut = buildColorLutRgba(layer.legendStops, min, max)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, lutTex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut)

        const locPos = gl.getAttribLocation(program, 'a_pos')
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.enableVertexAttribArray(locPos)
        gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)

        gl.uniform1i(gl.getUniformLocation(program, 'u_field'), 0)
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1)
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawCanvas2d(ctx, w, h, mesh, layer, opacity, map as LeafletMap)
    }

    const schedule = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(render)
    }

    schedule()
    map.on('move zoom resize viewreset', schedule)

    return () => {
      map.off('move zoom resize viewreset', schedule)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      canvas.remove()
      canvasRef.current = null
      glRef.current = null
    }
  }, [map, samples, layer, enabled, opacity])

  return null
}
