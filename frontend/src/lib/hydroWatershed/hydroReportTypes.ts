import type { HydroLegend, HydroStepId, HydroStepResult } from './hydroEngine'
import type { FloodMonitoringResult } from '../floodMonitoringPipeline'

export type HydroReportSnapshot = {
  id: string
  title: string
  subtitle?: string
  imageBase64: string | null
  legendText: string
  stats: Array<{ label: string; value: string }>
  available: boolean
  note?: string
}

export type HydroReportTable = {
  title: string
  headers: string[]
  rows: string[][]
}

export type HydroReportExecutive = {
  projectOverview: string
  terrainSummary: string
  hydrologicalSummary: string
  floodRiskSummary: string
  wetlandSummary: string
  conclusion: string
  narrative: string
}

export type HydroReportPayload = {
  projectName: string
  generatedBy: string
  generatedAt: string
  aoiName: string
  areaHa: number
  crs: string
  demSource: string
  demResolution: string
  analysisDate: string
  centroidLabel: string
  executive: HydroReportExecutive
  snapshots: HydroReportSnapshot[]
  tables: HydroReportTable[]
  completedSteps: HydroStepId[]
  recommendations: string[]
  dataQualityNotes: string
}

export type BuildHydroReportInput = {
  geometry: GeoJSON.Geometry
  aoiName: string
  steps: Partial<Record<HydroStepId, { status: string; result: HydroStepResult | null }>>
  mapboxToken?: string
  projectName?: string
  generatedBy?: string
  floodResult?: FloodMonitoringResult | null
  onProgress?: (done: number, total: number, label: string) => void
}

export type HydroMapSnapshotSpec = {
  id: string
  title: string
  subtitle?: string
  stepId?: HydroStepId
  kind: 'aoi' | 'step' | 'derived'
  derived?: 'aspect' | 'flow-direction' | 'flood-risk' | 'wetland'
}

export const HYDRO_REPORT_MAP_SPECS: HydroMapSnapshotSpec[] = [
  { id: 'aoi-location', title: 'AOI Location Map', subtitle: 'Satellite overview with AOI boundary', kind: 'aoi' },
  { id: 'dem', title: 'DEM Elevation Map', stepId: 'dem', kind: 'step' },
  { id: 'hillshade', title: 'Hillshade Map', stepId: 'hillshade', kind: 'step' },
  { id: 'slope', title: 'Slope Analysis Map', stepId: 'slope', kind: 'step' },
  { id: 'aspect', title: 'Aspect Analysis Map', derived: 'aspect', kind: 'derived' },
  { id: 'flow-direction', title: 'Flow Direction Map', derived: 'flow-direction', kind: 'derived' },
  { id: 'flow-accum', title: 'Flow Accumulation Map', stepId: 'flow-accum', kind: 'step' },
  { id: 'streams', title: 'Stream Network Map', stepId: 'streams', kind: 'step' },
  { id: 'watershed', title: 'Watershed Delineation Map', stepId: 'watershed', kind: 'step' },
  { id: 'flood-risk', title: 'Flood Risk Assessment Map', derived: 'flood-risk', kind: 'derived' },
  { id: 'wetland', title: 'Wetland Analysis Map', derived: 'wetland', kind: 'derived' },
]

export function legendToText(legend?: HydroLegend): string {
  if (!legend) return ''
  if (legend.kind === 'gradient') {
    const range =
      legend.minLabel && legend.maxLabel ? `${legend.minLabel} → ${legend.maxLabel}` : ''
    const sw = legend.swatches
      .filter(s => s.label)
      .map(s => s.label)
      .join(' · ')
    return [legend.title, range, sw, legend.note].filter(Boolean).join(' — ')
  }
  return [legend.title, ...legend.swatches.map(s => s.label || s.color), legend.note].filter(Boolean).join(' · ')
}
