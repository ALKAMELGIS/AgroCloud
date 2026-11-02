/**
 * Deterministic offline stand-in for the Agro_Structures FeatureServer (`/query?f=geojson`).
 *
 * Tests that exercise `fetchAgroStructuresGeoJson` → AOI mask → Sentinel Hub WMS chunking used to hit
 * services1.arcgis.com directly, which fails without network (CI, sandboxes). This fixture serves a
 * synthetic layer with the same shape (Structure_Type subtypes, polygon geometry, paging flags), so
 * the real fetch / pagination / filter / chunking code still runs.
 *
 * Set `AGROCLOUD_LIVE_ARCGIS=1` to run those tests against the live service instead.
 */
import { vi } from 'vitest'

type Ring = [number, number][]

export const AGRO_STRUCTURES_SYNTHETIC_FARM_PLOTS = 300
export const AGRO_STRUCTURES_SYNTHETIC_PIVOTS = 180
export const AGRO_STRUCTURES_SYNTHETIC_GREENHOUSES = 120

export function agroStructuresLiveArcgisEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.AGROCLOUD_LIVE_ARCGIS === '1'
}

function rectRing(lng: number, lat: number, w: number, h: number): Ring {
  return [
    [lng, lat],
    [lng + w, lat],
    [lng + w, lat + h],
    [lng, lat + h],
    [lng, lat],
  ]
}

function circleRing(lng: number, lat: number, r: number, segments = 24): Ring {
  const ring: Ring = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    ring.push([+(lng + r * Math.cos(a)).toFixed(6), +(lat + r * Math.sin(a)).toFixed(6)])
  }
  ring.push(ring[0])
  return ring
}

function feature(objectId: number, structureType: number, ring: Ring, farmCode: string) {
  return {
    type: 'Feature',
    id: objectId,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { OBJECTID: objectId, Structure_Type: structureType, Farm_Code: farmCode },
  }
}

/** Farm Plots (1007) + PIVOT (1006) spread over a UAE-like extent, plus greenhouses (1000) not in the mask. */
export function buildAgroStructuresSyntheticFeatures(): unknown[] {
  const out: unknown[] = []
  let oid = 1
  // Farm plots: 20 × 15 grid of ~300 m rectangles across ~2° × 1.2°.
  for (let i = 0; i < AGRO_STRUCTURES_SYNTHETIC_FARM_PLOTS; i++) {
    const col = i % 20
    const row = Math.floor(i / 20)
    out.push(feature(oid++, 1007, rectRing(54 + col * 0.1, 24 + row * 0.08, 0.003, 0.0025), `FP-${i}`))
  }
  // Center-pivot circles: 18 × 10 grid offset from the plots.
  for (let i = 0; i < AGRO_STRUCTURES_SYNTHETIC_PIVOTS; i++) {
    const col = i % 18
    const row = Math.floor(i / 18)
    out.push(feature(oid++, 1006, circleRing(54.05 + col * 0.11, 24.04 + row * 0.12, 0.0035), `PV-${i}`))
  }
  // Greenhouses: excluded from the Sentinel dataMask (Farm Plots + PIVOT only).
  for (let i = 0; i < AGRO_STRUCTURES_SYNTHETIC_GREENHOUSES; i++) {
    const col = i % 12
    const row = Math.floor(i / 12)
    out.push(feature(oid++, 1000, rectRing(54.02 + col * 0.15, 24.02 + row * 0.1, 0.0006, 0.0004), `GH-${i}`))
  }
  return out
}

/**
 * Stub global `fetch` with a paginating Agro_Structures `/query` endpoint.
 * Honors `resultOffset` / `resultRecordCount` and sets `exceededTransferLimit` like ArcGIS.
 * Returns a restore function.
 */
export function stubAgroStructuresFeatureServerFetch(
  features: unknown[] = buildAgroStructuresSyntheticFeatures(),
): () => void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (!/\/Agro_Structures\/FeatureServer\/\d+\/query$/.test(url.pathname)) {
      return new Response(JSON.stringify({ error: { message: `Unexpected URL in test: ${url.href}` } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const offset = Number(url.searchParams.get('resultOffset') ?? 0)
    const count = Number(url.searchParams.get('resultRecordCount') ?? 2000)
    const page = features.slice(offset, offset + count)
    const exceeded = offset + count < features.length
    return new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        features: page,
        ...(exceeded ? { properties: { exceededTransferLimit: true } } : {}),
      }),
      { status: 200, headers: { 'Content-Type': 'application/geo+json' } },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return () => vi.unstubAllGlobals()
}
