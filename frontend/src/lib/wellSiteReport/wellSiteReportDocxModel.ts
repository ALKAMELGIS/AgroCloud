import type { DocxNativeChartSpec } from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxNativeCharts'
import type { WellSiteReportPayload } from './wellSiteReportTypes'

export type WellSiteDocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type WellSiteDocxModel = {
  projectName: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
  areaHa: string
  centroidLabel: string
  siteCount: number
  bestScore: string
  meanScore: string
  meanSlope: string
  resolutionLabel: string
  executiveOverview: string
  executiveSuitability: string
  executiveMethodology: string
  executiveConclusion: string
  metaRows: Array<[string, string]>
  summaryTableHeaders: string[]
  summaryTableRows: string[][]
  wellTableHeaders: string[]
  wellTableRows: string[][]
  mapTiles: Array<{ title: string; subtitle: string; rId: string | null; note?: string }>
  chartRIds: Array<{ title: string; rId: string }>
  nativeCharts: DocxNativeChartSpec[]
  recommendations: string[]
  finalRecommendation: {
    interpretation: string
    preDrillingIntro: string
    preDrillingSteps: string[]
  }
  methodologyNotes: string[]
  dataQualityNotes: string[]
  footerNote: string
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function scoreColor(score: number): string {
  if (score >= 80) return '14532D'
  if (score >= 65) return '1E3A8A'
  if (score >= 50) return 'B45309'
  return '7F1D1D'
}

export function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export function buildWellSiteDocxModel(
  payload: WellSiteReportPayload,
): { model: WellSiteDocxModel; images: WellSiteDocxImageAsset[] } {
  const images: WellSiteDocxImageAsset[] = []
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

  const wells = payload.wells
  const nativeCharts: DocxNativeChartSpec[] = []
  const chartRIds: Array<{ title: string; rId: string }> = []

  if (wells.length) {
    const categories = wells.map(w => `#${w.rank}`)
    const bar: DocxNativeChartSpec = {
      rId: 'rIdChart1',
      fileStem: 'chart1',
      title: 'Well Suitability Score by Rank (%)',
      yAxisLabel: 'Score (%)',
      yNumFmt: '0',
      categories,
      kind: 'bar',
      series:
        wells.length <= 10
          ? wells.map(w => ({
              name: w.name,
              values: categories.map(c => (c === `#${w.rank}` ? w.score : null)),
              color: scoreColor(w.score),
              asBar: true,
            }))
          : [
              {
                name: 'Suitability %',
                values: wells.map(w => w.score),
                color: '1E3A8A',
                asBar: true,
              },
            ],
    }
    nativeCharts.push(bar)
    chartRIds.push({ title: bar.title, rId: bar.rId })

    const elev: DocxNativeChartSpec = {
      rId: 'rIdChart2',
      fileStem: 'chart2',
      title: 'Elevation vs Slope at Recommended Sites',
      yAxisLabel: 'Value',
      categories,
      kind: 'bar',
      series: [
        {
          name: 'Elevation (m)',
          values: wells.map(w => w.elev_m),
          color: '0F766E',
          asBar: true,
        },
        {
          name: 'Slope (%)',
          values: wells.map(w => w.slope_pc),
          color: 'B45309',
          asBar: true,
        },
      ],
    }
    nativeCharts.push(elev)
    chartRIds.push({ title: elev.title, rId: elev.rId })
  }

  const summaryTableRows = [
    ['Recommended sites', String(payload.siteCount)],
    ['Best suitability score', `${payload.bestScore}%`],
    ['Mean score (sites)', `${payload.meanScore}%`],
    ['Mean slope', payload.meanSlope],
    ['Resolution', payload.resolutionLabel],
    ...payload.stats
      .filter(s => !/recommended|best score|mean slope|resolut/i.test(s.label))
      .map(s => [s.label, s.value] as [string, string]),
  ]

  const wellTableRows = wells.map(w => [
    String(w.rank),
    w.name,
    `${w.score}%`,
    w.lng.toFixed(5),
    w.lat.toFixed(5),
    w.elev_m.toFixed(1),
    w.slope_pc.toFixed(1),
    w.aq_type || '—',
    w.water_table_m.toFixed(1),
    w.yield_m3d.toFixed(1),
    w.confidence || '—',
    w.risk_lvl || '—',
  ])

  const stamp = payload.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC'
  const model: WellSiteDocxModel = {
    projectName: payload.projectName,
    generatedBy: payload.generatedBy,
    generatedStamp: stamp,
    aoiName: payload.aoiName,
    areaHa: fmtHa(payload.areaHa),
    centroidLabel: payload.centroidLabel,
    siteCount: payload.siteCount,
    bestScore: `${payload.bestScore}%`,
    meanScore: `${payload.meanScore}%`,
    meanSlope: payload.meanSlope,
    resolutionLabel: payload.resolutionLabel,
    executiveOverview: payload.executive.overview,
    executiveSuitability: payload.executive.suitability,
    executiveMethodology: payload.executive.methodology,
    executiveConclusion: payload.executive.conclusion,
    metaRows: [
      ['AOI / Field', payload.aoiName],
      ['Study area', fmtHa(payload.areaHa)],
      ['Centroid', payload.centroidLabel],
      ['Recommended wells', String(payload.siteCount)],
      ['Best score', `${payload.bestScore}%`],
      ['Mean score', `${payload.meanScore}%`],
      ['Mean slope', payload.meanSlope],
      ['Resolution', payload.resolutionLabel],
      ['Engine', 'Well Site Recommendation (Hydro-AI)'],
      ['Generated', stamp],
    ],
    summaryTableHeaders: ['Metric', 'Value'],
    summaryTableRows,
    wellTableHeaders: [
      'Rank',
      'Name',
      'Score',
      'Lng',
      'Lat',
      'Elev (m)',
      'Slope %',
      'Aquifer',
      'WT (m)',
      'Yield m³/d',
      'Conf.',
      'Risk',
    ],
    wellTableRows,
    mapTiles,
    chartRIds,
    nativeCharts,
    recommendations: payload.recommendations,
    finalRecommendation: payload.finalRecommendation,
    methodologyNotes: payload.methodologyNotes,
    dataQualityNotes: payload.dataQualityNotes,
    footerNote: `Generated ${stamp} by ${payload.generatedBy}. Well Site Recommendation (Hydro-AI) — cover, TOC, summary, tables, charts, and professional maps with basemap & legend.`,
  }

  return { model, images }
}
