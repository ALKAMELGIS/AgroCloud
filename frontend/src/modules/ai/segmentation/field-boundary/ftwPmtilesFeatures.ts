/**
 * Load FTW global field polygons from Source Cooperative PMTiles for an AOI bbox.
 */

import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import { PMTiles } from 'pmtiles'
import {
  type FtwGlobalYear,
  ftwThresholdToRaw,
  getFtwGlobalPmtilesUrl,
  getFtwGlobalSourceLayer,
} from './ftwGlobalConfig'

export type LngLatBbox = [number, number, number, number]

const MAX_TILES_AOI = 128
const MAX_FEATURES_AOI = 24_000

export function countTilesForBbox(bbox: LngLatBbox, z: number): number {
  const [west, south, east, north] = bbox
  const xMin = lonToTileX(west, z)
  const xMax = lonToTileX(east, z)
  const yMin = latToTileY(north, z)
  const yMax = latToTileY(south, z)
  return Math.max(0, xMax - xMin + 1) * Math.max(0, yMax - yMin + 1)
}

/** Pick highest zoom where the AOI fits within the tile budget (full coverage). */
export function pickFtwZoomForBbox(bbox: LngLatBbox, maxTiles = MAX_TILES_AOI): number {
  for (let z = 14; z >= 11; z--) {
    if (countTilesForBbox(bbox, z) <= maxTiles) return z
  }
  return 11
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

export function tileRangeForBbox(
  bbox: LngLatBbox,
  z: number,
  maxTiles = MAX_TILES_AOI,
): Array<{ z: number; x: number; y: number }> {
  const [west, south, east, north] = bbox
  const xMin = lonToTileX(west, z)
  const xMax = lonToTileX(east, z)
  const yMin = latToTileY(north, z)
  const yMax = latToTileY(south, z)
  const tiles: Array<{ z: number; x: number; y: number }> = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y })
      if (tiles.length >= maxTiles) return tiles
    }
  }
  return tiles
}

function parseTileFeatures(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  sourceLayer: string,
  thresholdRaw: number,
): GeoJSON.Feature[] {
  const tile = new VectorTile(new Protobuf(data))
  const layer = tile.layers[sourceLayer]
  if (!layer) return []
  const out: GeoJSON.Feature[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const geo = feature.toGeoJSON(x, y, z) as GeoJSON.Feature
    const props = (geo.properties ?? {}) as Record<string, unknown>
    const conf = Number(props.confidence_mean ?? props.confidence ?? 0)
    if (!Number.isFinite(conf) || conf < thresholdRaw) continue
    geo.properties = {
      ...props,
      confidence_mean: conf,
      confidence: conf,
      source: 'ftw-global',
    }
    out.push(geo)
  }
  return out
}

export type LoadFtwFeaturesOptions = {
  year: FtwGlobalYear
  thresholdPct: number
  bbox: LngLatBbox
  zoom?: number
  signal?: AbortSignal
}

/** Fetch all FTW vector tiles covering bbox (for AOI raster mosaic). */
export async function loadFtwFeaturesForBbox(
  options: LoadFtwFeaturesOptions,
): Promise<GeoJSON.Feature[]> {
  const { year, thresholdPct, bbox, signal } = options
  const [west, south, east, north] = bbox
  if (!(east > west) || !(north > south)) return []

  const z = pickFtwZoomForBbox(bbox, MAX_TILES_AOI)
  const pm = new PMTiles(getFtwGlobalPmtilesUrl(year))
  const sourceLayer = getFtwGlobalSourceLayer(year)
  const thresholdRaw = ftwThresholdToRaw(thresholdPct)
  const tiles = tileRangeForBbox(bbox, z)

  const batches = await Promise.all(
    tiles.map(async ({ z: tz, x, y }) => {
      if (signal?.aborted) return [] as GeoJSON.Feature[]
      try {
        const resp = await pm.getZxy(tz, x, y, signal)
        if (!resp?.data) return []
        return parseTileFeatures(resp.data, tz, x, y, sourceLayer, thresholdRaw)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err
        return []
      }
    }),
  )

  return batches.flat().slice(0, MAX_FEATURES_AOI)
}
