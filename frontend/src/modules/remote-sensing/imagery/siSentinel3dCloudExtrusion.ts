/**
 * 3D terrain: true-color Sentinel cloud pixels lifted to {@link SI_CLOUD_DECK_ASL_M} m ASL.
 * Index WMS uses transparent cloud pixels when {@link BuildSentinelHubWmsAoiClipOptions.terrain3dCloudExtrusion} is set.
 */

import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from './sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl } from './sentinelHubWmsInstance'
import { getDrawnGeometry, inferWmsEvalProfile } from './sentinelHubWmsAoiClip'
import { addDaysToIso } from './siSentinelImageryDate'
import {
  buildSentinelCloudRgbFallbackFunctions,
  SI_SENTINEL_WMS_MAXCC,
} from './sentinelSclCloudMask'
import { isSentinelIndexColorRampProfile } from '../indices/sentinelHubWmsIndexEvalscripts'
import { buildDemGrid, type DemGrid } from '@/modules/gis/spatial-analysis/hydro-watershed/terrainTiles'
import { lngLatToWorldPx, type LngLatBBox } from '@/modules/ai/detection/tree/webMercatorTiles'
import type { SiSentinel3dCloudDeckPayload } from './siSentinel3dCloudDeckCustomLayer'

export const SI_SENTINEL_3D_CLOUD_SOURCE_ID = 'si-sentinel-3d-cloud-extrusion'
export const SI_SENTINEL_3D_CLOUD_LAYER_ID = 'si-sentinel-3d-cloud-extrusion-layer'

const GRID_PX = 144
const GRID_STRIDE = 3
const MAX_CLOUD_CELLS = 2800
/** 3D cloud deck altitude (metres above sea level). */
export const SI_CLOUD_DECK_ASL_M = 6000
/** @deprecated Use {@link SI_CLOUD_DECK_ASL_M}. */
export const SI_CLOUD_DECK_ASL_MIN_M = SI_CLOUD_DECK_ASL_M
/** @deprecated Use {@link SI_CLOUD_DECK_ASL_M}. */
export const SI_CLOUD_DECK_ASL_MAX_M = SI_CLOUD_DECK_ASL_M
/** WMS raster size for 3D cloud lift (matches 2D mask footprint). */
const CLOUD_DECK_FETCH_PX = 512
/** Thin slab thickness so extrusion reads as floating cloud, not a column. */
const CLOUD_DECK_THICKNESS_M = 140

export type CloudDeckExtrusionM = { baseM: number; topM: number }

/** Mapbox fill-extrusion uses terrain-relative base/height; deck is a thin slab at {@link SI_CLOUD_DECK_ASL_M}. */
export function cloudDeckExtrusionRelativeToTerrain(
  terrainElevM: number,
  _deckPosition01 = 0.55,
): CloudDeckExtrusionM {
  const baseAsl = SI_CLOUD_DECK_ASL_M
  const topAsl = baseAsl + CLOUD_DECK_THICKNESS_M
  const baseM = baseAsl - terrainElevM
  const topM = topAsl - terrainElevM
  if (!Number.isFinite(baseM) || !Number.isFinite(topM) || topM <= baseM + 1) {
    return { baseM: Math.max(0, baseM), topM: Math.max(baseM + CLOUD_DECK_THICKNESS_M, topM) }
  }
  return { baseM, topM }
}

function bboxWgs84From3857(bbox3857: [number, number, number, number]): LngLatBBox {
  const [minX, minY, maxX, maxY] = bbox3857
  const [west, north] = webMercatorToLngLat(minX, maxY)
  const [east, south] = webMercatorToLngLat(maxX, minY)
  return { west, east, south, north }
}

function sampleDemElevationM(dem: DemGrid, lng: number, lat: number): number {
  const [wx, wy] = lngLatToWorldPx(lng, lat, dem.zoom)
  const cx = wx - dem.originWorldPxX
  const cy = wy - dem.originWorldPxY
  const x = Math.round(Math.max(0, Math.min(dem.width - 1, cx)))
  const y = Math.round(Math.max(0, Math.min(dem.height - 1, cy)))
  return dem.elev[y * dem.width + x]!
}

function cloudCellCenterLngLat(
  bbox3857: [number, number, number, number],
  col: number,
  row: number,
  width: number,
  height: number,
): [number, number] {
  const [minX, minY, maxX, maxY] = bbox3857
  const dx = (maxX - minX) / width
  const dy = (maxY - minY) / height
  const x = minX + (col + 0.5) * dx
  const y = maxY - (row + 0.5) * dy
  return webMercatorToLngLat(x, y)
}

const CLOUD_RGB_BANDS = ['B02', 'B03', 'B04', 'SCL', 'CLP', 'dataMask']

function evalscriptToBase64(script: string): string {
  const normalized = String(script || '').replace(/\r\n/g, '\n').trim()
  return btoa(unescape(encodeURIComponent(normalized)))
}

const SENTINEL_3D_CLOUD_RGB_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(CLOUD_RGB_BANDS)} }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
${buildSentinelCloudRgbFallbackFunctions()}
function evaluatePixel(samples) {
  if (!samples.dataMask) return [0, 0, 0, 0];
  if (!cloudMasked(samples)) return [0, 0, 0, 0];
  const c = trueColor(samples);
  return [
    Math.round(c[0] * 255),
    Math.round(c[1] * 255),
    Math.round(c[2] * 255),
    255
  ];
}`

const SENTINEL_3D_CLOUD_RGB_EVALSCRIPT_B64 = evalscriptToBase64(SENTINEL_3D_CLOUD_RGB_EVALSCRIPT)

function lngLatToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180)
  return [x, y]
}

function webMercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180
  const lat =
    (Math.atan(Math.exp((y / 20037508.34) * Math.PI)) * 360) / Math.PI - 90
  return [lng, lat]
}

function walkLngLat(coords: unknown, points: [number, number][]) {
  if (!coords) return
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0], coords[1]])
    return
  }
  if (Array.isArray(coords)) coords.forEach(c => walkLngLat(c, points))
}

function bbox3857FromGeometry(geometry: GeoJSON.Geometry): [number, number, number, number] | null {
  const points: [number, number][] = []
  if ('coordinates' in geometry) walkLngLat(geometry.coordinates, points)
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lng, lat] of points) {
    const [x, y] = lngLatToWebMercator(lng, lat)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  const padX = Math.max(8, (maxX - minX) * 0.02)
  const padY = Math.max(8, (maxY - minY) * 0.02)
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

function ringClosed(ring: number[][]): number[][] {
  if (ring.length < 2) return ring
  const a = ring[0]!
  const b = ring[ring.length - 1]!
  if (a[0] === b[0] && a[1] === b[1]) return ring
  return [...ring, a]
}

function decimateMax(ring: number[][], maxPts: number): number[][] {
  if (ring.length <= maxPts) return ring
  const step = Math.ceil(ring.length / maxPts)
  const out: number[][] = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!)
  const last = ring[ring.length - 1]!
  const prev = out[out.length - 1]!
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last)
  return out
}

function ringWgs84To3857CoordPairs(ring: number[][]): string {
  return ring
    .map(([lng, lat]) => {
      const [x, y] = lngLatToWebMercator(lng!, lat!)
      return `${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(', ')
}

function geometryToWmsClipWkt3857(geometry: GeoJSON.Geometry): string | null {
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0]
    if (!Array.isArray(ring) || !ring.length) return null
    const simplified = decimateMax(ringClosed(ring as number[][]), 36)
    return `POLYGON((${ringWgs84To3857CoordPairs(simplified)}))`
  }
  if (geometry.type === 'MultiPolygon') {
    const rings = (geometry.coordinates || [])
      .map(poly => {
        const ring = poly?.[0]
        if (!Array.isArray(ring) || !ring.length) return null
        return decimateMax(ringClosed(ring as number[][]), 28)
      })
      .filter((r): r is number[][] => Boolean(r))
    if (!rings.length) return null
    if (rings.length === 1) return `POLYGON((${ringWgs84To3857CoordPairs(rings[0]!)}))`
    const parts = rings.map(r => `((${ringWgs84To3857CoordPairs(r)}))`).join(', ')
    return `MULTIPOLYGON(${parts})`
  }
  return null
}

async function fetchCloudRgbRgba(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { headers: { Accept: 'image/png' }, signal })
  if (!res.ok) throw new Error(`WMS GetMap failed (${res.status})`)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close?.()
  }
}

function cloudCellPolygon(
  bbox3857: [number, number, number, number],
  col: number,
  row: number,
  width: number,
  height: number,
): GeoJSON.Polygon {
  const [minX, minY, maxX, maxY] = bbox3857
  const dx = (maxX - minX) / width
  const dy = (maxY - minY) / height
  const x0 = minX + col * dx
  const x1 = minX + (col + 1) * dx
  const yTop = maxY - row * dy
  const yBot = maxY - (row + 1) * dy
  const ring: [number, number][] = [
    webMercatorToLngLat(x0, yBot),
    webMercatorToLngLat(x1, yBot),
    webMercatorToLngLat(x1, yTop),
    webMercatorToLngLat(x0, yTop),
    webMercatorToLngLat(x0, yBot),
  ]
  return { type: 'Polygon', coordinates: [ring] }
}

export function buildSiSentinel3dCloudExtrusionGeoJson(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bbox3857: [number, number, number, number],
  dem?: DemGrid | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (let row = 0; row < height; row += GRID_STRIDE) {
    for (let col = 0; col < width; col += GRID_STRIDE) {
      const i = (row * width + col) * 4
      const r = rgba[i]!
      const g = rgba[i + 1]!
      const b = rgba[i + 2]!
      const a = rgba[i + 3]!
      if (a < 200 || r + g + b < 48) continue
      const [lng, lat] = cloudCellCenterLngLat(bbox3857, col, row, width, height)
      const terrainM = dem ? sampleDemElevationM(dem, lng, lat) : 0
      const lum01 = Math.max(0, Math.min(1, (r + g + b) / (3 * 255)))
      const { baseM, topM } = cloudDeckExtrusionRelativeToTerrain(terrainM, lum01)
      features.push({
        type: 'Feature',
        properties: {
          r,
          g,
          b,
          baseM,
          topM,
        },
        geometry: cloudCellPolygon(bbox3857, col, row, width, height),
      })
      if (features.length >= MAX_CLOUD_CELLS) break
    }
    if (features.length >= MAX_CLOUD_CELLS) break
  }
  return { type: 'FeatureCollection', features }
}

export function shouldFetchSiSentinel3dCloudExtrusion(activeWmsLayer: string | null | undefined): boolean {
  const layer = String(activeWmsLayer || '').trim()
  if (!layer) return false
  const profile = inferWmsEvalProfile(layer)
  if (profile === 'native') return false
  return isSentinelIndexColorRampProfile(profile)
}

function deckCoordinatesFromBbox3857(
  bbox3857: [number, number, number, number],
): SiSentinel3dCloudDeckPayload['coordinates'] {
  const [minX, minY, maxX, maxY] = bbox3857
  return [
    webMercatorToLngLat(minX, maxY),
    webMercatorToLngLat(maxX, maxY),
    webMercatorToLngLat(maxX, minY),
    webMercatorToLngLat(minX, minY),
  ]
}

async function cloudRgbaToObjectUrl(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  const imageData = new ImageData(rgba, width, height)
  ctx.putImageData(imageData, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
  return URL.createObjectURL(blob)
}

async function fetchSentinel3dCloudMaskRgba(
  clipSource: unknown,
  sceneDate: string,
  px: number,
  signal?: AbortSignal,
): Promise<{ rgba: Uint8ClampedArray; bbox3857: [number, number, number, number] } | null> {
  const geometry = getDrawnGeometry(clipSource as Parameters<typeof getDrawnGeometry>[0])
  if (!geometry) return null
  const bbox3857 = bbox3857FromGeometry(geometry)
  const geometryWkt3857 = geometryToWmsClipWkt3857(geometry)
  if (!bbox3857 || !geometryWkt3857) return null

  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const [minX, minY, maxX, maxY] = bbox3857
  const timeEnd = addDaysToIso(sceneDate, 1)
  let url =
    `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${px}&HEIGHT=${px}` +
    `&TIME=${sceneDate}/${timeEnd}` +
    `&MAXCC=${SI_SENTINEL_WMS_MAXCC}` +
    `&GEOMETRY=${encodeURIComponent(geometryWkt3857)}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(SENTINEL_3D_CLOUD_RGB_EVALSCRIPT_B64)}`
  url = appendSentinelHubWmsAccessToken(url)
  const rgba = await fetchCloudRgbRgba(url, px, px, signal)
  return { rgba, bbox3857 }
}

/** Pixel-accurate 3D cloud deck (same WMS mask as 2D), lifted into the 2–8 km band. */
export async function fetchSiSentinel3dCloudDeck(
  clipSource: unknown,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<SiSentinel3dCloudDeckPayload | null> {
  try {
    const fetched = await fetchSentinel3dCloudMaskRgba(
      clipSource,
      sceneDate,
      CLOUD_DECK_FETCH_PX,
      signal,
    )
    if (!fetched) return null
    const { rgba, bbox3857 } = fetched
    let hasCloudPixel = false
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i]! > 200) {
        hasCloudPixel = true
        break
      }
    }
    if (!hasCloudPixel) return null
    const imageUrl = await cloudRgbaToObjectUrl(rgba, CLOUD_DECK_FETCH_PX, CLOUD_DECK_FETCH_PX)
    return {
      imageUrl,
      deckAltitudeM: SI_CLOUD_DECK_ASL_M,
      deckVerticalSpreadM: 0,
      coordinates: deckCoordinatesFromBbox3857(bbox3857),
      pixelLift: true,
    }
  } catch {
    return null
  }
}

export {
  syncSiSentinel3dCloudDeckLayer,
  type SiSentinel3dCloudDeckPayload,
} from './siSentinel3dCloudDeckCustomLayer'

export async function fetchSiSentinel3dCloudExtrusionGeoJson(
  clipSource: unknown,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const fetched = await fetchSentinel3dCloudMaskRgba(clipSource, sceneDate, GRID_PX, signal)
    if (!fetched) return null
    const { rgba: data, bbox3857 } = fetched
    const dem = await buildDemGrid({
      bbox: bboxWgs84From3857(bbox3857),
      maxTiles: 12,
      signal,
    })
    const fc = buildSiSentinel3dCloudExtrusionGeoJson(data, GRID_PX, GRID_PX, bbox3857, dem)
    return fc.features.length ? fc : null
  } catch {
    return null
  }
}

export const siSentinel3dCloudExtrusionLayerPaint = {
  'fill-extrusion-color': ['rgb', ['get', 'r'], ['get', 'g'], ['get', 'b']] as unknown as string,
  'fill-extrusion-base': ['get', 'baseM'] as unknown as number,
  'fill-extrusion-height': ['get', 'topM'] as unknown as number,
  'fill-extrusion-opacity': 0.94,
  'fill-extrusion-vertical-gradient': true,
} as const
