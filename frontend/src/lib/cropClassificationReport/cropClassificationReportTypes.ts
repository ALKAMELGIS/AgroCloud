import type { CropClassificationResult } from '../siPrithviCropPipeline'

export type BuildCropClassificationReportInput = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  aoiName: string
  season: { start: string; end: string }
  result: CropClassificationResult
  projectName?: string
  generatedBy?: string
  onProgress?: (done: number, total: number, label: string) => void
}

export type CropReportClassRow = {
  id: string
  name: string
  color: string
  pct: number
  areaHa: number | null
}

export type CropReportMapSnapshot = {
  title: string
  subtitle: string
  imageBase64: string | null
  note?: string
}

export type CropClassificationReportPayload = {
  projectName: string
  generatedAt: string
  generatedBy: string
  aoiName: string
  areaHa: number
  centroidLabel: string
  seasonStart: string
  seasonEnd: string
  engine: string
  countryLabel: string
  resolutionLabel: string
  cloudLabel: string
  datesLabel: string
  classes: CropReportClassRow[]
  maps: CropReportMapSnapshot[]
  executive: {
    overview: string
    composition: string
    methodology: string
    conclusion: string
    narrative: string
  }
  recommendations: string[]
  methodologyNotes: string[]
  dataQualityNotes: string[]
}
