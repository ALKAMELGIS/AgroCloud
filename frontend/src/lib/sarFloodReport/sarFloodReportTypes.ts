import type { HydroLegend } from '../hydroWatershed/hydroEngine'
import type { FloodMonitoringResult } from '../floodMonitoringPipeline'
import type { GeoBand } from '../hydroWatershed/geoTiffExport'

export type SarFloodReportSnapshot = {
  id: string
  title: string
  subtitle?: string
  imageBase64: string | null
  legendText: string
  stats: Array<{ label: string; value: string }>
  available: boolean
  note?: string
}

export type SarFloodReportTable = {
  title: string
  headers: string[]
  rows: string[][]
}

export type SarFloodReportExecutive = {
  projectOverview: string
  detectionSummary: string
  inundationSummary: string
  depthRiskSummary: string
  conclusion: string
  narrative: string
}

export type SarFloodReportPayload = {
  projectName: string
  generatedBy: string
  generatedAt: string
  aoiName: string
  areaHa: number
  crs: string
  centroidLabel: string
  analysisDate: string
  sensorLabel: string
  modality: string
  preDate: string
  postDate: string
  thresholdDb: number
  mode: string
  resolution: string
  executive: SarFloodReportExecutive
  snapshots: SarFloodReportSnapshot[]
  tables: SarFloodReportTable[]
  recommendations: string[]
  dataQualityNotes: string
  methodologyNotes: string
}

export type BuildSarFloodReportInput = {
  geometry: GeoJSON.Geometry
  aoiName: string
  result: FloodMonitoringResult
  projectName?: string
  generatedBy?: string
  /** Optional DEM band for depth/risk screening enhancement. */
  elevBand?: GeoBand | null
  onProgress?: (done: number, total: number, label: string) => void
}

export type SarFloodMapSpec = {
  id: string
  title: string
  subtitle?: string
  kind: 'aoi' | 'flood-raster' | 'change-raster' | 'boundaries' | 'classes' | 'depth' | 'risk'
}

export const SAR_FLOOD_REPORT_MAP_SPECS: SarFloodMapSpec[] = [
  {
    id: 'aoi-location',
    title: 'AOI Location Map',
    subtitle: 'Satellite overview with AOI boundary',
    kind: 'aoi',
  },
  {
    id: 'flood-extent',
    title: 'Flood Extent Map',
    subtitle: 'SAR-derived inundation mask',
    kind: 'flood-raster',
  },
  {
    id: 'change-detection',
    title: 'Change Detection Map',
    subtitle: 'Pre vs post SAR water comparison',
    kind: 'change-raster',
  },
  {
    id: 'flood-boundaries',
    title: 'Flood Boundaries Map',
    subtitle: 'Vectorised flood extent outline',
    kind: 'boundaries',
  },
  {
    id: 'inundation-classes',
    title: 'Inundation Classes Map',
    subtitle: 'New / persistent / receded / dry composition',
    kind: 'classes',
  },
  {
    id: 'flood-depth',
    title: 'Flood Depth Proxy Map',
    subtitle: 'Screening depth classes (not a hydraulic model)',
    kind: 'depth',
  },
  {
    id: 'flood-risk',
    title: 'Flood Risk Screening Map',
    subtitle: 'Inundation + topography screening classes',
    kind: 'risk',
  },
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
  return [legend.title, ...legend.swatches.map(s => s.label || s.color), legend.note]
    .filter(Boolean)
    .join(' · ')
}

export function floodBoundsToCorners(
  bounds: [number, number, number, number],
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bounds
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}
