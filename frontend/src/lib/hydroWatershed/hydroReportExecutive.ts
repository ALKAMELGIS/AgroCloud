import type { HydroStepId, HydroStepResult } from './hydroEngine'
import type { HydroAreaClassRow } from './hydroReportDerivedLayers'
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

function fmtHa(ha: number): string {
  return `${ha.toFixed(2)} ha`
}

function fmtPct(pct: number): string {
  return `${pct.toFixed(1)}%`
}

function pctOfTotal(partHa: number, totalHa: number): number {
  if (!(totalHa > 0) || !Number.isFinite(partHa)) return 0
  return (partHa / totalHa) * 100
}

/** Parse values like `1.49 km²`, `12.5 ha`, or `33.8%`. */
function parseNumericValue(raw: string | null | undefined): { value: number; unit: 'km2' | 'ha' | 'pct' | 'none' } | null {
  if (!raw) return null
  const m = raw.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(km²|km2|ha|%)?/i)
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value)) return null
  const u = (m[2] || '').toLowerCase()
  if (u === 'km²' || u === 'km2') return { value, unit: 'km2' }
  if (u === 'ha') return { value, unit: 'ha' }
  if (u === '%') return { value, unit: 'pct' }
  return { value, unit: 'none' }
}

function toHa(parsed: { value: number; unit: 'km2' | 'ha' | 'pct' | 'none' }, aoiHa: number): number | null {
  if (parsed.unit === 'km2') return parsed.value * 100
  if (parsed.unit === 'ha') return parsed.value
  if (parsed.unit === 'pct') return (parsed.value / 100) * aoiHa
  return null
}

/** Extract `Drainage Basin 1 · 0.42 km²` → { name, areaHa }. */
function parseBasinLegendLabel(label: string, aoiHa: number): { name: string; areaHa: number } | null {
  const parts = label.split('·').map(s => s.trim())
  if (parts.length < 2) return null
  const parsed = parseNumericValue(parts[1])
  if (!parsed) return null
  const areaHa = toHa(parsed, aoiHa)
  if (areaHa == null) return null
  return { name: parts[0] || label, areaHa }
}

export function buildHydroExecutiveSummary(input: {
  aoiName: string
  areaHa: number
  demResolution: string
  steps: BuildHydroReportInput['steps']
  slopeClasses?: Array<{ class: string; pct: number }>
  floodRiskStats?: Array<{ label: string; value: string }>
  floodRiskRows?: HydroAreaClassRow[]
  wetlandPct?: number
  wetlandAreaHa?: number
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
  const primaryArea = findStatLike(watershed, 'Primary area') ?? '—'
  const primaryCount = findStatLike(watershed, 'Primary basins') ?? '—'
  const largestBasin = findStatLike(watershed, 'Largest basin') ?? '—'
  const streamLen = findStatLike(streams, 'length') ?? '—'
  const streamSeg = findStatLike(streams, 'segment') ?? '—'
  const maxOrder = findStatLike(streams, 'strahler') ?? findStatLike(streams, 'order') ?? '—'
  const maxFlow = findStatLike(flow, 'contributing') ?? '—'
  const domSlope = input.slopeClasses?.length ? dominantSlopeClass(input.slopeClasses) : '—'

  const highRow = input.floodRiskRows?.find(r => r.label.toLowerCase().includes('high'))
  const criticalRow = input.floodRiskRows?.find(r => r.label.toLowerCase().includes('critical'))
  const highRisk =
    highRow != null
      ? `${fmtHa(highRow.areaHa)} (${fmtPct(highRow.pct)})`
      : (input.floodRiskStats?.find(s => s.label.toLowerCase().includes('high'))?.value ?? '—')
  const criticalRisk =
    criticalRow != null
      ? `${fmtHa(criticalRow.areaHa)} (${fmtPct(criticalRow.pct)})`
      : (input.floodRiskStats?.find(s => s.label.toLowerCase().includes('critical'))?.value ?? '—')
  const wetlandPct = input.wetlandPct != null ? fmtPct(input.wetlandPct) : '—'
  const wetlandArea =
    input.wetlandAreaHa != null ? fmtHa(input.wetlandAreaHa) : '—'

  const projectOverview = [
    `This Hydro Watershed & Flood Risk Assessment Report presents a terrain-hydrology analysis of ${input.aoiName} (${fmtHa(input.areaHa)}).`,
    `The study uses open Terrarium DEM terrain tiles (${input.demResolution}) processed entirely within AgroCloud's Hydro Watershed Workflow.`,
    'Outputs include elevation, slope, aspect, flow direction, flow accumulation, stream network extraction, watershed delineation, flood-risk screening, and wetland-potential mapping.',
  ].join(' ')

  const terrainSummary = [
    `Elevation ranges from ${minElev} to ${maxElev} with ${relief} of relief.`,
    `Mean slope is ${meanSlope} (maximum ${maxSlope}); the dominant slope class is ${domSlope}.`,
    'Terrain characteristics indicate the topographic setting governing surface runoff, infiltration, and erosion potential within the AOI.',
  ].join(' ')

  const hydrologicalSummary = [
    `Watershed delineation identifies ${primaryCount} primary basins covering ${primaryArea} (largest ${largestBasin}), each shown with a coordinated colour on the map and legend.`,
    `The extracted stream network comprises ${streamSeg} segments totalling ${streamLen}, with a maximum Strahler order of ${maxOrder}.`,
    `Peak flow accumulation reaches ${maxFlow} contributing cells, identifying primary drainage pathways and recharge zones.`,
  ].join(' ')

  const floodRiskSummary = [
    `Flood-risk screening (derived from slope and flow-accumulation proxies) indicates ${highRisk} as high-risk and ${criticalRisk} as critical-risk within the ${fmtHa(input.areaHa)} AOI.`,
    'These areas correspond to low-gradient zones receiving concentrated upstream flow and should be prioritised for field verification, hydraulic modelling, and flood mitigation planning.',
  ].join(' ')

  const wetlandSummary = [
    `Wetland-potential analysis identifies approximately ${wetlandArea} (${wetlandPct} of the AOI) as gently sloping, high-accumulation saturated zones.`,
    'These areas may indicate natural wetlands, riparian buffers, or seasonally inundated depressions suitable for conservation or restoration assessment.',
  ].join(' ')

  const conclusion = [
    `Overall, ${input.aoiName} exhibits ${domSlope.toLowerCase()} terrain with structured drainage into multiple primary watershed basins.`,
    'The hydrographic network and accumulation patterns support standard distributed hydrology workflows including HEC-HMS / SWAT pre-processing.',
    'Flood-risk and wetland layers provide actionable screening for engineering design, environmental impact assessment, and land-use planning.',
    'Field validation of basin outlets, channel geometry, and flood-prone areas is recommended before detailed hydraulic design.',
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
  floodRiskRows?: HydroAreaClassRow[]
  floodRiskStats?: Array<{ label: string; value: string }>
  wetlandRows?: HydroAreaClassRow[]
  wetlandStats?: Array<{ label: string; value: string }>
  wetlandAreaHa?: number
  wetlandPct?: number
}): HydroReportTable[] {
  const tables: HydroReportTable[] = []
  const aoiHa = input.areaHa

  tables.push({
    title: 'Study Area Summary',
    headers: ['Metric', 'Value', 'Notes'],
    rows: [
      ['Total AOI area', fmtHa(aoiHa), 'Reference total for all % columns'],
      ['AOI area (km²)', `${(aoiHa / 100).toFixed(3)} km²`, '1 km² = 100 ha'],
    ],
  })

  const dem = input.steps.dem?.result
  if (dem) {
    tables.push({
      title: 'DEM Statistics',
      headers: ['Metric', 'Value'],
      rows: dem.stats.map(s => [s.label, s.value]),
    })
  }

  if (input.slopeRows?.length) {
    const slopeSumHa = input.slopeRows.reduce((s, r) => s + r.areaHa, 0)
    tables.push({
      title: 'Slope Classification',
      headers: ['Class', 'Range', 'Area (ha)', '% of AOI'],
      rows: [
        ...input.slopeRows.map(r => [
          r.class,
          r.range,
          r.areaHa.toFixed(2),
          fmtPct(pctOfTotal(r.areaHa, aoiHa) || r.pct),
        ]),
        ['Total', '—', slopeSumHa.toFixed(2), fmtPct(pctOfTotal(slopeSumHa, aoiHa) || 100)],
      ],
    })
  }

  const watershed = input.steps.watershed?.result
  if (watershed) {
    const primaryParsed = parseNumericValue(findStatLike(watershed, 'Primary area'))
    const largestParsed = parseNumericValue(findStatLike(watershed, 'Largest basin'))
    const primaryHa = primaryParsed ? toHa(primaryParsed, aoiHa) : null
    const largestHa = largestParsed ? toHa(largestParsed, aoiHa) : null
    const rows: string[][] = watershed.stats.map(s => [s.label, s.value])
    if (primaryHa != null) {
      rows.push(['Primary basins area (ha)', fmtHa(primaryHa)])
      rows.push(['Primary basins share of AOI', fmtPct(pctOfTotal(primaryHa, aoiHa))])
    }
    if (largestHa != null) {
      rows.push(['Largest basin (ha)', fmtHa(largestHa)])
      rows.push(['Largest basin share of AOI', fmtPct(pctOfTotal(largestHa, aoiHa))])
    }
    tables.push({
      title: 'Watershed Summary',
      headers: ['Metric', 'Value'],
      rows,
    })
  }

  const basins = input.steps.basins?.result
  if (basins?.legend?.kind === 'classes') {
    const basinRows = basins.legend.swatches
      .map(s => parseBasinLegendLabel(s.label || '', aoiHa))
      .filter((r): r is { name: string; areaHa: number } => !!r && !r.name.toLowerCase().includes('other'))
    if (basinRows.length) {
      const sumHa = basinRows.reduce((s, r) => s + r.areaHa, 0)
      tables.push({
        title: 'Drainage Basins — Area & Share of AOI',
        headers: ['Basin', 'Area (ha)', 'Area (km²)', '% of AOI'],
        rows: [
          ...basinRows.map(r => [
            r.name,
            r.areaHa.toFixed(2),
            (r.areaHa / 100).toFixed(3),
            fmtPct(pctOfTotal(r.areaHa, aoiHa)),
          ]),
          [
            'Total primary basins',
            sumHa.toFixed(2),
            (sumHa / 100).toFixed(3),
            fmtPct(pctOfTotal(sumHa, aoiHa)),
          ],
        ],
      })
    }
  } else if (basins) {
    tables.push({
      title: 'Drainage Basins Summary',
      headers: ['Metric', 'Value'],
      rows: basins.stats.map(s => [s.label, s.value]),
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

  const floodRows =
    input.floodRiskRows ??
    input.floodRiskStats?.map(s => {
      const parsed = parseNumericValue(s.value)
      const pct = parsed?.unit === 'pct' ? parsed.value : 0
      return { label: s.label, pct, areaHa: (pct / 100) * aoiHa }
    })
  if (floodRows?.length) {
    const sumHa = floodRows.reduce((s, r) => s + r.areaHa, 0)
    const elevated = floodRows.filter(r => {
      const l = r.label.toLowerCase()
      return l.includes('high') || l.includes('critical')
    })
    const elevatedHa = elevated.reduce((s, r) => s + r.areaHa, 0)
    tables.push({
      title: 'Flood Risk Classification',
      headers: ['Risk Class', 'Area (ha)', 'Area (km²)', '% of AOI'],
      rows: [
        ...floodRows.map(r => [
          r.label,
          r.areaHa.toFixed(2),
          (r.areaHa / 100).toFixed(3),
          fmtPct(r.pct),
        ]),
        ['Total (all classes)', sumHa.toFixed(2), (sumHa / 100).toFixed(3), fmtPct(pctOfTotal(sumHa, aoiHa) || 100)],
        [
          'Affected (High + Critical)',
          elevatedHa.toFixed(2),
          (elevatedHa / 100).toFixed(3),
          fmtPct(pctOfTotal(elevatedHa, aoiHa)),
        ],
      ],
    })
  }

  const wetlandRows =
    input.wetlandRows ??
    (input.wetlandPct != null
      ? [
          {
            label: 'Wetland / saturated zone',
            pct: input.wetlandPct,
            areaHa: input.wetlandAreaHa ?? (input.wetlandPct / 100) * aoiHa,
          },
          {
            label: 'Non-wetland',
            pct: Math.max(0, 100 - input.wetlandPct),
            areaHa: aoiHa - (input.wetlandAreaHa ?? (input.wetlandPct / 100) * aoiHa),
          },
        ]
      : undefined)
  if (wetlandRows?.length) {
    const sumHa = wetlandRows.reduce((s, r) => s + r.areaHa, 0)
    tables.push({
      title: 'Wetland Statistics',
      headers: ['Class', 'Area (ha)', 'Area (km²)', '% of AOI'],
      rows: [
        ...wetlandRows.map(r => [
          r.label,
          r.areaHa.toFixed(2),
          (r.areaHa / 100).toFixed(3),
          fmtPct(r.pct),
        ]),
        ['Total', sumHa.toFixed(2), (sumHa / 100).toFixed(3), fmtPct(pctOfTotal(sumHa, aoiHa) || 100)],
      ],
    })
  } else if (input.wetlandStats?.length) {
    tables.push({
      title: 'Wetland Statistics',
      headers: ['Metric', 'Value'],
      rows: input.wetlandStats.map(s => [s.label, s.value]),
    })
  }

  return tables
}

export function hydroRecommendations(steps: BuildHydroReportInput['steps']): string[] {
  const recs = [
    'Validate primary basin outlets against field surveys and topographic maps.',
    'Cross-check flood-risk screening results with historical flood records and hydraulic models where available.',
    'Protect high flow-accumulation corridors and wetland-potential zones in land-use and conservation planning.',
    'Use exported GeoTIFF layers for integration with HEC-HMS, SWAT, or QGIS distributed hydrology workflows.',
  ]
  if (!steps.streams?.result) {
    recs.unshift('Run Stream Network extraction to complete the hydrological connectivity analysis.')
  }
  if (!steps.watershed?.result) {
    recs.unshift('Delineate primary watershed basins to quantify drainage areas and colour-coded basin extents.')
  }
  return recs
}

export function completedHydroSteps(steps: BuildHydroReportInput['steps']): HydroStepId[] {
  return (Object.keys(steps) as HydroStepId[]).filter(id => steps[id]?.status === 'done' && steps[id]?.result)
}
