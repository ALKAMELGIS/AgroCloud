import type { HydroStepId } from './hydroEngine'
import type { BuildHydroReportInput, HydroReportExecutive, HydroReportTable } from './hydroReportTypes'

function findStatLike(result: HydroStepResult | null | undefined, needle: string): string | null {
  if (!result) return null
  const row = result.stats.find(s => s.label.toLowerCase().includes(needle.toLowerCase()))
  return row?.value ?? null
}

function dominantSlopeClass(rows: Array<{ class: string; pct: number }>): string {
  if (!rows.length) return 'Unknown'
  return rows.reduce((a, b) => (b.pct > a.pct ? b : a)).class
}

export function buildHydroExecutiveSummary(input: {
  aoiName: string
  areaHa: number
  demResolution: string
  steps: BuildHydroReportInput['steps']
  slopeClasses?: Array<{ class: string; pct: number }>
  floodRiskStats?: Array<{ label: string; value: string }>
  wetlandPct?: number
}): HydroReportExecutive {
  const dem = input.steps.dem?.result
  const slope = input.steps.slope?.result
  const streams = input.steps.streams?.result
  const watershed = input.steps.watershed?.result
  const flow = input.steps['flow-accum']?.result

  const minElev = findStatLike(dem, 'min') ?? '—'
  const maxElev = findStatLike(dem, 'max') ?? '—'
  const relief = findStatLike(dem, 'relief') ?? '—'
  const meanSlope = findStatLike(slope, 'mean') ?? '—'
  const maxSlope = findStatLike(slope, 'max') ?? '—'
  const basinArea = findStatLike(watershed, 'basin') ?? '—'
  const streamLen = findStatLike(streams, 'length') ?? '—'
  const streamSeg = findStatLike(streams, 'segment') ?? '—'
  const maxOrder = findStatLike(streams, 'strahler') ?? findStatLike(streams, 'order') ?? '—'
  const maxFlow = findStatLike(flow, 'contributing') ?? '—'
  const domSlope = input.slopeClasses?.length ? dominantSlopeClass(input.slopeClasses) : '—'

  const highRisk =
    input.floodRiskStats?.find(s => s.label.toLowerCase().includes('high'))?.value ?? '—'
  const criticalRisk =
    input.floodRiskStats?.find(s => s.label.toLowerCase().includes('critical'))?.value ?? '—'
  const wetlandPct = input.wetlandPct != null ? `${input.wetlandPct.toFixed(1)}%` : '—'

  const projectOverview = [
    `This Hydro Watershed & Flood Risk Assessment Report presents a terrain-hydrology analysis of ${input.aoiName} (${input.areaHa.toFixed(2)} ha).`,
    `The study uses open Terrarium DEM terrain tiles (${input.demResolution}) processed entirely within GeoSyntra's Hydro Watershed Workflow.`,
    'Outputs include elevation, slope, aspect, flow direction, flow accumulation, stream network extraction, watershed delineation, flood-risk screening, and wetland-potential mapping.',
  ].join(' ')

  const terrainSummary = [
    `Elevation ranges from ${minElev} to ${maxElev} with ${relief} of relief.`,
    `Mean slope is ${meanSlope} (maximum ${maxSlope}); the dominant slope class is ${domSlope}.`,
    'Terrain characteristics indicate the topographic setting governing surface runoff, infiltration, and erosion potential within the AOI.',
  ].join(' ')

  const hydrologicalSummary = [
    `The delineated watershed covers ${basinArea}.`,
    `The extracted stream network comprises ${streamSeg} segments totalling ${streamLen}, with a maximum Strahler order of ${maxOrder}.`,
    `Peak flow accumulation reaches ${maxFlow} contributing cells, identifying primary drainage pathways and recharge zones.`,
  ].join(' ')

  const floodRiskSummary = [
    `Flood-risk screening (derived from slope and flow-accumulation proxies) indicates ${highRisk} of the AOI as high-risk and ${criticalRisk} as critical-risk zones.`,
    'These areas correspond to low-gradient zones receiving concentrated upstream flow and should be prioritised for field verification, hydraulic modelling, and flood mitigation planning.',
  ].join(' ')

  const wetlandSummary = [
    `Wetland-potential analysis identifies approximately ${wetlandPct} of the AOI as gently sloping, high-accumulation saturated zones.`,
    'These areas may indicate natural wetlands, riparian buffers, or seasonally inundated depressions suitable for conservation or restoration assessment.',
  ].join(' ')

  const conclusion = [
    `Overall, ${input.aoiName} exhibits ${domSlope.toLowerCase()} terrain with structured drainage toward the watershed outlet.`,
    'The hydrographic network and accumulation patterns support standard distributed hydrology workflows including HEC-HMS / SWAT pre-processing.',
    'Flood-risk and wetland layers provide actionable screening for engineering design, environmental impact assessment, and land-use planning.',
    'Field validation of outlet locations, channel geometry, and flood-prone areas is recommended before detailed hydraulic design.',
  ].join(' ')

  const narrative = [projectOverview, terrainSummary, hydrologicalSummary, floodRiskSummary, wetlandSummary, conclusion].join(
    '\n\n',
  )

  return {
    projectOverview,
    terrainSummary,
    hydrologicalSummary,
    floodRiskSummary,
    wetlandSummary,
    conclusion,
    narrative,
  }
}

export function buildHydroReportTables(input: {
  steps: BuildHydroReportInput['steps']
  areaHa: number
  slopeRows?: Array<{ class: string; range: string; areaHa: number; pct: number }>
  floodRiskStats?: Array<{ label: string; value: string }>
  wetlandStats?: Array<{ label: string; value: string }>
}): HydroReportTable[] {
  const tables: HydroReportTable[] = []

  const dem = input.steps.dem?.result
  if (dem) {
    tables.push({
      title: 'DEM Statistics',
      headers: ['Metric', 'Value'],
      rows: dem.stats.map(s => [s.label, s.value]),
    })
  }

  if (input.slopeRows?.length) {
    tables.push({
      title: 'Slope Classification',
      headers: ['Class', 'Range', 'Area (ha)', 'Percentage'],
      rows: input.slopeRows.map(r => [r.class, r.range, r.areaHa.toFixed(2), `${r.pct.toFixed(1)}%`]),
    })
  }

  const watershed = input.steps.watershed?.result
  if (watershed) {
    tables.push({
      title: 'Watershed Summary',
      headers: ['Metric', 'Value'],
      rows: watershed.stats.map(s => [s.label, s.value]),
    })
  }

  const streams = input.steps.streams?.result
  if (streams) {
    tables.push({
      title: 'Stream Network Summary',
      headers: ['Metric', 'Value'],
      rows: streams.stats.map(s => [s.label, s.value]),
    })
  }

  if (input.floodRiskStats?.length) {
    tables.push({
      title: 'Flood Risk Classification',
      headers: ['Risk Class', 'Coverage'],
      rows: input.floodRiskStats.map(s => [s.label, s.value]),
    })
  }

  if (input.wetlandStats?.length) {
    tables.push({
      title: 'Wetland Statistics',
      headers: ['Metric', 'Value'],
      rows: input.wetlandStats.map(s => [s.label, s.value]),
    })
  }

  tables.push({
    title: 'Study Area Summary',
    headers: ['Metric', 'Value'],
    rows: [['AOI area', `${input.areaHa.toFixed(2)} ha`]],
  })

  return tables
}

export function hydroRecommendations(steps: BuildHydroReportInput['steps']): string[] {
  const recs = [
    'Validate watershed outlet and pour-point location against field surveys and topographic maps.',
    'Cross-check flood-risk screening results with historical flood records and hydraulic models where available.',
    'Protect high flow-accumulation corridors and wetland-potential zones in land-use and conservation planning.',
    'Use exported GeoTIFF layers for integration with HEC-HMS, SWAT, or QGIS distributed hydrology workflows.',
  ]
  if (!steps.streams?.result) {
    recs.unshift('Run Stream Network extraction to complete the hydrological connectivity analysis.')
  }
  if (!steps.watershed?.result) {
    recs.unshift('Delineate the watershed to quantify basin area and outlet characteristics.')
  }
  return recs
}

export function completedHydroSteps(steps: BuildHydroReportInput['steps']): HydroStepId[] {
  return (Object.keys(steps) as HydroStepId[]).filter(id => steps[id]?.status === 'done' && steps[id]?.result)
}
