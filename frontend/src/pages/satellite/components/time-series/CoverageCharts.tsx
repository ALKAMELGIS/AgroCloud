import { useMemo } from 'react'
import { Chart as ChartJS, DoughnutController } from 'chart.js'
import { Pie, Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(DoughnutController)
import type { VegetationCoverageSummary, VegetationCoverageTrendPoint } from '../../../../lib/vegetationCoverageEngine'
import { formatCoverageDate } from '../../../../lib/vegetationCoverageEngine'

export type CoverageChartsProps = {
  summary: VegetationCoverageSummary
  trend: VegetationCoverageTrendPoint[]
}

const CHART_FONT = { family: 'Inter, system-ui, sans-serif', size: 10 }
const GRID_COLOR = 'rgba(255,255,255,0.08)'
const TICK_COLOR = 'rgba(255,255,255,0.55)'

export function CoverageCharts({ summary, trend }: CoverageChartsProps) {
  const pieClasses = summary.classes.filter(c => c.pct > 0.5)

  const pieData = useMemo(
    () => ({
      labels: pieClasses.map(c => c.label),
      datasets: [
        {
          data: pieClasses.map(c => c.areaHa),
          backgroundColor: pieClasses.map(c => c.color),
          borderWidth: 0,
        },
      ],
    }),
    [pieClasses],
  )

  const barData = useMemo(
    () => ({
      labels: summary.classes.map(c => c.label.replace(' Vegetation', '')),
      datasets: [
        {
          label: 'Area (ha)',
          data: summary.classes.map(c => c.areaHa),
          backgroundColor: summary.classes.map(c => c.color),
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    }),
    [summary.classes],
  )

  const donutData = useMemo(
    () => ({
      labels: ['Vegetated', 'Non-Vegetated'],
      datasets: [
        {
          data: [summary.vegetatedHa, summary.nonVegetatedHa],
          backgroundColor: ['#43a047', '#d4a574'],
          borderWidth: 0,
        },
      ],
    }),
    [summary.vegetatedHa, summary.nonVegetatedHa],
  )

  const trendData = useMemo(
    () => ({
      labels: trend.map(p => formatCoverageDate(p.date)),
      datasets: [
        {
          label: 'Coverage %',
          data: trend.map(p => p.coveragePct),
          borderColor: '#66bb6a',
          backgroundColor: 'rgba(102, 187, 106, 0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: trend.length > 24 ? 0 : 3,
        },
      ],
    }),
    [trend],
  )

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: TICK_COLOR, font: CHART_FONT, boxWidth: 10 },
      },
    },
  }

  return (
    <div className="acp-ts__coverage-charts">
      <div className="acp-ts__coverage-chart-cell">
        <h4 className="acp-ts__coverage-section-title">Class Distribution</h4>
        <div className="acp-ts__coverage-chart-box">
          <Pie
            data={pieData}
            options={{
              ...baseOptions,
              plugins: { ...baseOptions.plugins, legend: { position: 'bottom' as const, labels: { color: TICK_COLOR, font: CHART_FONT, boxWidth: 10 } } },
            }}
          />
        </div>
      </div>
      <div className="acp-ts__coverage-chart-cell">
        <h4 className="acp-ts__coverage-section-title">Area by Class</h4>
        <div className="acp-ts__coverage-chart-box">
          <Bar
            data={barData}
            options={{
              indexAxis: 'y' as const,
              ...baseOptions,
              scales: {
                x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: CHART_FONT } },
                y: { grid: { display: false }, ticks: { color: TICK_COLOR, font: CHART_FONT } },
              },
              plugins: { legend: { display: false } },
            }}
          />
        </div>
      </div>
      <div className="acp-ts__coverage-chart-cell">
        <h4 className="acp-ts__coverage-section-title">Vegetated vs Non-Vegetated</h4>
        <div className="acp-ts__coverage-chart-box">
          <Doughnut
            data={donutData}
            options={{
              ...baseOptions,
              cutout: '62%',
              plugins: { legend: { position: 'bottom' as const, labels: { color: TICK_COLOR, font: CHART_FONT } } },
            }}
          />
        </div>
      </div>
      {trend.length >= 2 ? (
        <div className="acp-ts__coverage-chart-cell acp-ts__coverage-chart-cell--wide">
          <h4 className="acp-ts__coverage-section-title">Coverage Trend</h4>
          <div className="acp-ts__coverage-chart-box acp-ts__coverage-chart-box--tall">
            <Line
              data={trendData}
              options={{
                ...baseOptions,
                scales: {
                  x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: CHART_FONT, maxRotation: 45 } },
                  y: {
                    min: 0,
                    max: 100,
                    grid: { color: GRID_COLOR },
                    ticks: { color: TICK_COLOR, font: CHART_FONT, callback: (v: string | number) => `${v}%` },
                  },
                },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
