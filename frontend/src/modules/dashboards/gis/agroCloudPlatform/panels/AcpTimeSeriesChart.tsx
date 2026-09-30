import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useAcpPlatform } from '../acpPlatformContext'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

export function AcpTimeSeriesChart() {
  const acp = useAcpPlatform()

  const data = useMemo((): ChartData<'line'> => ({
      labels: acp.chartLabels,
      datasets: [
        acp.config.chartSeries.includes('ndvi')
          ? {
              label: 'NDVI',
              data: acp.chartNdvi,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.15)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y',
            }
          : null,
        acp.config.chartSeries.includes('chas')
          ? {
              label: 'CHAS',
              data: acp.chartChas,
              borderColor: '#39ff14',
              backgroundColor: 'rgba(57,255,20,0.12)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y',
            }
          : null,
        acp.config.chartSeries.includes('ndmi')
          ? {
              label: 'NDMI',
              data: acp.chartNdmi,
              borderColor: '#14b8a6',
              backgroundColor: 'rgba(20,184,166,0.12)',
              fill: false,
              tension: 0.3,
              yAxisID: 'y',
            }
          : null,
      ].filter((d): d is NonNullable<typeof d> => d != null),
  }), [acp.chartLabels, acp.chartNdvi, acp.chartChas, acp.chartNdmi, acp.config.chartSeries])

  return (
    <footer className="acp-chart-panel">
      <div className="acp-chart-panel__meta">
        <span>
          Time series · {acp.selectedWmsLayer} · {acp.analysisDate}
        </span>
        <span>{acp.scopeMode === 'selection' ? 'Selected field' : acp.scopeMode === 'viewport' ? 'Viewport aggregate' : 'Global aggregate'}</span>
      </div>
      <div className="acp-chart-panel__canvas">
        <Line
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#d1fae5' } } },
            scales: {
              x: { ticks: { color: '#a7f3d0', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.08)' } },
              y: { ticks: { color: '#a7f3d0' }, grid: { color: 'rgba(255,255,255,0.08)' } },
            },
          }}
        />
      </div>
    </footer>
  )
}
