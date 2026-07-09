import type { CropClassificationResult } from '../siPrithviCropPipeline'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportClassificationPng(result: CropClassificationResult, filename = 'crop-classification.png') {
  const url = result.prediction?.url
  if (!url) throw new Error('No classification image to export.')
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to download classification image.')
  const blob = await res.blob()
  downloadBlob(blob, filename)
}

export function exportClassificationGeoJson(
  result: CropClassificationResult,
  aoiLabel = 'Crop classification AOI',
  filename = 'crop-classification-stats.geojson',
) {
  const stats = result.classStats ?? []
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: stats.map((s, i) => ({
      type: 'Feature',
      properties: {
        className: s.name,
        classId: s.id ?? i + 1,
        pct: s.pct,
        areaHa: s.areaHa ?? null,
        areaM2: s.areaHa != null ? s.areaHa * 10000 : null,
        engine: result.engine ?? null,
        dataProvider: result.dataProvider ?? null,
      },
      geometry: { type: 'Polygon', coordinates: [] as number[][][] },
    })),
  }
  const meta = {
    type: 'Feature',
    properties: { name: aoiLabel, exportedAt: new Date().toISOString(), kind: 'crop-classification-summary' },
    geometry: { type: 'Polygon', coordinates: [] as number[][][] },
  }
  fc.features.unshift(meta as GeoJSON.Feature)
  downloadBlob(new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' }), filename)
}

export function exportClassificationReportPdf(
  result: CropClassificationResult,
  meta: { aoiLabel?: string; workflow?: string } = {},
) {
  const stats = result.classStats ?? []
  const lines = [
    'Crop Classification Report',
    `Generated: ${new Date().toLocaleString()}`,
    meta.workflow ? `Workflow: ${meta.workflow}` : '',
    meta.aoiLabel ? `AOI: ${meta.aoiLabel}` : '',
    result.country?.name ? `Country: ${result.country.name}` : '',
    '',
    'Class statistics:',
    ...stats.map(s => `- ${s.name}: ${s.pct}%${s.areaHa != null ? ` · ${s.areaHa.toFixed(2)} ha` : ''}`),
  ].filter(Boolean)

  if (result.accuracy) {
    lines.push('', `Overall accuracy: ${(result.accuracy.overallAccuracy * 100).toFixed(1)}%`)
  }

  const text = lines.join('\n')
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'crop-classification-report.txt')
}
