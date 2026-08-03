import {
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend)

export type ExcelTrendChartPair = {
  title: string
  yAxisLabel: string
  layers: Array<{
    layerId: string
    values: Array<number | null>
    color: string
    dashed?: boolean
  }>
}

const CHART_W = 860
const CHART_H = 420

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

function seriesValues(values: Array<number | null>): Array<number | null> {
  return values.map(v => (v != null && Number.isFinite(v) ? Number(v) : null))
}

export function renderTrendChartPair(
  labels: string[],
  pair: ExcelTrendChartPair,
): string | null {
  if (!labels.length || !pair.layers.length) return null
  const hasData = pair.layers.some(layer => layer.values.some(v => v != null && Number.isFinite(v)))
  if (!hasData) return null

  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: pair.layers.map(layer => ({
        label: layer.layerId,
        data: seriesValues(layer.values),
        borderColor: layer.color,
        backgroundColor: layer.color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 4,
        tension: 0.25,
        spanGaps: false,
        borderDash: layer.dashed ? [7, 4] : [],
      })),
    },
    options: {
      responsive: false,
      animation: false,
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
      plugins: {
        title: {
          display: true,
          text: pair.title,
          color: '#0f172a',
          font: { size: 15, weight: 'bold' },
          padding: { bottom: 10 },
        },
        legend: {
          display: true,
          position: 'right',
          align: 'center',
          labels: {
            boxWidth: 14,
            boxHeight: 2,
            color: '#334155',
            font: { size: 11 },
            usePointStyle: false,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y
              return `${ctx.dataset.label}: ${v == null || !Number.isFinite(v) ? '-' : v.toFixed(4)}`
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Period',
            color: '#475569',
            font: { size: 11, weight: 'bold' },
          },
          ticks: {
            color: '#64748b',
            maxRotation: 45,
            minRotation: 45,
            font: { size: 9 },
            autoSkip: true,
            maxTicksLimit: 14,
          },
          grid: { color: 'rgba(148,163,184,0.25)' },
        },
        y: {
          title: {
            display: true,
            text: pair.yAxisLabel,
            color: '#475569',
            font: { size: 11, weight: 'bold' },
          },
          ticks: {
            color: '#64748b',
            font: { size: 9 },
            callback: value => Number(value).toFixed(4),
          },
          grid: { color: 'rgba(148,163,184,0.25)' },
        },
      },
    },
  })

  chart.update('none')
  const dataUrl = canvas.toDataURL('image/png', 1)
  chart.destroy()
  return dataUrlToBase64(dataUrl)
}

export function buildDefaultExcelChartPairs(
  labels: string[],
  series: Array<{ layerId: string; values: Array<number | null> }>,
): ExcelTrendChartPair[] {
  const find = (id: string) => series.find(s => s.layerId.toUpperCase() === id.toUpperCase())

  const pairs: ExcelTrendChartPair[] = []

  const ndvi = find('NDVI')
  const savi = find('SAVI')
  if (ndvi || savi) {
    const layers = []
    if (ndvi) layers.push({ layerId: 'NDVI', values: ndvi.values, color: '#047857', dashed: false })
    if (savi) layers.push({ layerId: 'SAVI', values: savi.values, color: '#f97316', dashed: true })
    const title =
      ndvi && savi ? 'NDVI & SAVI Trend' : `${(ndvi ?? savi)!.layerId} Trend`
    const yAxisLabel = ndvi && savi ? 'NDVI / SAVI' : (ndvi ?? savi)!.layerId
    pairs.push({ title, yAxisLabel, layers })
  }

  const ndmi = find('NDMI')
  const ndwi = find('NDWI')
  if (ndmi || ndwi) {
    const layers = []
    if (ndmi) layers.push({ layerId: 'NDMI', values: ndmi.values, color: '#2563eb', dashed: false })
    if (ndwi) layers.push({ layerId: 'NDWI', values: ndwi.values, color: '#0d9488', dashed: true })
    const title =
      ndmi && ndwi ? 'NDMI & NDWI Trend' : `${(ndmi ?? ndwi)!.layerId} Trend`
    const yAxisLabel = ndmi && ndwi ? 'NDMI / NDWI' : (ndmi ?? ndwi)!.layerId
    pairs.push({ title, yAxisLabel, layers })
  }

  if (!pairs.length && series.length) {
    const primary = series[0]!
    pairs.push({
      title: `${primary.layerId} Trend`,
      yAxisLabel: primary.layerId,
      layers: [{ layerId: primary.layerId, values: primary.values, color: '#047857', dashed: false }],
    })
  }

  return pairs
}

export async function renderExcelTrendCharts(
  labels: string[],
  series: Array<{ layerId: string; values: Array<number | null> }>,
): Promise<Array<{ title: string; base64: string }>> {
  const pairs = buildDefaultExcelChartPairs(labels, series)
  const images: Array<{ title: string; base64: string }> = []
  for (const pair of pairs) {
    const base64 = renderTrendChartPair(labels, pair)
    if (base64) images.push({ title: pair.title, base64 })
  }
  return images
}
