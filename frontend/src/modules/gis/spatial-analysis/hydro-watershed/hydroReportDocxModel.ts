import type { HydroReportPayload } from './hydroReportTypes'

export type HydroDocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type HydroDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
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
  snapshotBlocks: Array<{
    title: string
    legend: string
    stats: string
    rId: string | null
    note?: string
  }>
  tables: Array<{ title: string; headers: string[]; rows: string[][] }>
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

function nextRid(counter: number): string {
  return `rIdImg${counter}`
}

export function buildHydroDocxModel(payload: HydroReportPayload): {
  model: HydroDocxModel
  images: HydroDocxImageAsset[]
} {
  const images: HydroDocxImageAsset[] = []
  let imageCounter = 0

  const snapshotBlocks = payload.snapshots.map(snap => {
    let rId: string | null = null
    if (snap.imageBase64) {
      imageCounter += 1
      rId = nextRid(imageCounter)
      images.push({ rId, fileName: `hydro_${imageCounter}.png`, base64: snap.imageBase64 })
    }
    const stats = snap.stats.map(row => `${row.label}: ${row.value}`).join(' · ')
    return {
      title: snap.title,
      legend: snap.legendText,
      stats,
      rId,
      note: snap.note,
    }
  })

  const model: HydroDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC',
    aoiName: payload.aoiName,
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
    snapshotBlocks,
    tables: payload.tables,
    recommendations: payload.recommendations,
    dataQualityNotes: payload.dataQualityNotes,
    completedStepsLabel: payload.completedSteps.join(', ') || 'None',
  }

  return { model, images }
}
