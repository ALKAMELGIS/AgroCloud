import type { HydroLegend, HydroStepResult } from './hydroEngine'
import {
  bboxFromGeometry,
  dataUrlToPngBase64,
  fetchEsriSatelliteBasemapForBbox,
  mapLngLatToMercatorBox,
  type LngLatBbox,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesMapSnapshot'

const SNAPSHOT_WIDTH = 900
const SNAPSHOT_HEIGHT = 520
const MARGIN = 44
const LEGEND_GAP = 12
const TITLE_H = 36
const FOOTER_H = 18
const MAP_Y = TITLE_H + 8
const MAP_H = SNAPSHOT_HEIGHT - TITLE_H - FOOTER_H - 16
const BASE_MAP_W = SNAPSHOT_WIDTH - MARGIN * 2

export type HydroRasterCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]

type SnapshotLayout = {
  mapX: number
  mapY: number
  mapW: number
  mapH: number
  legendX: number
  legendPanelW: number
}

function parseCssColor(color: string): string {
  const c = color.trim()
  if (!c || c === 'transparent' || c.includes('rgba(0,0,0,0)')) return '#cbd5e1'
  return c
}

function legendRowCount(legend: HydroLegend): number {
  if (legend.kind === 'gradient') return 1
  const labeled = legend.swatches.filter(s => (s.label || '').trim())
  return labeled.length || Math.min(legend.swatches.length, 1)
}

function measureLegendBox(legend: HydroLegend): { width: number; height: number } {
  const pad = 8
  const titleH = 16
  const rowH = 15
  if (legend.kind === 'gradient') {
    return { width: 210, height: titleH + pad + 12 + 14 + pad + (legend.note ? 12 : 4) }
  }
  const rows = legendRowCount(legend)
  const noteH = legend.note ? 12 : 0
  const longestLabel = legend.swatches.reduce((max, s) => Math.max(max, (s.label || '').length), 0)
  const width = Math.min(230, Math.max(165, longestLabel * 5.2 + 42))
  return { width, height: titleH + pad + rows * rowH + pad + noteH }
}

function resolveSnapshotLayout(legend?: HydroLegend): SnapshotLayout {
  if (!legend) {
    return {
      mapX: MARGIN,
      mapY: MAP_Y,
      mapW: BASE_MAP_W,
      mapH: MAP_H,
      legendX: 0,
      legendPanelW: 0,
    }
  }
  const box = measureLegendBox(legend)
  const legendPanelW = Math.min(248, Math.max(152, box.width + 20))
  const mapW = SNAPSHOT_WIDTH - MARGIN - LEGEND_GAP - legendPanelW - MARGIN
  return {
    mapX: MARGIN,
    mapY: MAP_Y,
    mapW,
    mapH: MAP_H,
    legendX: MARGIN + mapW + LEGEND_GAP,
    legendPanelW,
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

function bboxFromCornerCoords(coords: HydroRasterCoordinates): LngLatBbox {
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  }
}

function mergeBboxes(a: LngLatBbox, b: LngLatBbox): LngLatBbox {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  }
}

function padBbox(bbox: LngLatBbox, ratio = 0.08): LngLatBbox {
  const dLng = Math.max((bbox.maxLng - bbox.minLng) * ratio, 1e-6)
  const dLat = Math.max((bbox.maxLat - bbox.minLat) * ratio, 1e-6)
  return {
    minLng: bbox.minLng - dLng,
    minLat: bbox.minLat - dLat,
    maxLng: bbox.maxLng + dLng,
    maxLat: bbox.maxLat + dLat,
  }
}

/** North-up 2D Web Mercator extent shared by basemap, rasters, vectors, and AOI outline. */
export function resolveHydroSnapshotExtent(
  geometry: GeoJSON.Geometry,
  rasterCoordinates?: HydroRasterCoordinates | null,
): LngLatBbox | null {
  const geomBbox = bboxFromGeometry(geometry, 0.04)
  if (!geomBbox) return null
  if (!rasterCoordinates) return padBbox(geomBbox, 0.1)
  return padBbox(mergeBboxes(geomBbox, bboxFromCornerCoords(rasterCoordinates)), 0.06)
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (ring.length < 2) return
  const [x0, y0] = mapLngLatToMercatorBox(ring[0]![0], ring[0]![1], bbox, x, y, w, h)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i < ring.length; i += 1) {
    const [xi, yi] = mapLngLatToMercatorBox(ring[i]![0], ring[i]![1], bbox, x, y, w, h)
    ctx.lineTo(xi, yi)
  }
  ctx.closePath()
  ctx.stroke()
}

function drawAoiOutline(
  ctx: CanvasRenderingContext2D,
  geometry: GeoJSON.Geometry,
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save()
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 2
  const type = geometry.type
  if (type === 'Polygon') {
    ;(geometry.coordinates as [number, number][][]).forEach(ring => drawRing(ctx, ring, bbox, x, y, w, h))
  } else if (type === 'MultiPolygon') {
    ;(geometry.coordinates as [number, number][][][]).forEach(poly =>
      poly.forEach(ring => drawRing(ctx, ring, bbox, x, y, w, h)),
    )
  }
  ctx.restore()
}

function drawNorthArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(15,23,42,0.82)'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x, y - 18)
  ctx.lineTo(x - 8, y + 6)
  ctx.lineTo(x, y + 2)
  ctx.lineTo(x + 8, y + 6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('N', x, y + 20)
  ctx.restore()
}

function formatScaleDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

function drawScaleBar(ctx: CanvasRenderingContext2D, bbox: LngLatBbox, x: number, y: number, w: number): void {
  const lat = (bbox.minLat + bbox.maxLat) / 2
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const spanM = Math.max((bbox.maxLng - bbox.minLng) * metersPerDegLng, 1)
  const candidates = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  const targetPx = w * 0.22
  let best = candidates[0]!
  for (const c of candidates) {
    const px = (c / spanM) * w
    if (px <= targetPx) best = c
    else break
  }
  const barPx = Math.max(40, (best / spanM) * w)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  ctx.fillRect(x - 6, y - 22, barPx + 12, 30)
  ctx.strokeRect(x - 6, y - 22, barPx + 12, 30)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(x, y - 8, barPx, 6)
  ctx.font = '10px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(formatScaleDistance(best), x + barPx / 2, y - 12)
  ctx.restore()
}

function drawTitleBar(ctx: CanvasRenderingContext2D, title: string, subtitle: string | undefined, width: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(6, 78, 59, 0.88)'
  ctx.fillRect(0, 0, width, TITLE_H)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(title, 12, 22)
  if (subtitle) {
    ctx.font = '10px system-ui,sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(subtitle, 12, 34)
  }
  ctx.restore()
}

function drawMapNeatline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save()
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.restore()
}

function drawLegendPanel(
  ctx: CanvasRenderingContext2D,
  legend: HydroLegend,
  layout: SnapshotLayout,
): void {
  const pad = 8
  const titleH = 16
  const rowH = 15
  const { width: boxW, height: boxH } = measureLegendBox(legend)
  const panelW = layout.legendPanelW
  const x = layout.legendX + Math.max(0, (panelW - boxW) / 2)
  const y = layout.mapY + 2

  ctx.save()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(layout.legendX - LEGEND_GAP / 2, layout.mapY)
  ctx.lineTo(layout.legendX - LEGEND_GAP / 2, layout.mapY + layout.mapH)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.strokeStyle = '#94a3b8'
  ctx.fillRect(x, y, boxW, boxH)
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1)

  ctx.fillStyle = '#064e3b'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(legend.title, x + pad, y + 14)

  if (legend.kind === 'gradient') {
    const gx = x + pad
    const gy = y + titleH + 4
    const gw = boxW - pad * 2
    const gh = 12
    const stops = Math.max(legend.swatches.length, 2)
    for (let i = 0; i < stops; i += 1) {
      ctx.fillStyle = parseCssColor(legend.swatches[i]?.color ?? '#888')
      ctx.fillRect(gx + (gw * i) / stops, gy, gw / stops + 1, gh)
    }
    ctx.strokeStyle = '#cbd5e1'
    ctx.strokeRect(gx, gy, gw, gh)
    ctx.fillStyle = '#475569'
    ctx.font = '9px system-ui,sans-serif'
    if (legend.minLabel) ctx.fillText(legend.minLabel, gx, gy + gh + 12)
    if (legend.maxLabel) {
      ctx.textAlign = 'right'
      ctx.fillText(legend.maxLabel, gx + gw, gy + gh + 12)
    }
    if (legend.note) {
      ctx.textAlign = 'left'
      ctx.font = '8px system-ui,sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText(legend.note, gx, gy + gh + 22)
    }
  } else {
    const labeled = legend.swatches.filter(s => (s.label || '').trim())
    const rows = labeled.length ? labeled : legend.swatches
    let cy = y + titleH + pad
    for (const sw of rows.slice(0, 12)) {
      const swatchTop = cy + 1
      ctx.fillStyle = parseCssColor(sw.color)
      ctx.fillRect(x + pad, swatchTop, 12, 10)
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 0.75
      ctx.strokeRect(x + pad + 0.5, swatchTop + 0.5, 11, 9)
      ctx.fillStyle = '#334155'
      ctx.font = '10px system-ui,sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText((sw.label || '').trim() || 'Class', x + pad + 18, cy + 10)
      cy += rowH
    }
    if (legend.note) {
      ctx.fillStyle = '#64748b'
      ctx.font = '8px system-ui,sans-serif'
      ctx.fillText(legend.note, x + pad, cy + 2)
    }
  }
  ctx.restore()
}

function projectCoord(
  coord: [number, number],
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number] {
  return mapLngLatToMercatorBox(coord[0], coord[1], bbox, x, y, w, h)
}

function drawImageToProjectedQuad(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  corners: Array<[number, number]>,
  opacity: number,
): void {
  if (corners.length < 4) return
  const [tl, tr, br, bl] = corners as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ]
  const xs = corners.map(c => c[0])
  const ys = corners.map(c => c[1])
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const width = Math.max(right - left, 1)
  const height = Math.max(bottom - top, 1)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.beginPath()
  ctx.moveTo(tl[0], tl[1])
  ctx.lineTo(tr[0], tr[1])
  ctx.lineTo(br[0], br[1])
  ctx.lineTo(bl[0], bl[1])
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, left, top, width, height)
  ctx.restore()
}

function contourElevBounds(features: GeoJSON.Feature[]): { minElev: number; maxElev: number } {
  let minElev = Infinity
  let maxElev = -Infinity
  for (const f of features) {
    const elev = Number(f.properties?.elev)
    if (!Number.isFinite(elev)) continue
    minElev = Math.min(minElev, elev)
    maxElev = Math.max(maxElev, elev)
  }
  if (!Number.isFinite(minElev) || !Number.isFinite(maxElev)) {
    return { minElev: 0, maxElev: 0 }
  }
  return { minElev, maxElev }
}

function drawContourLayer(
  ctx: CanvasRenderingContext2D,
  result: HydroStepResult,
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const features = result.data.features ?? []
  const { minElev, maxElev } = contourElevBounds(features)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const coords = f.geometry.coordinates as [number, number][]
    const elev = Number(f.properties?.elev ?? 0)
    const isIndex = Number(f.properties?.index ?? 0) === 1
    const isHigh = elev >= maxElev
    const isLow = elev <= minElev
    let stroke = '#64748b'
    let lineWidth = 0.85
    if (isIndex) {
      stroke = '#0f172a'
      lineWidth = 2.2
    } else if (isHigh) {
      stroke = '#991b1b'
      lineWidth = 1.6
    } else if (isLow) {
      stroke = '#1d4ed8'
      lineWidth = 1.6
    }
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    const [sx, sy] = projectCoord(coords[0]!, bbox, x, y, w, h)
    ctx.moveTo(sx, sy)
    for (let i = 1; i < coords.length; i += 1) {
      const [px, py] = projectCoord(coords[i]!, bbox, x, y, w, h)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawStreamLayer(
  ctx: CanvasRenderingContext2D,
  result: HydroStepResult,
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const features = result.data.features ?? []
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const coords = f.geometry.coordinates as [number, number][]
    const order = Number(f.properties?.strahler ?? f.properties?.order ?? 1)
    const width = Math.min(4, 0.8 + order * 0.6)
    const alpha = 0.55 + Math.min(order, 6) * 0.07
    ctx.strokeStyle = `rgba(37, 99, 235, ${alpha})`
    ctx.lineWidth = width
    ctx.beginPath()
    const [sx, sy] = projectCoord(coords[0]!, bbox, x, y, w, h)
    ctx.moveTo(sx, sy)
    for (let i = 1; i < coords.length; i += 1) {
      const [px, py] = projectCoord(coords[i]!, bbox, x, y, w, h)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawVectorLayer(
  ctx: CanvasRenderingContext2D,
  result: HydroStepResult,
  bbox: LngLatBbox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (result.kind !== 'vector') return
  if (result.render === 'contours') {
    drawContourLayer(ctx, result, bbox, x, y, w, h)
    return
  }
  drawStreamLayer(ctx, result, bbox, x, y, w, h)
}

function drawCoordFooter(ctx: CanvasRenderingContext2D, bbox: LngLatBbox, width: number, height: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(15,23,42,0.75)'
  ctx.fillRect(0, height - 18, width, 18)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  const label = `W ${bbox.minLng.toFixed(5)}°  E ${bbox.maxLng.toFixed(5)}°  S ${bbox.minLat.toFixed(5)}°  N ${bbox.maxLat.toFixed(5)}°  ·  EPSG:4326`
  ctx.fillText(label, 8, height - 6)
  ctx.restore()
}

function drawGeoreferencedRaster(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  coords: HydroRasterCoordinates,
  extent: LngLatBbox,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  opacity = 0.82,
): void {
  const corners = coords.map(c => projectCoord(c, extent, mapX, mapY, mapW, mapH))
  drawImageToProjectedQuad(ctx, img, corners, opacity)
}

export async function fetchHydroBasemapForExtent(
  extent: LngLatBbox,
  signal?: AbortSignal,
): Promise<string | null> {
  return fetchEsriSatelliteBasemapForBbox(extent, BASE_MAP_W, MAP_H, signal)
}

export async function compositeHydroMapSnapshot(options: {
  geometry: GeoJSON.Geometry
  title: string
  subtitle?: string
  extent: LngLatBbox
  basemapDataUrl: string | null
  layerDataUrl?: string | null
  rasterCoordinates?: HydroRasterCoordinates | null
  vectorResult?: HydroStepResult | null
  legend?: HydroLegend
}): Promise<string | null> {
  const layout = resolveSnapshotLayout(options.legend)
  const { mapX, mapY, mapW, mapH } = layout

  const canvas = document.createElement('canvas')
  canvas.width = SNAPSHOT_WIDTH
  canvas.height = SNAPSHOT_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  drawTitleBar(ctx, options.title, options.subtitle, SNAPSHOT_WIDTH)

  ctx.save()
  ctx.beginPath()
  ctx.rect(mapX, mapY, mapW, mapH)
  ctx.clip()

  if (options.basemapDataUrl) {
    try {
      const basemap = await loadImage(options.basemapDataUrl)
      ctx.drawImage(basemap, mapX, mapY, mapW, mapH)
    } catch {
      ctx.fillStyle = '#94a3b8'
      ctx.fillRect(mapX, mapY, mapW, mapH)
    }
  } else {
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(mapX, mapY, mapW, mapH)
  }

  if (options.layerDataUrl) {
    try {
      const layer = await loadImage(options.layerDataUrl)
      if (options.rasterCoordinates) {
        drawGeoreferencedRaster(
          ctx,
          layer,
          options.rasterCoordinates,
          options.extent,
          mapX,
          mapY,
          mapW,
          mapH,
        )
      } else {
        ctx.save()
        ctx.globalAlpha = 0.82
        ctx.drawImage(layer, mapX, mapY, mapW, mapH)
        ctx.restore()
      }
    } catch {
      /* optional layer */
    }
  }

  if (options.vectorResult) {
    drawVectorLayer(ctx, options.vectorResult, options.extent, mapX, mapY, mapW, mapH)
  }

  drawAoiOutline(ctx, options.geometry, options.extent, mapX, mapY, mapW, mapH)
  ctx.restore()

  drawMapNeatline(ctx, mapX, mapY, mapW, mapH)
  drawNorthArrow(ctx, mapX + 22, mapY + 28)
  drawScaleBar(ctx, options.extent, mapX + 12, mapY + mapH - 12, mapW)
  if (options.legend) {
    drawLegendPanel(ctx, options.legend, layout)
  }
  drawCoordFooter(ctx, options.extent, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)

  return dataUrlToPngBase64(canvas.toDataURL('image/png'))
}
