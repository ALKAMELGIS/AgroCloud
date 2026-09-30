import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'

export type CutFillCellType = 'CUT' | 'FILL' | 'NO_CHANGE'

export type CutFillClassificationCode = 0 | 1 | 2

export type CutFillExistingSourceKind = 'terrarium' | 'geotiff' | 'constant'
export type CutFillDesignSourceKind = 'constant' | 'geotiff' | 'xyz' | 'tin'

export type CutFillWizardStep = 'surfaces' | 'parameters' | 'analysis' | 'results' | 'export'

export type CutFillParameters = {
  verticalToleranceM: number
  contourIntervalM: number
  crsLabel: string
  verticalDatumLabel: string
}

export type CutFillSummary = {
  cutVolumeM3: number
  fillVolumeM3: number
  netVolumeM3: number
  cutAreaM2: number
  fillAreaM2: number
  noChangeAreaM2: number
  maxCutM: number
  maxFillM: number
  avgAbsDiffM: number
  cellAreaM2: number
  activeCellCount: number
}

export type CutFillTableRow = {
  id: number
  lng: number
  lat: number
  existingZ: number
  designZ: number
  difference: number
  type: CutFillCellType
  areaM2: number
  volumeM3: number
}

export type CutFillRasterLayer = {
  dataUrl: string
  coordinates: DemGrid['cornerCoords']
  opacity: number
}

export type CutFillAnalysisResult = {
  dem: DemGrid
  existingElev: Float32Array
  designElev: Float32Array
  difference: Float32Array
  classification: Uint8Array
  summary: CutFillSummary
  rows: CutFillTableRow[]
  parameters: CutFillParameters
  diffLayer: CutFillRasterLayer
  classLayer: CutFillRasterLayer
  existingPreview?: CutFillRasterLayer
  designPreview?: CutFillRasterLayer
  existingContours?: GeoJSON.FeatureCollection
  designContours?: GeoJSON.FeatureCollection
}

export type CutFillProgress = {
  phase: 'idle' | 'dem' | 'design' | 'compute' | 'layers' | 'done' | 'error'
  message: string
  rowsDone: number
  rowsTotal: number
  percent: number
}
