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
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  BarElement,
  Title,
  Tooltip,
  Legend,
)

const CHART_W = 860
const CHART_H = 380

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

function renderLineChart(
  title: string,
  labels: string[],
  datasets: Array<{ label: string; data: Array<number | null>; color: string; dashed?: boolean }>,
  yLabel: string,
): string | null {
  if (!labels.length || !datasets.some(d => d.data.some(v => v != null))) return null
  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.2,
        spanGaps: true,
        borderDash: d.dashed ? [6, 4] : [],
      })),
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: { display: true, text: title, font: { size: 14, weight: 'bold' } },
        legend: { display: datasets.length > 1, position: 'bottom' },
      },
      scales: {
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } },
        y: { title: { display: true, text: yLabel } },
      },
    },
  })
  chart.update('none')
  const out = dataUrlToBase64(canvas.toDataURL('image/png', 1))
  chart.destroy()
  return out
}

function renderBarChart(
  title: string,
  labels: string[],
  data: Array<number | null>,
  yLabel: string,
  color = '#047857',
): string | null {
  if (!labels.length || !data.some(v => v != null)) return null
  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: yLabel, data, backgroundColor: color, borderColor: color, borderWidth: 1 }],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { title: { display: true, text: title, font: { size: 14, weight: 'bold' } }, legend: { display: false } },
      scales: { y: { title: { display: true, text: yLabel } } },
    },
  })
  chart.update('none')
  const out = dataUrlToBase64(canvas.toDataURL('image/png', 1))
  chart.destroy()
  return out
}

export type WeatherClimateChartSet = {
  temperatureTrend?: string
  rainfallTrend?: string
  monthlyDistribution?: string
  climateAnomaly?: string
  temperatureForecast?: string
  rainfallForecast?: string
}

export function renderWeatherClimateCharts(payload: WeatherClimateReportPayload): WeatherClimateChartSet {
  const annualLabels = payload.annualSeries.map(a => String(a.year))
  const annualTemp = payload.annualSeries.map(a => a.avgTempC)
  const annualRain = payload.annualSeries.map(a => a.totalRainfallMm)
  const anomaly = payload.annualSeries.map(a => a.tempAnomalyC)

  const monthlyLabels = payload.monthlyCalendar.map(m => m.monthLabel.slice(0, 3))
  const monthlyRain = payload.monthlyCalendar.map(m => m.rainfallMm)

  const forecastLabels = payload.forecastRows.filter((_, i) => i % 2 === 0).map(r => String(r.year))
  const forecastTemp = payload.forecastRows.filter((_, i) => i % 2 === 0).map(r => r.predictedTempC)
  const forecastRain = payload.forecastRows.filter((_, i) => i % 2 === 0).map(r => r.predictedRainfallMm)

  return {
    temperatureTrend: renderLineChart(
      'Historical Temperature Trend',
      annualLabels,
      [{ label: 'Mean temperature (°C)', data: annualTemp, color: '#dc2626' }],
      '°C',
    ) ?? undefined,
    rainfallTrend: renderLineChart(
      'Historical Rainfall Trend',
      annualLabels,
      [{ label: 'Annual rainfall (mm)', data: annualRain, color: '#2563eb' }],
      'mm',
    ) ?? undefined,
    monthlyDistribution: renderBarChart(
      'Monthly Rainfall Distribution',
      monthlyLabels,
      monthlyRain,
      'mm',
      '#0d9488',
    ) ?? undefined,
    climateAnomaly: renderLineChart(
      'Temperature Anomaly (vs period mean)',
      annualLabels,
      [{ label: 'Anomaly (°C)', data: anomaly, color: '#ea580c' }],
      '°C',
    ) ?? undefined,
    temperatureForecast: renderLineChart(
      'Temperature Forecast (2026–2050)',
      forecastLabels,
      [{ label: 'Predicted mean temperature', data: forecastTemp, color: '#b91c1c', dashed: true }],
      '°C',
    ) ?? undefined,
    rainfallForecast: renderLineChart(
      'Rainfall Forecast (2026–2050)',
      forecastLabels,
      [{ label: 'Predicted annual rainfall', data: forecastRain, color: '#1d4ed8', dashed: true }],
      'mm',
    ) ?? undefined,
  }
}
