import type { FloodMonitoringResult } from '../floodMonitoringPipeline'
import type { SarFloodReportExecutive, SarFloodReportTable } from './sarFloodReportTypes'

export function buildSarFloodExecutiveSummary(input: {
  aoiName: string
  areaHa: number
  result: FloodMonitoringResult
  depthStats?: Array<{ label: string; value: string }>
  riskStats?: Array<{ label: string; value: string }>
}): SarFloodReportExecutive {
  const { stats, classStats } = input.result
  const modeLabel =
    stats.mode === 'change-detection'
      ? `multi-temporal change detection (${stats.preDate ?? '—'} → ${stats.postDate ?? '—'})`
      : `single-date water classification (${stats.postDate ?? '—'})`

  const newFlood = classStats.find(c => /new/i.test(c.name))
  const persistent = classStats.find(c => /persistent|open water/i.test(c.name))
  const highDepth =
    input.depthStats?.find(s => /deep|extreme/i.test(s.label))?.value ?? '—'
  const highRisk =
    input.riskStats?.find(s => /high|extreme/i.test(s.label))?.value ?? '—'

  const projectOverview = [
    `This SAR Flood Intelligence Report presents a satellite-based flood assessment for ${input.aoiName} (${input.areaHa.toFixed(2)} ha).`,
    'Sentinel-1 C-band SAR (VV) imagery was analysed with AQOI-constrained water classification and optional pre/post change detection.',
    'The report is intended for engineering screening, disaster management briefing, insurance triage, and environmental assessment — not as a substitute for calibrated hydraulic models.',
  ].join(' ')

  const detectionSummary = [
    `Analysis mode: ${modeLabel} using a VV backscatter threshold of ${stats.thresholdDb} dB (grid ${stats.resolution}).`,
    `Post-event open water covers approximately ${stats.postWaterHa.toFixed(2)} ha; pre-event baseline water was ${stats.preWaterHa.toFixed(2)} ha.`,
    newFlood
      ? `New flooding accounts for about ${newFlood.pct.toFixed(1)}% of the AOI (${newFlood.areaHa.toFixed(2)} ha).`
      : 'Composition classes summarise open water versus dry land within the AOI.',
  ].join(' ')

  const inundationSummary = [
    `Mapped inundation (flood extent) covers ${stats.floodedHa.toFixed(2)} ha — ${stats.pctInundated.toFixed(1)}% of the study area.`,
    persistent
      ? `Persistent or open water occupies ${persistent.areaHa.toFixed(2)} ha (${permanentPct(classStats)}).`
      : 'Water persistence is summarized in the class composition table.',
    'Flood boundaries were vectorised from the SAR water mask for GIS interchange and map atlas presentation.',
  ].join(' ')

  const depthRiskSummary = [
    `Flood depth proxy classes (distance-to-shore and optional DEM relief) indicate deeper screening zones occupying ${highDepth} of the inundated area where reported.`,
    `Flood risk screening flags ${highRisk} of the AOI as high or extreme, combining inundation persistence with topographic setting.`,
    'Depth and risk layers are screening products — validate with gauge data, field surveys, and 1D/2D hydraulic models before engineering design.',
  ].join(' ')

  const conclusion = [
    `${input.aoiName} shows ${stats.pctInundated.toFixed(1)}% SAR-mapped inundation for the selected event window.`,
    'Priority actions include verifying new flooding against optical imagery where available, protecting critical low-lying assets, and scheduling follow-up Sentinel-1 passes.',
    'Re-run the analysis with refined thresholds or alternative orbit/polarization selections if under- or over-detection is suspected.',
  ].join(' ')

  return {
    projectOverview,
    detectionSummary,
    inundationSummary,
    depthRiskSummary,
    conclusion,
    narrative: [projectOverview, detectionSummary, inundationSummary, depthRiskSummary, conclusion].join(
      '\n\n',
    ),
  }
}

function permanentPct(classStats: FloodMonitoringResult['classStats']): string {
  const row = classStats.find(c => /persistent|open water/i.test(c.name))
  return row ? `${row.pct.toFixed(1)}%` : '—'
}

export function buildSarFloodReportTables(input: {
  areaHa: number
  result: FloodMonitoringResult
  depthStats?: Array<{ label: string; value: string }>
  riskStats?: Array<{ label: string; value: string }>
}): SarFloodReportTable[] {
  const { stats, classStats } = input.result
  const tables: SarFloodReportTable[] = [
    {
      title: 'Flood Summary Statistics',
      headers: ['Metric', 'Value'],
      rows: [
        ['AOI area', `${input.areaHa.toFixed(2)} ha`],
        ['Flooded area', `${stats.floodedHa.toFixed(2)} ha`],
        ['Percent inundated', `${stats.pctInundated.toFixed(2)}%`],
        ['Pre-event water', `${stats.preWaterHa.toFixed(2)} ha`],
        ['Post-event water', `${stats.postWaterHa.toFixed(2)} ha`],
        ['Water increase', `${(stats.postWaterHa - stats.preWaterHa).toFixed(2)} ha`],
        ['Mode', stats.mode],
        ['Pre date', stats.preDate ?? '—'],
        ['Post date', stats.postDate ?? '—'],
        ['VV threshold', `${stats.thresholdDb} dB`],
        ['Grid resolution', stats.resolution],
        ['Post scene ID', stats.postItemId ?? '—'],
        ['Pre scene ID', stats.preItemId ?? '—'],
        ['Polarization', stats.polarization ?? 'VV'],
      ],
    },
    {
      title: 'Inundation Class Composition',
      headers: ['Class', 'Area (ha)', 'Percentage'],
      rows: classStats.map(c => [c.name, c.areaHa.toFixed(2), `${c.pct.toFixed(1)}%`]),
    },
  ]

  if (input.depthStats?.length) {
    tables.push({
      title: 'Flood Depth Proxy Classes',
      headers: ['Class', 'Value'],
      rows: input.depthStats.map(s => [s.label, s.value]),
    })
  }
  if (input.riskStats?.length) {
    tables.push({
      title: 'Flood Risk Screening Classes',
      headers: ['Class', 'Value'],
      rows: input.riskStats.map(s => [s.label, s.value]),
    })
  }

  return tables
}

export function sarFloodRecommendations(result: FloodMonitoringResult): string[] {
  const pct = result.stats.pctInundated
  const recs = [
    'Validate SAR flood extent against high-resolution optical imagery and field reports where available.',
    'Protect low-lying roads, utilities, and settlements intersecting the flood boundary until water recedes.',
    'Schedule follow-up Sentinel-1 acquisitions (ascending and descending) to track persistence and recession.',
    'Use flood boundaries as an emergency planning layer — not as finished floodplain zoning.',
  ]
  if (pct >= 25) {
    recs.unshift(
      'High inundation fraction detected — escalate emergency response coordination and evacuation readiness.',
    )
  } else if (pct < 5) {
    recs.push(
      'Low inundation fraction — review threshold sensitivity and confirm AOI covers the known floodplain.',
    )
  }
  if (result.stats.mode === 'single-date') {
    recs.push(
      'Re-run with a pre-event baseline date to separate permanent water from new flooding.',
    )
  }
  return recs
}

export const SAR_FLOOD_METHODOLOGY = [
  'Sentinel-1 GRD VV backscatter (Planetary Computer / CDSE when available) is sampled over the AOI.',
  'Pixels with VV ≤ configured threshold (default −17 dB) are classified as open water.',
  'Change detection compares pre- and post-event water masks to label new flooding, persistent water, and recession.',
  'Flood rasters are encoded as PNG overlays; boundaries are vectorised via marching-squares contours.',
  'Depth and risk maps are screening proxies (inundation distance and optional DEM relief), not calibrated hydraulic depths.',
].join(' ')

export const SAR_FLOOD_DATA_QUALITY = [
  'SAR flood detection can confuse smooth dry surfaces (roads, bare soil) with water; shadow and layover affect detection in steep terrain.',
  'Speckle, incidence-angle variation, and orbit differences between scenes may bias change products.',
  'Results are screening-grade for decision support; engineering design requires hydraulic modelling and survey validation.',
].join(' ')
