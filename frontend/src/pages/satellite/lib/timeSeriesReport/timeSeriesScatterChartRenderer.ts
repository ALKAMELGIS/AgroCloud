import {
  Chart,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Legend,
  Title,
  Tooltip,
  Filler,
} from 'chart.js'
import type { ImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { buildImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { DocxNativeChartSpec } from './timeSeriesDocxNativeCharts'

Chart.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Legend,
  Title,
  Tooltip,
  Filler,
)

const CHART_W = 920
const CHART_H = 520

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

/** White report canvas — matches Intelligence Report scatter style (not Excel paste / not dark panel). */
const chartBgPlugin = {
  id: 'agroCorrelationBg',
  beforeDraw(chart: Chart) {
    const { ctx, width, height } = chart
    ctx.save()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  },
}

export type CorrelationValueRow = {
  date: string
  x: number
  y: number
}

export type TimeSeriesCorrelationBlock = {
  xLayerId: string
  yLayerId: string
  r: number
  r2: number
  n: number
  slope: number
  intercept: number
  relationshipLabel: string
  gisInsight: string
  agroInsight: string
  /** Plain-language 1–2 sentence interpretation for the report. */
  interpretation: string
  /** Paired observation table under the chart. */
  valueHeaders: string[]
  valueRows: string[][]
  /** XY points for native Word scatter ChartML. */
  points: Array<{ date: string; x: number; y: number }>
  /** Fit line endpoints for native Word scatter. */
  fitLine: Array<{ x: number; y: number }>
  /** Optional PNG preview (white theme); Word prefers native ChartML. */
  chartBase64: string | null
}

/** Concise 1–2 sentence interpretation of the linear relationship. */
export function buildCorrelationInterpretation(analysis: ImageryCorrelationScatterAnalysis): string {
  const { xLayerId, yLayerId, regression, relationship } = analysis
  const r = regression.r
  const r2pct = (regression.r2 * 100).toFixed(0)
  const absR = Math.abs(r)

  if (relationship.strength === 'none' || absR < 0.15) {
    return `${xLayerId} and ${yLayerId} show little linear association here (r = ${r.toFixed(2)}, R² ≈ ${r2pct}%). Treat them as largely independent signals for this AOI.`
  }

  const strengthWord =
    relationship.strength === 'strong'
      ? 'strong'
      : relationship.strength === 'moderate'
        ? 'moderate'
        : 'weak'

  if (xLayerId === 'NDVI' && yLayerId === 'LST' && relationship.direction === 'negative') {
    return `${strengthWord} negative link (r = ${r.toFixed(2)}): higher NDVI tends to coincide with cooler LST — typical canopy cooling. Only ~${r2pct}% of LST variance is explained by NDVI.`
  }
  if (xLayerId === 'NDVI' && yLayerId === 'LST' && relationship.direction === 'positive') {
    return `${strengthWord} positive link (r = ${r.toFixed(2)}): NDVI and LST rise together — check bare soil, stress, or seasonality. R² ≈ ${r2pct}%.`
  }
  if (relationship.direction === 'negative') {
    return `${strengthWord} negative relationship (r = ${r.toFixed(2)}): when ${xLayerId} increases, ${yLayerId} tends to decrease (R² ≈ ${r2pct}%).`
  }
  return `${strengthWord} positive relationship (r = ${r.toFixed(2)}): when ${xLayerId} increases, ${yLayerId} tends to increase (R² ≈ ${r2pct}%).`
}

function buildValueTable(analysis: ImageryCorrelationScatterAnalysis): {
  headers: string[]
  rows: string[][]
} {
  const headers = ['Date', analysis.xLayerId, analysis.yLayerId]
  const rows = analysis.points.map(p => [
    p.date || '—',
    p.x.toFixed(4),
    p.y.toFixed(4),
  ])
  return { headers, rows }
}

export function buildLayerCorrelationAnalyses(input: {
  labels: string[]
  series: Array<{ layerId: string; values: Array<number | null> }>
  layerIds: string[]
}): ImageryCorrelationScatterAnalysis[] {
  const ids = input.layerIds.map(id => id.toUpperCase())
  const analyses: ImageryCorrelationScatterAnalysis[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const xId = ids[i]!
      const yId = ids[j]!
      const xSeries = input.series.find(s => s.layerId.toUpperCase() === xId)
      const ySeries = input.series.find(s => s.layerId.toUpperCase() === yId)
      if (!xSeries || !ySeries) continue
      const xValues = xSeries.values.map(v => (v != null && Number.isFinite(v) ? Number(v) : Number.NaN))
      const yValues = ySeries.values.map(v => (v != null && Number.isFinite(v) ? Number(v) : Number.NaN))
      const analysis = buildImageryCorrelationScatterAnalysis(
        input.labels,
        xId,
        xValues,
        yId,
        yValues,
      )
      if (analysis) analyses.push(analysis)
    }
  }
  // Stable annex order: X then Y layer id.
  return analyses.sort(
    (a, b) =>
      a.xLayerId.localeCompare(b.xLayerId) || a.yLayerId.localeCompare(b.yLayerId),
  )
}

/**
 * White-background Chart.js scatter (report preview / fallback).
 * Word Intelligence Report prefers native ChartML via {@link buildCorrelationScatterNativeChartSpec}.
 */
export function renderCorrelationScatterChart(
  analysis: ImageryCorrelationScatterAnalysis,
): string | null {
  if (analysis.points.length < 2) return null
  if (typeof document === 'undefined') return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = CHART_W
    canvas.height = CHART_H

    const scatterPts = analysis.points.map(p => ({ x: p.x, y: p.y }))
    const linePts = analysis.regressionLine.map(p => ({ x: p.x, y: p.y }))
    const r = analysis.regression.r
    const r2 = analysis.regression.r2

    const chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            type: 'scatter',
            label: `${analysis.xLayerId} vs ${analysis.yLayerId}`,
            data: scatterPts,
            backgroundColor: 'rgba(22, 101, 52, 0.72)',
            borderColor: '#14532d',
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointStyle: 'circle',
          },
          {
            type: 'line',
            label: `Fit · R²=${r2.toFixed(3)}`,
            data: linePts,
            borderColor: '#dc2626',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            showLine: true,
          },
        ],
      },
      plugins: [chartBgPlugin],
      options: {
        responsive: false,
        animation: false,
        layout: { padding: { top: 8, right: 16, bottom: 4, left: 8 } },
        plugins: {
          title: {
            display: true,
            text: `Correlation Scatter · ${analysis.xLayerId} × ${analysis.yLayerId} · R² = ${r2.toFixed(3)} · r = ${r.toFixed(3)}`,
            color: '#0f172a',
            font: { size: 14, weight: 'bold', family: 'Segoe UI, system-ui, sans-serif' },
            padding: { top: 6, bottom: 12 },
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#334155',
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: false,
              font: { size: 11, family: 'Segoe UI, system-ui, sans-serif' },
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(255,255,255,0.96)',
            titleColor: '#0f172a',
            bodyColor: '#334155',
            borderColor: '#cbd5e1',
            borderWidth: 1,
            callbacks: {
              label: ctx => {
                const x = ctx.parsed.x
                const y = ctx.parsed.y
                return `${analysis.xLayerId} ${x?.toFixed(4)}  ·  ${analysis.yLayerId} ${y?.toFixed(4)}`
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: analysis.xLayerId,
              color: '#0f172a',
              font: { size: 12, weight: 'bold', family: 'Segoe UI, system-ui, sans-serif' },
            },
            ticks: {
              color: '#475569',
              font: { size: 10, family: 'Segoe UI, system-ui, sans-serif' },
            },
            grid: { color: 'rgba(148, 163, 184, 0.35)', drawBorder: false },
            border: { color: '#94a3b8' },
          },
          y: {
            type: 'linear',
            title: {
              display: true,
              text: analysis.yLayerId,
              color: '#0f172a',
              font: { size: 12, weight: 'bold', family: 'Segoe UI, system-ui, sans-serif' },
            },
            ticks: {
              color: '#475569',
              font: { size: 10, family: 'Segoe UI, system-ui, sans-serif' },
            },
            grid: { color: 'rgba(148, 163, 184, 0.35)', drawBorder: false },
            border: { color: '#94a3b8' },
          },
        },
      },
    })

    chart.update('none')
    const dataUrl = canvas.toDataURL('image/png', 1)
    chart.destroy()
    return dataUrlToBase64(dataUrl)
  } catch {
    return null
  }
}

/** Native Word scatter ChartML spec (editable Office chart, white background). */
export function buildCorrelationScatterNativeChartSpec(
  block: Pick<
    TimeSeriesCorrelationBlock,
    'xLayerId' | 'yLayerId' | 'r' | 'r2' | 'n' | 'points' | 'fitLine' | 'relationshipLabel'
  >,
  chartIndex: number,
): DocxNativeChartSpec {
  const title = `Correlation Scatter · ${block.xLayerId} × ${block.yLayerId} · R² = ${block.r2.toFixed(3)} · r = ${block.r.toFixed(3)}`
  return {
    rId: `rIdChart${chartIndex}`,
    fileStem: `chart${chartIndex}`,
    title,
    yAxisLabel: block.yLayerId,
    xAxisLabel: block.xLayerId,
    yNumFmt: '0.00',
    xNumFmt: '0.00',
    categories: [],
    series: [],
    kind: 'scatter',
    scatterSeries: [
      {
        name: `${block.xLayerId} vs ${block.yLayerId}`,
        points: block.points.map(p => ({ x: p.x, y: p.y })),
        color: '166534',
        showLine: false,
      },
      {
        name: `Fit - R²=${block.r2.toFixed(3)}`,
        points: block.fitLine.length >= 2 ? block.fitLine : block.points.slice(0, 2).map(p => ({ x: p.x, y: p.y })),
        color: 'DC2626',
        showLine: true,
        hideMarkers: true,
      },
    ],
  }
}

export function buildTimeSeriesCorrelationBlocks(input: {
  labels: string[]
  displayLabels?: string[]
  series: Array<{ layerId: string; values: Array<number | null> }>
  layerIds: string[]
  /** When false, skip Chart.js PNG (Word uses native ChartML). Default true for preview. */
  includePng?: boolean
}): TimeSeriesCorrelationBlock[] {
  const analyses = buildLayerCorrelationAnalyses(input)
  return analyses.map(analysis => {
    const table = buildValueTable(analysis)
    return {
      xLayerId: analysis.xLayerId,
      yLayerId: analysis.yLayerId,
      r: analysis.regression.r,
      r2: analysis.regression.r2,
      n: analysis.regression.n,
      slope: analysis.regression.slope,
      intercept: analysis.regression.intercept,
      relationshipLabel: analysis.relationship.label,
      gisInsight: analysis.gisInsight,
      agroInsight: analysis.agroInsight,
      interpretation: buildCorrelationInterpretation(analysis),
      valueHeaders: table.headers,
      valueRows: table.rows,
      points: analysis.points.map(p => ({ date: p.date || '—', x: p.x, y: p.y })),
      fitLine: analysis.regressionLine.map(p => ({ x: p.x, y: p.y })),
      chartBase64: input.includePng === false ? null : renderCorrelationScatterChart(analysis),
    }
  })
}
