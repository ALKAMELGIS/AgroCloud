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
} from 'chart.js'
import type { ImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { buildImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

Chart.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Legend,
  Title,
  Tooltip,
)

const CHART_W = 860
const CHART_H = 480

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
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
  chartBase64: string | null
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
  return analyses
}

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

    const chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            type: 'scatter',
            label: `${analysis.xLayerId} vs ${analysis.yLayerId}`,
            data: scatterPts,
            backgroundColor: 'rgba(6, 78, 59, 0.65)',
            borderColor: '#064e3b',
            pointRadius: 5,
            pointHoverRadius: 6,
          },
          {
            type: 'line',
            label: `Fit · R²=${analysis.regression.r2.toFixed(3)}`,
            data: linePts,
            borderColor: '#dc2626',
            backgroundColor: '#dc2626',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            showLine: true,
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: `Correlation Scatter · ${analysis.xLayerId} × ${analysis.yLayerId}  ·  R² = ${analysis.regression.r2.toFixed(3)}  ·  r = ${analysis.regression.r.toFixed(3)}`,
            color: '#0f172a',
            font: { size: 14, weight: 'bold' },
            padding: { bottom: 8 },
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#334155', boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const x = ctx.parsed.x
                const y = ctx.parsed.y
                return `${analysis.xLayerId}=${x?.toFixed(4)} · ${analysis.yLayerId}=${y?.toFixed(4)}`
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
              color: '#475569',
              font: { size: 12, weight: 'bold' },
            },
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(148,163,184,0.25)' },
          },
          y: {
            type: 'linear',
            title: {
              display: true,
              text: analysis.yLayerId,
              color: '#475569',
              font: { size: 12, weight: 'bold' },
            },
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(148,163,184,0.25)' },
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

export function buildTimeSeriesCorrelationBlocks(input: {
  labels: string[]
  displayLabels?: string[]
  series: Array<{ layerId: string; values: Array<number | null> }>
  layerIds: string[]
}): TimeSeriesCorrelationBlock[] {
  const analyses = buildLayerCorrelationAnalyses(input)
  return analyses.map(analysis => ({
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
    chartBase64: renderCorrelationScatterChart(analysis),
  }))
}
