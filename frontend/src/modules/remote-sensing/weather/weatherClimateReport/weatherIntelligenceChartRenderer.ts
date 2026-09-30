import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'

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
  Filler,
)

const CHART_W = 880
const CHART_H = 400

export type WeatherDocxChart = {
  id: string
  title: string
  base64: string
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

function sampleLabels<T extends { label: string }>(rows: T[], max = 48): T[] {
  if (rows.length <= max) return rows
  const step = Math.ceil(rows.length / max)
  return rows.filter((_, i) => i % step === 0 || i === rows.length - 1)
}

function renderChart(config: ConstructorParameters<typeof Chart>[1]): string {
  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H
  const chart = new Chart(canvas, {
    ...config,
    options: {
      ...config.options,
      responsive: false,
      animation: false,
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 6 } },
    },
  })
  chart.update('none')
  const dataUrl = canvas.toDataURL('image/png', 1)
  chart.destroy()
  return dataUrlToBase64(dataUrl)
}

function dailySeries(payload: WeatherClimateReportPayload): Array<{
  label: string
  temp: number | null
  rain: number | null
  humid: number | null
  wind: number | null
  solar: number | null
  et0: number | null
  anomaly: number | null
}> {
  const temps = payload.dailyRecords.map(d => d.tempAvgC).filter((v): v is number => v != null)
  const baseTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null
  return payload.dailyRecords.map(d => ({
    label: d.date.slice(5),
    temp: d.tempAvgC,
    rain: d.rainfallMm,
    humid: d.humidityPct,
    wind: d.windSpeedKmh,
    solar: d.solarRadiationWm2,
    et0: d.et0Mm,
    anomaly: baseTemp != null && d.tempAvgC != null ? d.tempAvgC - baseTemp : null,
  }))
}

export function renderWeatherIntelligenceCharts(
  payload: WeatherClimateReportPayload,
): WeatherDocxChart[] {
  const agg = climateAggregationLabel(payload.timeAggregation)
  const series = sampleLabels(dailySeries(payload))
  const labels = series.map(s => s.label)
  const charts: WeatherDocxChart[] = []

  charts.push({
    id: 'tempTrend',
    title: 'Temperature Trend',
    base64: renderChart({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Avg temperature (°C)',
            data: series.map(s => s.temp),
            borderColor: '#ea580c',
            backgroundColor: 'rgba(234,88,12,0.12)',
            fill: true,
            tension: 0.25,
            borderWidth: 2.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: `Temperature Trend — ${agg}`,
            color: '#0f172a',
            font: { size: 14, weight: 'bold' },
          },
          legend: { display: false },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 9 } } },
          y: { title: { display: true, text: '°C', font: { size: 10 } } },
        },
      },
    }),
  })

  charts.push({
    id: 'rainfall',
    title: 'Rainfall Distribution',
    base64: renderChart({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Rainfall (mm)',
            data: series.map(s => s.rain),
            backgroundColor: 'rgba(37,99,235,0.55)',
            borderColor: '#2563eb',
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: `Rainfall Distribution — ${agg}`,
            color: '#0f172a',
            font: { size: 14, weight: 'bold' },
          },
          legend: { display: false },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 9 } } },
          y: { title: { display: true, text: 'mm', font: { size: 10 } } },
        },
      },
    }),
  })

  charts.push({
    id: 'etRain',
    title: 'Evapotranspiration vs Rainfall',
    base64: renderChart({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Rainfall (mm)',
            data: series.map(s => s.rain),
            backgroundColor: 'rgba(59,130,246,0.45)',
            yAxisID: 'yRain',
            order: 2,
          },
          {
            type: 'line',
            label: 'ET₀ (mm)',
            data: series.map(s => s.et0),
            borderColor: '#7c3aed',
            backgroundColor: '#7c3aed',
            borderWidth: 2,
            tension: 0.2,
            yAxisID: 'yEt',
            order: 1,
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Evapotranspiration vs Rainfall',
            color: '#0f172a',
            font: { size: 14, weight: 'bold' },
          },
          legend: { position: 'bottom', labels: { font: { size: 9 } } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 9 } } },
          yRain: { position: 'left', title: { display: true, text: 'Rain mm' } },
          yEt: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'ET₀ mm' } },
        },
      },
    }),
  })

  const monthly = payload.monthlyCalendar.filter(m => m.avgTempC != null)
  if (monthly.length) {
    charts.push({
      id: 'tempAnomaly',
      title: 'Monthly Temperature Profile',
      base64: renderChart({
        type: 'bar',
        data: {
          labels: monthly.map(m => m.monthLabel.slice(0, 3)),
          datasets: [
            {
              label: 'Avg temp (°C)',
              data: monthly.map(m => m.avgTempC),
              backgroundColor: monthly.map(m =>
                (m.avgTempC ?? 0) >= 30 ? 'rgba(239,68,68,0.65)' : 'rgba(16,185,129,0.55)',
              ),
              borderWidth: 0,
            },
          ],
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Monthly Temperature & Seasonal Pattern',
              color: '#0f172a',
              font: { size: 14, weight: 'bold' },
            },
            legend: { display: false },
          },
          scales: {
            y: { title: { display: true, text: '°C' } },
          },
        },
      }),
    })
  }

  charts.push({
    id: 'humidityWind',
    title: 'Humidity & Wind',
    base64: renderChart({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Humidity (%)',
            data: series.map(s => s.humid),
            borderColor: '#0891b2',
            borderWidth: 2,
            tension: 0.25,
            yAxisID: 'yH',
          },
          {
            label: 'Wind (km/h)',
            data: series.map(s => s.wind),
            borderColor: '#059669',
            borderWidth: 2,
            borderDash: [4, 3],
            tension: 0.25,
            yAxisID: 'yW',
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Humidity Trend & Wind Speed',
            color: '#0f172a',
            font: { size: 14, weight: 'bold' },
          },
          legend: { position: 'bottom', labels: { font: { size: 9 } } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 9 } } },
          yH: { position: 'left', min: 0, max: 100, title: { display: true, text: '%' } },
          yW: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'km/h' } },
        },
      },
    }),
  })

  return charts
}
