import type { Feature, FeatureCollection } from 'geojson'
import { worldPxToLngLat } from '@/modules/ai/detection/tree/webMercatorTiles'
import { downloadVectorShapefile } from '@/modules/data-management/export/vectorLayerExport'
import type { GeoBand } from './geoTiffExport'
import { hydroBasinRgb, type HydroRasterResult } from './hydroEngine'

type VKey = string

function vertexKey(x: number, y: number): VKey {
  return `${x},${y}`
}

function parseKey(k: VKey): [number, number] {
  const [xs, ys] = k.split(',')
  return [Number(xs), Number(ys)]
}

function link(adj: Map<VKey, VKey[]>, a: VKey, b: VKey): void {
  if (a === b) return
  let la = adj.get(a)
  if (!la) {
    la = []
    adj.set(a, la)
  }
  la.push(b)
  let lb = adj.get(b)
  if (!lb) {
    lb = []
    adj.set(b, lb)
  }
  lb.push(a)
}

function basinIdAt(
  values: Float32Array,
  aoiMask: Uint8Array | null,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0
  const i = y * w + x
  if (aoiMask && !aoiMask[i]) return 0
  const v = values[i]!
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v)
}

function normEdge(a: VKey, b: VKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function traceRings(adj: Map<VKey, VKey[]>): number[][][] {
  const rings: number[][][] = []
  const used = new Set<string>()

  for (const [start, neighbors] of adj) {
    for (const n0 of neighbors) {
      const ek = normEdge(start, n0)
      if (used.has(ek)) continue
      const ringKeys: VKey[] = [start]
      let prev: VKey = start
      let cur: VKey = n0
      used.add(ek)
      for (let guard = 0; guard < 500_000; guard += 1) {
        ringKeys.push(cur)
        const opts = (adj.get(cur) ?? []).filter(n => n !== prev)
        if (!opts.length) break
        let next = opts[0]!
        for (const candidate of opts) {
          if (!used.has(normEdge(cur, candidate))) {
            next = candidate
            break
          }
        }
        const e2 = normEdge(cur, next)
        if (used.has(e2) && next !== start) break
        used.add(e2)
        if (next === start && ringKeys.length >= 2) break
        prev = cur
        cur = next
      }
      if (ringKeys.length >= 3 && ringKeys[0] === ringKeys[ringKeys.length - 1]) {
        ringKeys.pop()
      }
      if (ringKeys.length < 3) continue
      rings.push(ringKeys.map(k => parseKey(k)))
    }
  }
  return rings
}

function gridRingToLngLat(ring: number[][], band: GeoBand): number[][] {
  return ring.map(([vx, vy]) => {
    const [lng, lat] = worldPxToLngLat(band.originWorldPxX + vx, band.originWorldPxY + vy, band.zoom)
    return [lng, lat]
  })
}

function estimateCellAreaKm2(band: GeoBand, coords: HydroRasterResult['coordinates']): number {
  const [[lng0, lat0], [lng1], , [lng3, lat3]] = coords
  const latMid = (lat0 + lat3) / 2
  const mPerDegLat = 111_320
  const mPerDegLng = mPerDegLat * Math.cos((latMid * Math.PI) / 180)
  const widthM = Math.abs(lng1 - lng0) * mPerDegLng
  const heightM = Math.abs(lat3 - lat0) * mPerDegLat
  const cellM2 = (widthM / band.width) * (heightM / band.height)
  return cellM2 / 1e6
}

export function buildBasinPolygonFeatureCollection(
  band: GeoBand,
  aoiMask: Uint8Array | null,
  coords: HydroRasterResult['coordinates'],
  labelPrefix: string,
): FeatureCollection {
  const { width: w, height: h, values } = band
  const graphs = new Map<number, Map<VKey, VKey[]>>()

  const graphFor = (id: number): Map<VKey, VKey[]> => {
    let g = graphs.get(id)
    if (!g) {
      g = new Map()
      graphs.set(id, g)
    }
    return g
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const id = basinIdAt(values, aoiMask, w, h, x, y)
      if (id <= 0) continue
      const adj = graphFor(id)
      if (x === 0 || basinIdAt(values, aoiMask, w, h, x - 1, y) !== id) {
        link(adj, vertexKey(x, y), vertexKey(x, y + 1))
      }
      if (y === 0 || basinIdAt(values, aoiMask, w, h, x, y - 1) !== id) {
        link(adj, vertexKey(x, y), vertexKey(x + 1, y))
      }
      if (x === w - 1 || basinIdAt(values, aoiMask, w, h, x + 1, y) !== id) {
        link(adj, vertexKey(x + 1, y), vertexKey(x + 1, y + 1))
      }
      if (y === h - 1 || basinIdAt(values, aoiMask, w, h, x, y + 1) !== id) {
        link(adj, vertexKey(x, y + 1), vertexKey(x + 1, y + 1))
      }
    }
  }

  const cellKm2 = estimateCellAreaKm2(band, coords)
  const cellCounts = new Map<number, number>()
  for (let i = 0; i < w * h; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const id = basinIdAt(values, aoiMask, w, h, i % w, (i / w) | 0)
    if (id > 0) cellCounts.set(id, (cellCounts.get(id) ?? 0) + 1)
  }

  const features: Feature[] = []
  for (const [basinId, adj] of graphs) {
    const rings = traceRings(adj)
    const polys: number[][][] = []
    for (const ring of rings) {
      const coordsRing = gridRingToLngLat(ring, band)
      if (coordsRing.length < 3) continue
      const first = coordsRing[0]!
      polys.push([...coordsRing, first])
    }
    if (!polys.length) continue
    const [r, g, b] = hydroBasinRgb(basinId)
    const cells = cellCounts.get(basinId) ?? 0
    const areaKm2 = cells * cellKm2
    const hex = `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
    features.push({
      type: 'Feature',
      properties: {
        basin_id: basinId,
        name: `${labelPrefix} ${basinId}`,
        area_km2: Number(areaKm2.toFixed(3)),
        color_r: r,
        color_g: g,
        color_b: b,
        stroke: hex,
        fill: hex,
      },
      geometry:
        polys.length === 1
          ? { type: 'Polygon', coordinates: polys[0]! }
          : { type: 'MultiPolygon', coordinates: polys.map(p => [p]) },
    })
  }

  features.sort((a, b) => Number(b.properties?.area_km2 ?? 0) - Number(a.properties?.area_km2 ?? 0))
  return { type: 'FeatureCollection', features }
}

export async function downloadBasinBasinsShapefile(
  result: HydroRasterResult,
  aoiMask: Uint8Array | null,
  baseName: string,
  labelPrefix: string,
): Promise<void> {
  if (!result.band) throw new Error('No basin grid to vectorize.')
  const fc = buildBasinPolygonFeatureCollection(result.band, aoiMask, result.coordinates, labelPrefix)
  if (!fc.features.length) throw new Error('No basin polygons to export — re-run analysis.')
  await downloadVectorShapefile(fc, baseName)
}
