import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { useMap } from 'react-leaflet'
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
import { weatherFieldPane } from './weatherMapPanes'

type Props = {
  samples: FieldGridPoint[]
  samplesNext?: FieldGridPoint[]
  frameBlend?: number
  layer: WeatherMapLayerDef
  enabled: boolean
  opacity?: number
  /** Map-aligned Canvas (required for Open-Meteo IDW raster over basemap). */
  geographicCanvas?: boolean
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
  vec4 field = texture(u_field, vec2(v_uv.x, v_uv.y));
  if (field.a < 0.45) {
    discard;
  }
  vec4 c = texture(u_lut, vec2(field.r, 0.5));
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

function mapBounds(map: LeafletMap) {
  const b = map.getBounds()
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
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

function paintDirectionCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mesh: ScalarMesh,
  opacity: number,
  map: LeafletMap,
) {
  const img = ctx.createImageData(w, h)
  const data = img.data
  const step = w > 1000 ? 2 : 1
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const latlng = map.containerPointToLatLng([x, y])
      const v = sampleMeshAt(mesh, latlng.lat, latlng.lng)
      if (v == null) continue
      const css = windDirectionColor(v)
      const m = css.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/)
      if (!m) continue
      const hue = Number(m[1])
      const sat = Number(m[2])
      const lit = Number(m[3])
      const a = Math.round(255 * opacity)
      const rgb = hslToRgb(hue, sat, lit)
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const px = x + dx
          const py = y + dy
          if (px >= w || py >= h) continue
          const i = (py * w + px) * 4
          data[i] = rgb[0]
          data[i + 1] = rgb[1]
          data[i + 2] = rgb[2]
          data[i + 3] = a
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100
  const lig = l / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = lig - c / 2
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function paintScalarCanvas2d(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mesh: ScalarMesh,
  layer: WeatherMapLayerDef,
  opacity: number,
  map: LeafletMap,
) {
  const img = ctx.createImageData(w, h)
  const data = img.data
  const step = w > 1000 ? 2 : w > 700 ? 2 : 1
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const latlng = map.containerPointToLatLng([x, y])
      const v = sampleMeshAt(mesh, latlng.lat, latlng.lng)
      if (v == null) continue
      const css = interpolateColor(layer.legendStops, v)
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

/**
 * Geospatial Open-Meteo raster aligned to the Leaflet viewport (Windy-style).
 * Grid → IDW mesh → WebGL/Canvas overlay on the existing map pane.
 */
function blendMeshValues(
  mesh: ScalarMesh,
  meshNext: ScalarMesh | null,
  blend: number,
): Float32Array {
  if (!meshNext || blend <= 0.001) return mesh.values
  const out = new Float32Array(mesh.values.length)
  const b = Math.max(0, Math.min(1, blend))
  for (let i = 0; i < mesh.values.length; i++) {
    const a = mesh.values[i]
    const n = meshNext.values[i]
    if (!Number.isFinite(a) && !Number.isFinite(n)) {
      out[i] = NaN
      continue
    }
    if (!Number.isFinite(a)) out[i] = n
    else if (!Number.isFinite(n)) out[i] = a
    else out[i] = a * (1 - b) + n * b
  }
  return out
}

export function WeatherLiveRasterOverlay({
  samples,
  samplesNext = [],
  frameBlend = 0,
  layer,
  enabled,
  opacity = 0.78,
  geographicCanvas = false,
}: Props) {
  const map = useMap()
  const samplesRef = useRef(samples)
  const samplesNextRef = useRef(samplesNext)
  const blendRef = useRef(frameBlend)
  const layerRef = useRef(layer)
  const opacityRef = useRef(opacity)
  const geographicRef = useRef(geographicCanvas)
  samplesRef.current = samples
  samplesNextRef.current = samplesNext
  blendRef.current = frameBlend
  layerRef.current = layer
  opacityRef.current = opacity
  geographicRef.current = geographicCanvas

  const glStateRef = useRef<{
    gl: WebGL2RenderingContext
    program: WebGLProgram
    fieldTex: WebGLTexture
    lutTex: WebGLTexture
    buf: WebGLBuffer
  } | null>(null)

  useEffect(() => {
    if (!enabled) return

    const canvas = document.createElement('canvas')
    canvas.className = 'weather-live-raster-overlay'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '2'
    weatherFieldPane(map).appendChild(canvas)

    const scalar2dCanvas = document.createElement('canvas')
    scalar2dCanvas.className = 'weather-live-raster-overlay weather-live-raster-overlay--scalar2d'
    scalar2dCanvas.style.position = 'absolute'
    scalar2dCanvas.style.left = '0'
    scalar2dCanvas.style.top = '0'
    scalar2dCanvas.style.pointerEvents = 'none'
    scalar2dCanvas.style.zIndex = '3'
    scalar2dCanvas.style.display = 'none'
    weatherFieldPane(map).appendChild(scalar2dCanvas)

    const dirCanvas = document.createElement('canvas')
    dirCanvas.className = 'weather-live-raster-overlay weather-live-raster-overlay--direction'
    dirCanvas.style.position = 'absolute'
    dirCanvas.style.left = '0'
    dirCanvas.style.top = '0'
    dirCanvas.style.pointerEvents = 'none'
    dirCanvas.style.zIndex = '3'
    dirCanvas.style.display = 'none'
    weatherFieldPane(map).appendChild(dirCanvas)

    const gl =
      geographicCanvas ? null : canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
    if (gl) {
      const program = createGlProgram(gl, VERT, FRAG)
      if (program) {
        const buf = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        glStateRef.current = {
          gl,
          program,
          fieldTex: gl.createTexture()!,
          lutTex: gl.createTexture()!,
          buf,
        }
      }
    }

    let lastW = 0
    let lastH = 0
    let rafId: number | null = null

    const render = () => {
      const s = samplesRef.current
      const lyr = layerRef.current
      const op = opacityRef.current
      if (s.length < 3) {
        const g = canvas.getContext('webgl2')
        if (g) {
          g.clearColor(0, 0, 0, 0)
          g.clear(g.COLOR_BUFFER_BIT)
        }
        const dctx = dirCanvas.getContext('2d')
        dctx?.clearRect(0, 0, dirCanvas.width, dirCanvas.height)
        return
      }

      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = size.x
      const h = size.y
      if (w !== lastW || h !== lastH) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        dirCanvas.width = Math.round(w * dpr)
        dirCanvas.height = Math.round(h * dpr)
        dirCanvas.style.width = `${w}px`
        dirCanvas.style.height = `${h}px`
        scalar2dCanvas.width = Math.round(w * dpr)
        scalar2dCanvas.height = Math.round(h * dpr)
        scalar2dCanvas.style.width = `${w}px`
        scalar2dCanvas.style.height = `${h}px`
        lastW = w
        lastH = h
      }

      const bbox = mapBounds(map)
      const { cols, rows } = meshDimensionsForZoom(map.getZoom())
      const mesh = buildScalarMesh(s, bbox, cols, rows, lyr)
      if (!mesh) return
      const sNext = samplesNextRef.current
      const meshNext =
        sNext.length >= 3 && blendRef.current > 0.001
          ? buildScalarMesh(sNext, bbox, cols, rows, lyr)
          : null
      const values = blendMeshValues(mesh, meshNext, blendRef.current)
      const renderMesh: ScalarMesh = { ...mesh, values }

      const isWindDir = lyr.id === 'wind_direction'
      const state = geographicRef.current ? null : glStateRef.current
      canvas.style.display = isWindDir || geographicRef.current ? 'none' : state ? 'block' : 'none'
      scalar2dCanvas.style.display =
        isWindDir || (!geographicRef.current && state) ? 'none' : 'block'
      dirCanvas.style.display = isWindDir ? 'block' : 'none'

      if (isWindDir) {
        const ctx = dirCanvas.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        paintDirectionCanvas(ctx, w, h, renderMesh, op, map)
        return
      }

      const { min, max } = legendValueRange(lyr)

      if (!state && !isWindDir) {
        const ctx2d = scalar2dCanvas.getContext('2d')
        if (ctx2d) {
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx2d.clearRect(0, 0, w, h)
          paintScalarCanvas2d(ctx2d, w, h, renderMesh, lyr, op, map)
        }
        return
      }

      if (state) {
        const { gl, program, fieldTex, lutTex, buf } = state
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        const fieldData = new Uint8Array(renderMesh.cols * renderMesh.rows * 4)
        for (let i = 0; i < values.length; i++) {
          const v = values[i]
          const n = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0
          fieldData[i * 4] = Math.round(n * 255)
          fieldData[i * 4 + 3] = Number.isFinite(v) ? 255 : 0
        }

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, fieldTex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          renderMesh.cols,
          renderMesh.rows,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          fieldData,
        )

        const lut = buildColorLutRgba(lyr.legendStops, min, max)
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
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), op)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        return
      }

    }

    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(render)
    }

    schedule()
    map.on('move', schedule)
    map.on('zoom', schedule)
    map.on('resize viewreset', schedule)
    map.on('moveend zoomend', schedule)
    map.on('weather:raster', schedule)

    return () => {
      map.off('move', schedule)
      map.off('zoom', schedule)
      map.off('resize viewreset', schedule)
      map.off('moveend zoomend', schedule)
      map.off('weather:raster', schedule)
      if (rafId != null) cancelAnimationFrame(rafId)
      canvas.remove()
      dirCanvas.remove()
      scalar2dCanvas.remove()
      glStateRef.current = null
    }
  }, [map, enabled, layer, opacity, geographicCanvas])

  useEffect(() => {
    if (!enabled) return
    const id = requestAnimationFrame(() => {
      map.fire('weather:raster')
    })
    return () => cancelAnimationFrame(id)
  }, [map, enabled, samples, samplesNext, frameBlend])

  return null
}
