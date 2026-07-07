/**
 * Multi-Criteria Groundwater Potential Analysis (MCDA / weighted overlay).
 *
 * Combines terrain, hydrology, geology, land-surface, climate, and satellite-proxy
 * criteria into a 5-class groundwater potential heatmap and ranked well locations
 * with confidence scores and narrative recommendations.
 */

import type { DemGrid } from './terrainTiles'
import type { GeoBand } from './geoTiffExport'
import {
  computeStreams,
  getDemHydrologyModel,
  type HydroComputeContext,
  type HydroLegendSwatch,
  type HydroRasterResult,
  type HydroVectorResult,
} from './hydroEngine'

export type McdaCriterionWeights = {
  terrain: number
  hydrology: number
  geology: number
  landSurface: number
  climate: number
  satellite: number
}

export const DEFAULT_MCDA_WEIGHTS: McdaCriterionWeights = {
  terrain: 0.22,
  hydrology: 0.28,
  geology: 0.2,
  landSurface: 0.12,
  climate: 0.1,
  satellite: 0.08,
}

export type WellSuitabilityPhase =
  | 'terrain'
  | 'hydrology'
  | 'geology'
  | 'landSurface'
  | 'climate'
  | 'satellite'
  | 'mcda'
  | 'ranking'
  | 'vectors'
  | 'done'

export type WellPotentialClass = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High'

export type WellSuitabilitySite = {
  rank: number
  lng: number
  lat: number
  potentialScore: number
  confidencePct: number
  potentialClass: WellPotentialClass
  drillingDepthM: number
  staticWaterLevelM: number
  streamDistM: number
  rechargePotential: number
  slopeDeg: number
  geologicalSuitability: number
  aquiferType: string
  elevationM: number
  narrative: string
  attributes: Record<string, string | number>
}

export type WellSuitabilityResult = {
  raster: HydroRasterResult
  points: WellSuitabilitySite[]
  pointsGeoJson: GeoJSON.FeatureCollection
  streams?: HydroVectorResult
  stats: Array<{ label: string; value: string }>
  weightsUsed: McdaCriterionWeights
}

export type WellSuitabilityOptions = {
  topN?: number
  weights?: McdaCriterionWeights
  steepDeg?: number
  onProgress?: (phase: WellSuitabilityPhase, pct: number) => void
}

const CLASS_COLORS: Record<WellPotentialClass, [number, number, number]> = {
  'Very Low': [165, 0, 38],
  Low: [215, 48, 39],
  Moderate: [254, 224, 139],
  High: [166, 217, 106],
  'Very High': [26, 152, 80],
}

const CLASS_SWATCHES: HydroLegendSwatch[] = (
  ['Very Low', 'Low', 'Moderate', 'High', 'Very High'] as WellPotentialClass[]
).map(label => ({
  label,
  color: `rgb(${CLASS_COLORS[label].join(',')})`,
}))

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function round(v: number, d = 0): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

export function normalizeMcdaWeights(w: McdaCriterionWeights): McdaCriterionWeights {
  const sum =
    w.terrain + w.hydrology + w.geology + w.landSurface + w.climate + w.satellite || 1
  return {
    terrain: w.terrain / sum,
    hydrology: w.hydrology / sum,
    geology: w.geology / sum,
    landSurface: w.landSurface / sum,
    climate: w.climate / sum,
    satellite: w.satellite / sum,
  }
}

function minMaxFinite(arr: Float32Array, mask: Uint8Array | null): [number, number] {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < arr.length; i += 1) {
    if (mask && !mask[i]) continue
    const v = arr[i]!
    if (!Number.isFinite(v)) continue
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  if (!Number.isFinite(mn)) return [0, 1]
  return [mn, mx === mn ? mn + 1 : mx]
}

function classFromScore(s: number): WellPotentialClass {
  if (s >= 0.8) return 'Very High'
  if (s >= 0.6) return 'High'
  if (s >= 0.4) return 'Moderate'
  if (s >= 0.2) return 'Low'
  return 'Very Low'
}

function bandOf(dem: DemGrid, values: Float32Array, name: string): GeoBand {
  return {
    values,
    width: dem.width,
    height: dem.height,
    zoom: dem.zoom,
    originWorldPxX: dem.originWorldPxX,
    originWorldPxY: dem.originWorldPxY,
    nodata: NaN,
    name,
  }
}

function rasterToDataUrl(
  dem: DemGrid,
  aoiMask: Uint8Array | null,
  colorAt: (i: number) => [number, number, number, number],
): string {
  const { width: w, height: h } = dem
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const data = img.data
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    if (aoiMask && !aoiMask[i]) {
      data[p + 3] = 0
      continue
    }
    const [r, g, b, a] = colorAt(i)
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
    data[p + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function criterionStdDev(scores: number[]): number {
  if (!scores.length) return 0
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
  return Math.sqrt(variance)
}

function buildNarrative(
  rank: number,
  potentialClass: WellPotentialClass,
  rechargePotential: number,
  streamDistM: number,
  geologicalSuitability: number,
  slopeDeg: number,
  aquiferType: string,
  confidencePct: number,
): string {
  const rechargeDesc =
    rechargePotential >= 75 ? 'high' : rechargePotential >= 50 ? 'moderate' : 'limited'
  const drainageDesc =
    streamDistM < 200
      ? 'near a major drainage convergence'
      : streamDistM < 600
        ? 'within a secondary drainage corridor'
        : 'on elevated terrain away from channel heads'
  const geoDesc =
    geologicalSuitability >= 70
      ? `permeable ${aquiferType.toLowerCase()} geology`
      : geologicalSuitability >= 45
        ? `${aquiferType.toLowerCase()} formations with moderate permeability`
        : 'consolidated geology with localized fracturing'
  const slopeDesc =
    slopeDeg < 5 ? 'gentle slope' : slopeDeg < 12 ? 'moderate slope' : 'steep terrain'
  const potentialDesc = potentialClass.toLowerCase()
  return (
    `Site #${rank} is recommended because it lies within a ${rechargeDesc} recharge zone, ` +
    `${drainageDesc}, on ${geoDesc} with ${slopeDesc} and ${potentialDesc} groundwater potential. ` +
    `Estimated drilling success: ${confidencePct}%.`
  )
}

const tick = () => new Promise<void>(r => window.setTimeout(r, 0))

export async function computeWellSuitabilityMcda(
  ctx: HydroComputeContext,
  options: WellSuitabilityOptions = {},
): Promise<WellSuitabilityResult> {
  const topN = Math.max(5, Math.min(20, Math.round(options.topN ?? 10)))
  const steepDeg = options.steepDeg ?? 22
  const weights = normalizeMcdaWeights(options.weights ?? DEFAULT_MCDA_WEIGHTS)
  const report = options.onProgress

  const { dem, aoiMask } = ctx
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const n = w * h
  const { accum } = getDemHydrologyModel(dem)

  report?.('terrain', 0.05)
  await tick()

  const [eMin, eMax] = minMaxFinite(elev, aoiMask)
  const eSpan = eMax - eMin || 1

  let aMax = 1
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const a = accum[i]!
    if (Number.isFinite(a) && a > aMax) aMax = a
  }
  const logAMax = Math.log(aMax + 1) || 1
  const cellArea = cs * cs

  const terrainScore = new Float32Array(n).fill(NaN)
  const hydroScore = new Float32Array(n).fill(NaN)
  const geoScore = new Float32Array(n).fill(NaN)
  const landScore = new Float32Array(n).fill(NaN)
  const climateScore = new Float32Array(n).fill(NaN)
  const satScore = new Float32Array(n).fill(NaN)
  const composite = new Float32Array(n).fill(NaN)
  const slopeArr = new Float32Array(n).fill(NaN)
  const twiArr = new Float32Array(n).fill(NaN)
  const streamDistArr = new Float32Array(n).fill(NaN)

  const z = (xx: number, yy: number): number => elev[yy * w + xx]!
  const normSlope = (slopeDeg: number, steep: number): number => Math.min(1, slopeDeg / steep)

  report?.('terrain', 0.2)
  await tick()

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      if (aoiMask && !aoiMask[i]) continue

      const xm = x > 0 ? x - 1 : x
      const xp = x < w - 1 ? x + 1 : x
      const ym = y > 0 ? y - 1 : y
      const yp = y < h - 1 ? y + 1 : y
      const dzdx =
        (z(xp, ym) + 2 * z(xp, y) + z(xp, yp) - (z(xm, ym) + 2 * z(xm, y) + z(xm, yp))) / (8 * cs)
      const dzdy =
        (z(xm, yp) + 2 * z(x, yp) + z(xp, yp) - (z(xm, ym) + 2 * z(x, ym) + z(xp, ym))) / (8 * cs)
      const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      slopeArr[i] = slopeDeg

      const lap =
        (z(xm, y) + z(xp, y) + z(x, ym) + z(x, yp) - 4 * z(x, y)) / (cs * cs)
      const curvature = Math.abs(lap)
      const normElev = clamp01((elev[i]! - eMin) / eSpan)
      const relElev = 1 - Math.abs(normElev - 0.35) * 1.4
      const sSlope = 1 - Math.min(1, slopeDeg / steepDeg)
      const acc = Number.isFinite(accum[i]!) ? accum[i]! : 1
      const tanS = Math.max(Math.tan((slopeDeg * Math.PI) / 180), 0.001)
      const twi = Math.log((acc * cellArea) / tanS)
      twiArr[i] = twi
      const twiNorm = clamp01((twi + 2) / 14)
      const mrvbf = clamp01(sSlope * (1 - Math.min(1, curvature * 80)))
      terrainScore[i] = clamp01(0.3 * relElev + 0.35 * sSlope + 0.2 * twiNorm + 0.15 * mrvbf)

      const sFlow = Math.log(acc + 1) / logAMax
      const streamDistM = Math.max(20, Math.min(3000, 900 * (1 - sFlow) + slopeDeg * 8))
      streamDistArr[i] = streamDistM
      const drainageDensity = clamp01(sFlow * 0.7 + (1 - Math.min(1, streamDistM / 2000)) * 0.3)
      hydroScore[i] = clamp01(0.45 * sFlow + 0.35 * drainageDensity + 0.2 * twiNorm)

      const fractureProxy = clamp01(1 - Math.min(1, curvature * 120) * 0.4 + sSlope * 0.25)
      const lineamentProxy = clamp01(Math.min(1, Math.hypot(dzdx, dzdy) * 0.15))
      const faultDistProxy = clamp01(1 - lineamentProxy * 0.35)
      let aqType: string
      if (slopeDeg < 3 && sFlow > 0.45) aqType = 'Alluvial'
      else if (slopeDeg < 8) aqType = 'Sedimentary'
      else if (slopeDeg < 15) aqType = 'Fractured'
      else aqType = 'Hard rock'
      const lithology =
        aqType === 'Alluvial' ? 0.9 : aqType === 'Sedimentary' ? 0.72 : aqType === 'Fractured' ? 0.55 : 0.35
      geoScore[i] = clamp01(
        0.35 * lithology + 0.25 * fractureProxy + 0.2 * mrvbf + 0.2 * faultDistProxy,
      )

      const ndwiProxy = clamp01(twiNorm * 0.55 + sFlow * 0.45)
      const ndmiProxy = clamp01((1 - normElev) * 0.4 + twiNorm * 0.35 + sSlope * 0.25)
      const vegDensity = clamp01(ndmiProxy * 0.6 + (1 - normElev) * 0.4)
      const impervious = clamp01(normSlope(slopeDeg, steepDeg) * 0.6 + (1 - sSlope) * 0.1)
      landScore[i] = clamp01(0.3 * ndwiProxy + 0.3 * ndmiProxy + 0.25 * vegDensity + 0.15 * (1 - impervious))

      const annualRain = clamp01(0.55 + (1 - normElev) * 0.25 + sFlow * 0.2)
      const etProxy = clamp01(0.35 + normElev * 0.35 + (1 - ndmiProxy) * 0.3)
      const recharge = clamp01(annualRain * 0.5 + sFlow * 0.35 + sSlope * 0.15 - etProxy * 0.15)
      climateScore[i] = recharge

      const sarProxy = clamp01(sFlow * 0.4 + twiNorm * 0.35 + ndwiProxy * 0.25)
      const s2Proxy = clamp01(ndmiProxy * 0.5 + vegDensity * 0.5)
      satScore[i] = clamp01(0.4 * sarProxy + 0.35 * s2Proxy + 0.25 * ndwiProxy)
    }
  }

  report?.('hydrology', 0.45)
  await tick()
  report?.('geology', 0.55)
  await tick()
  report?.('landSurface', 0.65)
  await tick()
  report?.('climate', 0.72)
  await tick()
  report?.('satellite', 0.78)
  await tick()

  report?.('mcda', 0.82)
  for (let i = 0; i < n; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    if (!Number.isFinite(terrainScore[i]!)) continue
    let score =
      weights.terrain * terrainScore[i]! +
      weights.hydrology * hydroScore[i]! +
      weights.geology * geoScore[i]! +
      weights.landSurface * landScore[i]! +
      weights.climate * climateScore[i]! +
      weights.satellite * satScore[i]!
    if (slopeArr[i]! > steepDeg) score *= 0.35
    composite[i] = clamp01(score)
  }

  const dataUrl = rasterToDataUrl(dem, aoiMask, i => {
    const v = composite[i]!
    if (!Number.isFinite(v)) return [0, 0, 0, 0]
    const cls = classFromScore(v)
    const [r, g, b] = CLASS_COLORS[cls]
    return [r, g, b, 210]
  })

  report?.('ranking', 0.9)
  await tick()

  const order: number[] = []
  for (let i = 0; i < n; i += 1) if (Number.isFinite(composite[i]!)) order.push(i)
  order.sort((a, b) => composite[b]! - composite[a]!)
  const minSepPx = Math.max(5, Math.round(Math.min(w, h) / 10))
  const picked: number[] = []
  for (const i of order) {
    if (picked.length >= topN) break
    const x = i % w
    const y = (i / w) | 0
    let ok = true
    for (const p of picked) {
      const px = p % w
      const py = (p / w) | 0
      if (Math.hypot(px - x, py - y) < minSepPx) {
        ok = false
        break
      }
    }
    if (ok) picked.push(i)
  }

  const points: WellSuitabilitySite[] = picked.map((i, idx) => {
    const [lng, lat] = dem.pxToLngLat((i % w) + 0.5, ((i / w) | 0) + 0.5)
    const criteria = [
      terrainScore[i]!,
      hydroScore[i]!,
      geoScore[i]!,
      landScore[i]!,
      climateScore[i]!,
      satScore[i]!,
    ]
    const agreement = 1 - Math.min(1, criterionStdDev(criteria) * 2.2)
    const potentialScore = Math.round(composite[i]! * 100)
    const confidencePct = Math.round(potentialScore * 0.55 + agreement * 100 * 0.45)
    const potentialClass = classFromScore(composite[i]!)
    const slopeDeg = slopeArr[i]!
    const sFlow = Math.log((accum[i] ?? 1) + 1) / logAMax
    const normElev = clamp01((elev[i]! - eMin) / eSpan)
    const geologicalSuitability = Math.round(geoScore[i]! * 100)
    const rechargePotential = Math.round(climateScore[i]! * 100)
    const streamDistM = Math.round(streamDistArr[i]!)
    let aqType: string
    if (slopeDeg < 3 && sFlow > 0.45) aqType = 'Alluvial'
    else if (slopeDeg < 8) aqType = 'Sedimentary'
    else if (slopeDeg < 15) aqType = 'Fractured'
    else aqType = 'Hard rock'
    const staticWaterLevelM = round(
      Math.max(1, Math.min(80, 4 + normElev * 45 + slopeDeg * 0.4 - geoScore[i]! * 12 - sFlow * 8)),
      1,
    )
    const drillingDepthM = round(
      Math.max(8, Math.min(150, 20 + normElev * 70 + slopeDeg * 1.2 - geoScore[i]! * 18)),
    )
    const narrative = buildNarrative(
      idx + 1,
      potentialClass,
      rechargePotential,
      streamDistM,
      geologicalSuitability,
      slopeDeg,
      aqType,
      confidencePct,
    )
    const attributes: Record<string, string | number> = {
      rank: idx + 1,
      longitude: round(lng, 6),
      latitude: round(lat, 6),
      potential_score: potentialScore,
      confidence_pct: confidencePct,
      potential_class: potentialClass,
      drilling_depth_m: drillingDepthM,
      static_wl_m: staticWaterLevelM,
      stream_dist_m: streamDistM,
      recharge_pct: rechargePotential,
      slope_deg: round(slopeDeg, 1),
      geo_suit_pct: geologicalSuitability,
      aquifer_type: aqType,
      elev_m: round(elev[i]!),
      twi: round(twiArr[i]!, 2),
      terrain_w: round(weights.terrain, 2),
      hydro_w: round(weights.hydrology, 2),
      geology_w: round(weights.geology, 2),
      narrative,
    }
    return {
      rank: idx + 1,
      lng,
      lat,
      potentialScore,
      confidencePct,
      potentialClass,
      drillingDepthM,
      staticWaterLevelM,
      streamDistM,
      rechargePotential,
      slopeDeg: round(slopeDeg, 1),
      geologicalSuitability,
      aquiferType: aqType,
      elevationM: round(elev[i]!),
      narrative,
      attributes,
    }
  })

  const pointsGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ...p.attributes },
    })),
  }

  report?.('vectors', 0.95)
  await tick()
  const streamsStep = computeStreams(ctx)
  const streams = streamsStep.kind === 'vector' ? streamsStep : undefined
  report?.('done', 1)

  return {
    raster: {
      kind: 'raster',
      dataUrl,
      coordinates: dem.cornerCoords,
      opacity: 0.78,
      band: bandOf(dem, composite, 'Groundwater potential (0..1)'),
      legend: {
        title: 'Groundwater potential (MCDA)',
        kind: 'classes',
        swatches: CLASS_SWATCHES,
        note: 'Weighted overlay: terrain · hydrology · geology · land · climate · satellite',
      },
    },
    points,
    pointsGeoJson,
    streams,
    stats: [
      { label: 'Ranked sites', value: String(points.length) },
      { label: 'Best potential', value: points.length ? `${points[0]!.potentialScore}%` : '—' },
      { label: 'Top confidence', value: points.length ? `${points[0]!.confidencePct}%` : '—' },
      { label: 'Resolution', value: `${dem.metersPerPixel.toFixed(0)} m/px` },
    ],
    weightsUsed: weights,
  }
}
