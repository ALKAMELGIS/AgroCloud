import {
  BarController,
  BarElement,
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
import type { TimeSeriesWeatherPoint } from './timeSeriesWeatherTimeline'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Title,
  Tooltip,
  Legend,
)

const CHART_W = 900
const CHART_H = 440

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

function seriesValues(values: Array<number | null>): Array<number | null> {
  return values.map(v => (v != null && Number.isFinite(v) ? Number(v) : null))
}

export function renderWeatherTimelineChart(
  points: TimeSeriesWeatherPoint[],
  aggregationLabel: string,
): string | null {
  if (!points.length) return null
  const hasData = points.some(
    p =>
      p.temperatureC != null ||
      p.humidityPct != null ||
      p.rainfallMm != null ||
      p.windSpeedMs != null,
  )
  if (!hasData) return null

  const labels = points.map(p => p.displayLabel)
  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          type: 'bar' as const,
          label: 'Rainfall (mm)',
          data: seriesValues(points.map(p => p.rainfallMm)),
          backgroundColor: 'rgba(59, 130, 246, 0.45)',
          borderColor: 'rgba(37, 99, 235, 0.85)',
          borderWidth: 1,
          yAxisID: 'yRain',
          order: 4,
        },
        {
          type: 'line' as const,
          label: 'Temperature (°C)',
          data: seriesValues(points.map(p => p.temperatureC)),
          borderColor: '#ea580c',
          backgroundColor: '#ea580c',
          borderWidth: 2.5,
          pointRadius: 3,
          tension: 0.25,
          yAxisID: 'yTemp',
          order: 1,
        },
        {
          type: 'line' as const,
          label: 'Humidity (%)',
          data: seriesValues(points.map(p => p.humidityPct)),
          borderColor: '#0891b2',
          backgroundColor: '#0891b2',
          borderWidth: 2,
          pointRadius: 2.5,
          borderDash: [4, 3],
          tension: 0.25,
          yAxisID: 'yHumid',
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Wind (m/s)',
          data: seriesValues(points.map(p => p.windSpeedMs)),
          borderColor: '#059669',
          backgroundColor: '#059669',
          borderWidth: 2,
          pointRadius: 2.5,
          tension: 0.25,
          yAxisID: 'yWind',
          order: 3,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      layout: { padding: { top: 10, right: 16, bottom: 6, left: 8 } },
      plugins: {
        title: {
          display: true,
          text: `Weather Timeline — ${aggregationLabel} aggregation`,
          color: '#0f172a',
          font: { size: 15, weight: 'bold' },
          padding: { bottom: 12 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            boxHeight: 8,
            color: '#334155',
            font: { size: 10 },
            padding: 14,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y
              if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label}: —`
              const unit =
                ctx.dataset.label?.includes('°C')
                  ? '°C'
                  : ctx.dataset.label?.includes('%')
                    ? '%'
                    : ctx.dataset.label?.includes('mm')
                      ? ' mm'
                      : ctx.dataset.label?.includes('m/s')
                        ? ' m/s'
                        : ''
              return `${ctx.dataset.label}: ${v.toFixed(1)}${unit}`
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#64748b',
            maxRotation: 45,
            minRotation: 25,
            font: { size: 9 },
            autoSkip: true,
            maxTicksLimit: 14,
          },
          grid: { color: 'rgba(148,163,184,0.2)' },
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: '#ea580c',
            font: { size: 10, weight: 'bold' },
          },
          ticks: { color: '#ea580c', font: { size: 9 } },
          grid: { color: 'rgba(148,163,184,0.2)' },
        },
        yHumid: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          title: {
            display: true,
            text: 'Humidity (%)',
            color: '#0891b2',
            font: { size: 10, weight: 'bold' },
          },
          ticks: { color: '#0891b2', font: { size: 9 } },
          grid: { drawOnChartArea: false },
        },
        yRain: {
          type: 'linear',
          position: 'right',
          offset: true,
          title: {
            display: true,
            text: 'Rainfall (mm)',
            color: '#2563eb',
            font: { size: 10, weight: 'bold' },
          },
          ticks: { color: '#2563eb', font: { size: 9 } },
          grid: { drawOnChartArea: false },
        },
        yWind: {
          type: 'linear',
          position: 'left',
          offset: true,
          title: {
            display: true,
            text: 'Wind (m/s)',
            color: '#059669',
            font: { size: 10, weight: 'bold' },
          },
          ticks: { color: '#059669', font: { size: 9 } },
          grid: { drawOnChartArea: false },
        },
      },
    },
  })

  chart.update('none')
  const dataUrl = canvas.toDataURL('image/png', 1)
  chart.destroy()
  return dataUrlToBase64(dataUrl)
}
