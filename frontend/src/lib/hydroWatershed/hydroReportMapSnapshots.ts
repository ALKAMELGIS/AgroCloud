import type { HydroLegend, HydroStepResult } from './hydroEngine'
import {
  bboxFromGeometry,
  dataUrlToPngBase64,
  fetchEsriSatelliteBasemapForBbox,
  fitLngLatBboxToMapAspect,
  mapLngLatToMercatorBox,
  type LngLatBbox,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesMapSnapshot'

/** Full-width report frame — map uses entire width; legend sits in a dedicated strip below. */
const SNAPSHOT_WIDTH = 820
const MAP_ELEMENTS_LEGEND: HydroLegend = {
  title: 'Map elements',
  kind: 'classes',
  swatches: [
    { color: '#fbbf24', label: 'AOI boundary' },
    { color: '#334155', label: 'Esri World Imagery (basemap)' },
    { color: '#0f172a', label: 'North arrow' },
    { color: '#ffffff', label: 'Scale bar' },
  ],
}

export type HydroSnapshotLayout = {
  canvasW: number
  canvasH: number
  mapX: number
  mapY: number
  mapW: number
  mapH: number
  legendX: number
  legendY: number
  legendW: number
  legendH: number
}

const DEFAULT_LAYOUT = resolveHydroSnapshotLayout({
  title: 'Elevation',
  kind: 'gradient',
  swatches: [{ color: '#1a9850', label: '' }, { color: '#d73027', label: '' }],
  minLabel: '0 m',
  maxLabel: '100 m',
})

/** Geographic extent aspect — shared across all hydro report maps. */
export const HYDRO_REPORT_MAP_W = DEFAULT_LAYOUT.mapW
export const HYDRO_REPORT_MAP_H = DEFAULT_LAYOUT.mapH

export type HydroRasterCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]

function parseCssColor(color: string): string {
  const c = color.trim()
  if (!c || c === 'transparent' || c.includes('rgba(0,0,0,0)')) return '#cbd5e1'
  return c
}

function legendSections(layerLegend?: HydroLegend): HydroLegend[] {
  const sections: HydroLegend[] = []
  if (layerLegend) sections.push(layerLegend)
  sections.push(MAP_ELEMENTS_LEGEND)
  return sections
}

function classRowCount(legend: HydroLegend): number {
  const labeled = legend.swatches.filter(s => (s.label || '').trim())
  return labeled.length || legend.swatches.length
}

function measureLegendSection(legend: HydroLegend, sectionW: number): { width: number; height: number } {
  const pad = 10
  const titleH = 18
  const rowH = 15
  const noteH = legend.note ? 14 : 0

  if (legend.kind === 'gradient') {
    const barH = 14
    const tickH = 14
    return {
      width: sectionW,
      height: titleH + pad + barH + tickH + noteH + pad,
    }
  }

  const rows = classRowCount(legend)
  const cols = rows > 6 ? 2 : 1
  const rowsPerCol = Math.ceil(rows / cols)
  const longest = legend.swatches.reduce((max, s) => Math.max(max, (s.label || '').length), 0)
  const colW = cols === 2 ? sectionW / 2 - 4 : sectionW
  const width = cols === 2 ? sectionW : Math.min(sectionW, Math.max(150, longest * 5.5 + 36))
  return {
    width,
    height: titleH + pad + rowsPerCol * rowH + noteH + pad,
  }
}

export function resolveHydroSnapshotLayout(layerLegend?: HydroLegend): HydroSnapshotLayout {
  const sections = legendSections(layerLegend)
  const gap = 8
  const sectionW = Math.floor((SNAPSHOT_WIDTH - gap * (sections.length - 1)) / sections.length)
  const sectionHeights = sections.map(s => measureLegendSection(s, sectionW).height)
  const legendH = Math.max(...sectionHeights, 72)
  const legendStripGap = 6
  const mapW = SNAPSHOT_WIDTH
  const mapH = Math.max(360, Math.round(SNAPSHOT_WIDTH * 0.62))
  const canvasH = mapH + legendStripGap + legendH

  return {
    canvasW: SNAPSHOT_WIDTH,
    canvasH,
    mapX: 0,
    mapY: 0,
    mapW,
    mapH,
    legendX: 0,
    legendY: mapH + legendStripGap,
    legendW: SNAPSHOT_WIDTH,
    legendH,
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

/**
 * North-up 2D Web Mercator extent shared by basemap, rasters, vectors, and AOI outline.
 * Aspect-matched to the report map frame so circle AOIs stay circular (not ellipses).
 */
export function resolveHydroSnapshotExtent(
  geometry: GeoJSON.Geometry,
  rasterCoordinates?: HydroRasterCoordinates | null,
): LngLatBbox | null {
  const geomBbox = bboxFromGeometry(geometry, 0.04)
  if (!geomBbox) return null
  const padded = rasterCoordinates
    ? padBbox(mergeBboxes(geomBbox, bboxFromCornerCoords(rasterCoordinates)), 0.06)
    : padBbox(geomBbox, 0.1)
  return fitLngLatBboxToMapAspect(padded, HYDRO_REPORT_MAP_W, HYDRO_REPORT_MAP_H)
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
  ctx.lineWidth = 2.5
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 2
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
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(x - 4, y - 4, 34, 38, 4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(x + 13, y + 4)
  ctx.lineTo(x + 5, y + 24)
  ctx.lineTo(x + 13, y + 20)
  ctx.lineTo(x + 21, y + 24)
  ctx.closePath()
  ctx.fill()
  ctx.font = 'bold 10px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('N', x + 13, y + 32)
  ctx.restore()
}

function formatScaleDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

function drawScaleBar(ctx: CanvasRenderingContext2D, bbox: LngLatBbox, mapX: number, mapY: number, mapW: number, mapH: number): void {
  const lat = (bbox.minLat + bbox.maxLat) / 2
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const spanM = Math.max((bbox.maxLng - bbox.minLng) * metersPerDegLng, 1)
  const candidates = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  const targetPx = mapW * 0.18
  let best = candidates[0]!
  for (const c of candidates) {
    const px = (c / spanM) * mapW
    if (px <= targetPx) best = c
    else break
  }
  const barPx = Math.max(48, (best / spanM) * mapW)
  const boxW = barPx + 20
  const boxH = 28
  const x = mapX + mapW - boxW - 10
  const y = mapY + mapH - boxH - 10
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, boxW, boxH, 4)
  ctx.fill()
  ctx.stroke()
  const barX = x + 10
  const barY = y + 16
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(barX, barY, barPx, 5)
  ctx.font = '10px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(formatScaleDistance(best), barX + barPx / 2, y + 12)
  ctx.restore()
}

function drawGradientLegendSection(
  ctx: CanvasRenderingContext2D,
  legend: HydroLegend,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pad = 10
  const titleH = 18
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(legend.title, x + pad, y + 14)

  const gx = x + pad
  const gy = y + titleH + 2
  const gw = w - pad * 2
  const gh = 14
  const stops = Math.max(legend.swatches.length, 2)
  for (let i = 0; i < stops; i += 1) {
    ctx.fillStyle = parseCssColor(legend.swatches[i]?.color ?? '#888')
    ctx.fillRect(gx + (gw * i) / stops, gy, gw / stops + 1, gh)
  }
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 0.75
  ctx.strokeRect(gx, gy, gw, gh)

  ctx.fillStyle = '#334155'
  ctx.font = '9px system-ui,sans-serif'
  if (legend.minLabel) ctx.fillText(legend.minLabel, gx, gy + gh + 12)
  if (legend.maxLabel) {
    ctx.textAlign = 'right'
    ctx.fillText(legend.maxLabel, gx + gw, gy + gh + 12)
  }

  if (stops >= 3) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#475569'
    ctx.font = '8px system-ui,sans-serif'
    const midIdx = Math.floor(stops / 2)
    ctx.fillText('Medium', gx + (gw * midIdx) / stops + gw / stops / 2, gy + gh + 12)
  }

  if (legend.note) {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#64748b'
    ctx.font = '8px system-ui,sans-serif'
    ctx.fillText(legend.note, gx, y + h - 6)
  }
  ctx.restore()
}

function drawClassLegendSection(
  ctx: CanvasRenderingContext2D,
  legend: HydroLegend,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pad = 10
  const titleH = 18
  const rowH = 15
  const labeled = legend.swatches.filter(s => (s.label || '').trim())
  const rows = labeled.length ? labeled : legend.swatches
  const cols = rows.length > 6 ? 2 : 1
  const rowsPerCol = Math.ceil(rows.length / cols)
  const colW = cols === 2 ? (w - pad * 2) / 2 : w - pad * 2

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 11px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(legend.title, x + pad, y + 14)

  rows.forEach((sw, idx) => {
    const col = cols === 2 ? idx % 2 : 0
    const row = cols === 2 ? Math.floor(idx / 2) : idx
    const cx = x + pad + col * (colW + 4)
    const cy = y + titleH + pad + row * rowH
    ctx.fillStyle = parseCssColor(sw.color)
    ctx.fillRect(cx, cy, 12, 10)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 0.75
    ctx.strokeRect(cx + 0.5, cy + 0.5, 11, 9)
    ctx.fillStyle = '#334155'
    ctx.font = '10px system-ui,sans-serif'
    ctx.fillText((sw.label || '').trim() || 'Class', cx + 16, cy + 9)
  })

  if (legend.note) {
    ctx.fillStyle = '#64748b'
    ctx.font = '8px system-ui,sans-serif'
    ctx.fillText(legend.note, x + pad, y + h - 6)
  }
  ctx.restore()
}

function drawLegendSection(
  ctx: CanvasRenderingContext2D,
  legend: HydroLegend,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (legend.kind === 'gradient') {
    drawGradientLegendSection(ctx, legend, x, y, w, h)
    return
  }
  drawClassLegendSection(ctx, legend, x, y, w, h)
}

/** Dedicated legend strip below the map — never overlaps map content. */
function drawLegendStrip(
  ctx: CanvasRenderingContext2D,
  layerLegend: HydroLegend | undefined,
  layout: HydroSnapshotLayout,
): void {
  const sections = legendSections(layerLegend)
  const gap = 8
  const sectionW = Math.floor((layout.legendW - gap * (sections.length - 1)) / sections.length)
  let x = layout.legendX
  sections.forEach(section => {
    drawLegendSection(ctx, section, x, layout.legendY, sectionW, layout.legendH)
    x += sectionW + gap
  })
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
  return fetchEsriSatelliteBasemapForBbox(extent, HYDRO_REPORT_MAP_W, HYDRO_REPORT_MAP_H, signal)
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
  const layout = resolveHydroSnapshotLayout(options.legend)
  const { mapX, mapY, mapW, mapH, canvasW, canvasH } = layout

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (options.basemapDataUrl) {
    try {
      const basemap = await loadImage(options.basemapDataUrl)
      ctx.drawImage(basemap, mapX, mapY, mapW, mapH)
    } catch {
      ctx.fillStyle = '#64748b'
      ctx.fillRect(mapX, mapY, mapW, mapH)
    }
  } else {
    ctx.fillStyle = '#64748b'
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
  drawNorthArrow(ctx, mapX + 12, mapY + 12)
  drawScaleBar(ctx, options.extent, mapX, mapY, mapW, mapH)
  drawLegendStrip(ctx, options.legend, layout)

  return dataUrlToPngBase64(canvas.toDataURL('image/png'))
}
