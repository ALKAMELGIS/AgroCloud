import type { HydroReportPayload, HydroReportTable } from './hydroReportTypes'
import { HYDRO_REPORT_MAP_SPECS } from './hydroReportTypes'

export type HydroDocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type HydroDocxSnapshotView = {
  rId: string | null
  legend: string
  stats: string
  note?: string
}

export type HydroDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
  locationLabel: string
  coverLocationLine: string
  sitePlanAreaLabel: string
  areaHa: string
  crs: string
  demSource: string
  demResolution: string
  analysisDate: string
  centroidLabel: string
  executiveNarrative: string
  terrainSummary: string
  hydrologicalSummary: string
  floodRiskSummary: string
  wetlandSummary: string
  conclusion: string
  snapshotsById: Record<string, HydroDocxSnapshotView>
  tables: HydroReportTable[]
  tablesByTitle: Record<string, HydroReportTable>
  keyIndicators: Array<[string, string]>
  recommendations: string[]
  dataQualityNotes: string
  completedStepsLabel: string
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function inferLocation(aoiName: string, locationLabel?: string): string {
  if (locationLabel?.trim()) return locationLabel.trim()
  const comma = aoiName.indexOf(',')
  if (comma >= 0) return aoiName.slice(comma + 1).trim()
  return ''
}

function coverBanner(aoiName: string, location: string): string {
  const base = aoiName.split(',')[0]?.trim() || aoiName
  const short = base.replace(/\s*-\s*SitePlan/i, '').trim()
  if (location) return `${short.toUpperCase()} · ${location.toUpperCase()}`
  return base.toUpperCase()
}

export function buildHydroDocxModel(payload: HydroReportPayload): {
  model: HydroDocxModel
  images: HydroDocxImageAsset[]
} {
  const images: HydroDocxImageAsset[] = []
  const snapshotsById: Record<string, HydroDocxSnapshotView> = {}
  let imageCounter = 0

  const snapBySpecId = Object.fromEntries(payload.snapshots.map(s => [s.id, s]))

  for (const spec of HYDRO_REPORT_MAP_SPECS) {
    const snap = snapBySpecId[spec.id]
    let rId: string | null = null
    if (snap?.imageBase64) {
      imageCounter += 1
      rId = `rIdImg${imageCounter}`
      images.push({ rId, fileName: `hydro_${imageCounter}.png`, base64: snap.imageBase64 })
    }
    snapshotsById[spec.id] = {
      rId,
      legend: snap?.legendText ?? '',
      stats: snap?.stats.map(row => `${row.label}: ${row.value}`).join(' · ') ?? '',
      note: snap?.note,
    }
  }

  const locationLabel = inferLocation(payload.aoiName, payload.locationLabel)
  const sitePlanHa = payload.sitePlanAreaHa ?? payload.areaHa
  const tablesByTitle = Object.fromEntries(payload.tables.map(t => [t.title, t]))

  const model: HydroDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC',
    aoiName: payload.aoiName.split(',')[0]?.trim() || payload.aoiName,
    locationLabel,
    coverLocationLine: coverBanner(payload.aoiName, locationLabel),
    sitePlanAreaLabel: `${sitePlanHa.toFixed(0)} ha`,
    areaHa: `${payload.areaHa.toFixed(2)} ha`,
    crs: payload.crs,
    demSource: payload.demSource,
    demResolution: payload.demResolution,
    analysisDate: payload.analysisDate,
    centroidLabel: payload.centroidLabel,
    executiveNarrative: payload.executive.projectOverview,
    terrainSummary: payload.executive.terrainSummary,
    hydrologicalSummary: payload.executive.hydrologicalSummary,
    floodRiskSummary: payload.executive.floodRiskSummary,
    wetlandSummary: payload.executive.wetlandSummary,
    conclusion: payload.executive.conclusion,
    snapshotsById,
    tables: payload.tables,
    tablesByTitle,
    keyIndicators: payload.keyIndicators,
    recommendations: payload.recommendations,
    dataQualityNotes: payload.dataQualityNotes,
    completedStepsLabel: payload.completedSteps.join(', ') || 'None',
  }

  return { model, images }
}
