import type { WellSitePoint, WellSiteResult } from '../hydroWatershed/hydroEngine'

export type BuildWellSiteReportInput = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  aoiName: string
  result: WellSiteResult
  projectName?: string
  generatedBy?: string
  onProgress?: (done: number, total: number, label: string) => void
}

export type WellSiteReportMapSnapshot = {
  title: string
  subtitle: string
  imageBase64: string | null
  note?: string
}

export type WellSiteReportRow = {
  rank: number
  name: string
  score: number
  lng: number
  lat: number
  elev_m: number
  slope_pc: number
  aq_type: string
  water_table_m: number
  yield_m3d: number
  soil_type: string
  confidence: string
  risk_lvl: string
  well_score: number
}

export type WellSiteReportPayload = {
  projectName: string
  generatedAt: string
  generatedBy: string
  aoiName: string
  areaHa: number
  centroidLabel: string
  siteCount: number
  bestScore: number
  meanScore: number
  meanSlope: string
  resolutionLabel: string
  stats: Array<{ label: string; value: string }>
  wells: WellSiteReportRow[]
  maps: WellSiteReportMapSnapshot[]
  executive: {
    overview: string
    suitability: string
    methodology: string
    conclusion: string
  }
  recommendations: string[]
  finalRecommendation: {
    interpretation: string
    preDrillingIntro: string
    preDrillingSteps: string[]
  }
  methodologyNotes: string[]
  dataQualityNotes: string[]
}

export function wellPointToReportRow(p: WellSitePoint): WellSiteReportRow {
  const a = p.attributes
  return {
    rank: p.rank,
    name: a.well_name || `Well site ${p.rank}`,
    score: p.score,
    lng: p.lng,
    lat: p.lat,
    elev_m: a.elev_m,
    slope_pc: a.slope_pc,
    aq_type: a.aq_type,
    water_table_m: a.water_table_m,
    yield_m3d: a.yield_m3d,
    soil_type: a.soil_type,
    confidence: a.confidence,
    risk_lvl: a.risk_lvl,
    well_score: a.well_score,
  }
}
