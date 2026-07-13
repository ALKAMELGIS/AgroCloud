import { describe, expect, it } from 'vitest'
import { buildHydroExecutiveSummary, buildHydroReportTables } from './hydroReportExecutive'
import type { HydroStepResult } from './hydroEngine'

const demResult: HydroStepResult = {
  kind: 'raster',
  dataUrl: 'data:image/png;base64,AA',
  coordinates: [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ],
  opacity: 1,
  stats: [
    { label: 'Min elevation', value: '120 m' },
    { label: 'Max elevation', value: '340 m' },
    { label: 'Relief', value: '220 m' },
    { label: 'Resolution', value: '30 m/px' },
  ],
}

describe('hydroReportExecutive', () => {
  it('builds executive summary from workflow stats', () => {
    const exec = buildHydroExecutiveSummary({
      aoiName: 'Test Basin',
      areaHa: 450,
      demResolution: '30 m/px',
      steps: {
        dem: { status: 'done', result: demResult },
        slope: {
          status: 'done',
          result: {
            kind: 'raster',
            dataUrl: 'data:image/png;base64,AA',
            coordinates: demResult.coordinates,
            opacity: 1,
            stats: [
              { label: 'Mean slope', value: '8.2°' },
              { label: 'Max slope', value: '24.1°' },
            ],
          },
        },
      },
      slopeClasses: [
        { class: 'Gentle', pct: 42 },
        { class: 'Moderate', pct: 35 },
      ],
      floodRiskStats: [
        { label: 'High Risk', value: '12.5%' },
        { label: 'Critical Risk', value: '3.1%' },
      ],
      wetlandPct: 8.4,
    })
    expect(exec.projectOverview).toContain('Test Basin')
    expect(exec.terrainSummary).toContain('120 m')
    expect(exec.floodRiskSummary).toContain('12.5%')
    expect(exec.wetlandSummary).toContain('8.4%')
    expect(exec.conclusion.length).toBeGreaterThan(40)
  })

  it('builds GIS tables from completed steps', () => {
    const tables = buildHydroReportTables({
      steps: { dem: { status: 'done', result: demResult } },
      areaHa: 120,
      slopeRows: [{ class: 'Flat', range: '0° – 2°', areaHa: 10, pct: 20 }],
    })
    expect(tables.some(t => t.title === 'DEM Statistics')).toBe(true)
    expect(tables.some(t => t.title === 'Slope Classification')).toBe(true)
  })
})
