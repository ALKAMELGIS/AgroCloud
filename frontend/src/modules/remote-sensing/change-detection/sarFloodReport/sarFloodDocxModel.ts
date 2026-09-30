import type { SarFloodReportPayload } from './sarFloodReportTypes'

export type SarFloodDocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type SarFloodDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
  areaHa: string
  crs: string
  centroidLabel: string
  analysisDate: string
  sensorLabel: string
  modality: string
  preDate: string
  postDate: string
  thresholdDb: string
  mode: string
  resolution: string
  executiveNarrative: string
  detectionSummary: string
  inundationSummary: string
  depthRiskSummary: string
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
  methodologyNotes: string
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

export function buildSarFloodDocxModel(payload: SarFloodReportPayload): {
  model: SarFloodDocxModel
  images: SarFloodDocxImageAsset[]
} {
  const images: SarFloodDocxImageAsset[] = []
  let imageCounter = 0

  const snapshotBlocks = payload.snapshots.map(snap => {
    let rId: string | null = null
    if (snap.imageBase64) {
      imageCounter += 1
      rId = nextRid(imageCounter)
      images.push({ rId, fileName: `sar_flood_${imageCounter}.png`, base64: snap.imageBase64 })
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

  const model: SarFloodDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC',
    aoiName: payload.aoiName,
    areaHa: `${payload.areaHa.toFixed(2)} ha`,
    crs: payload.crs,
    centroidLabel: payload.centroidLabel,
    analysisDate: payload.analysisDate,
    sensorLabel: payload.sensorLabel,
    modality: payload.modality,
    preDate: payload.preDate,
    postDate: payload.postDate,
    thresholdDb: `${payload.thresholdDb} dB`,
    mode: payload.mode,
    resolution: payload.resolution,
    executiveNarrative: payload.executive.projectOverview,
    detectionSummary: payload.executive.detectionSummary,
    inundationSummary: payload.executive.inundationSummary,
    depthRiskSummary: payload.executive.depthRiskSummary,
    conclusion: payload.executive.conclusion,
    snapshotBlocks,
    tables: payload.tables,
    recommendations: payload.recommendations,
    dataQualityNotes: payload.dataQualityNotes,
    methodologyNotes: payload.methodologyNotes,
  }

  return { model, images }
}
