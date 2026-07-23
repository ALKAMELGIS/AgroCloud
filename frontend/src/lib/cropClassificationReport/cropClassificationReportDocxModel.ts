import {
  buildDocxChartXml,
  type DocxNativeChartSpec,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxNativeCharts'
import type { CropClassificationReportPayload } from './cropClassificationReportTypes'

export type CropDocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type CropClassificationDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
  areaHa: string
  centroidLabel: string
  periodLabel: string
  engine: string
  countryLabel: string
  resolutionLabel: string
  cloudLabel: string
  datesLabel: string
  classCount: number
  executiveOverview: string
  executiveComposition: string
  executiveMethodology: string
  executiveConclusion: string
  metaRows: Array<[string, string]>
  classTableHeaders: string[]
  classTableRows: string[][]
  mapTiles: Array<{ title: string; subtitle: string; rId: string | null; note?: string }>
  chartRIds: Array<{ title: string; rId: string }>
  nativeCharts: DocxNativeChartSpec[]
  recommendations: string[]
  methodologyNotes: string[]
  dataQualityNotes: string[]
  footerNote: string
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function stripColor(hex: string): string {
  return hex.replace(/^#/, '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6) || '94A3B8'
}

export function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export function buildCropClassificationDocxModel(
  payload: CropClassificationReportPayload,
): { model: CropClassificationDocxModel; images: CropDocxImageAsset[] } {
  const images: CropDocxImageAsset[] = []
  let imageCounter = 0
  const mapTiles = payload.maps.map(m => {
    let rId: string | null = null
    if (m.imageBase64) {
      imageCounter += 1
      rId = `rIdImg${imageCounter}`
      images.push({ rId, fileName: `image${imageCounter}.png`, base64: m.imageBase64 })
    }
    return { title: m.title, subtitle: m.subtitle, rId, note: m.note }
  })

  const classes = payload.classes
  const categories = classes.map(c => c.name)
  const nativeCharts: DocxNativeChartSpec[] = []
  const chartRIds: Array<{ title: string; rId: string }> = []

  if (classes.length) {
    const pie: DocxNativeChartSpec = {
      rId: 'rIdChart1',
      fileStem: 'chart1',
      title: 'Crop Composition Share (%)',
      yAxisLabel: 'Share',
      categories,
      kind: 'pie',
      sliceColors: classes.map(c => stripColor(c.color)),
      series: [
        {
          name: 'Share %',
          values: classes.map(c => c.pct),
        },
      ],
    }
    // Apply per-slice colours via chart builder palette; bar uses class colours.
    nativeCharts.push(pie)
    chartRIds.push({ title: pie.title, rId: pie.rId })

    const bar: DocxNativeChartSpec = {
      rId: 'rIdChart2',
      fileStem: 'chart2',
      title: 'Crop Area by Class (ha)',
      yAxisLabel: 'Area (ha)',
      yNumFmt: '0.00',
      categories,
      kind: 'bar',
      series: [
        {
          name: 'Area (ha)',
          values: classes.map(c => c.areaHa),
          color: '047857',
          asBar: true,
        },
      ],
    }
    // Prefer per-class colours on a single series is not supported; emit multi-series
    // bars only when few classes so Word stays readable.
    if (classes.length <= 8) {
      bar.series = classes.map(c => ({
        name: c.name,
        values: categories.map(name => (name === c.name ? c.areaHa ?? c.pct : null)),
        color: stripColor(c.color),
        asBar: true,
      }))
      bar.title = classes.some(c => c.areaHa != null) ? 'Crop Area by Class (ha)' : 'Crop Share by Class (%)'
      bar.yAxisLabel = classes.some(c => c.areaHa != null) ? 'Area (ha)' : 'Share (%)'
    }
    nativeCharts.push(bar)
    chartRIds.push({ title: bar.title, rId: bar.rId })
  }

  const classTableRows = classes.map(c => [
    c.name,
    `${c.pct.toFixed(1)}%`,
    c.areaHa != null ? fmtHa(c.areaHa) : '—',
  ])
  if (classes.length) {
    const totalHa = classes.reduce((a, c) => a + (c.areaHa ?? 0), 0)
    classTableRows.push([
      'Total',
      '100%',
      classes.some(c => c.areaHa != null) ? fmtHa(totalHa) : '—',
    ])
  }

  const stamp = payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC'
  const model: CropClassificationDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: stamp,
    aoiName: payload.aoiName,
    areaHa: fmtHa(payload.areaHa),
    centroidLabel: payload.centroidLabel,
    periodLabel: `${payload.seasonStart} → ${payload.seasonEnd}`,
    engine: payload.engine,
    countryLabel: payload.countryLabel,
    resolutionLabel: payload.resolutionLabel,
    cloudLabel: payload.cloudLabel,
    datesLabel: payload.datesLabel,
    classCount: classes.length,
    executiveOverview: payload.executive.overview,
    executiveComposition: payload.executive.composition,
    executiveMethodology: payload.executive.methodology,
    executiveConclusion: payload.executive.conclusion,
    metaRows: [
      ['AOI / Field', payload.aoiName],
      ['Study area', fmtHa(payload.areaHa)],
      ['Centroid', payload.centroidLabel],
      ['Season window', `${payload.seasonStart} → ${payload.seasonEnd}`],
      ['Engine', payload.engine],
      ['Country', payload.countryLabel],
      ['Resolution', payload.resolutionLabel],
      ['Max scene cloud', payload.cloudLabel],
      ['Scene dates', payload.datesLabel],
      ['Detected classes', String(classes.length)],
      ['Generated', stamp],
    ],
    classTableHeaders: ['Class', 'Share %', 'Area (ha)'],
    classTableRows,
    mapTiles,
    chartRIds,
    nativeCharts,
    recommendations: payload.recommendations,
    methodologyNotes: payload.methodologyNotes,
    dataQualityNotes: payload.dataQualityNotes,
    footerNote: `Generated ${stamp} by ${payload.generatedBy}. Crop Classification Intelligence Report — cover, TOC, summary, tables, native charts, maps, and recommendations.`,
  }

  return { model, images }
}

/** Re-export for packaging convenience. */
export { buildDocxChartXml }
