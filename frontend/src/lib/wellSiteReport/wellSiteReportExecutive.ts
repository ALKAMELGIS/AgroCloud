import type { WellSiteReportRow } from './wellSiteReportTypes'

export function buildWellSiteExecutive(input: {
  aoiName: string
  areaHa: number
  wells: WellSiteReportRow[]
  bestScore: number
  meanScore: number
  resolutionLabel: string
}): {
  overview: string
  suitability: string
  methodology: string
  conclusion: string
} {
  const { aoiName, areaHa, wells, bestScore, meanScore, resolutionLabel } = input
  const top = wells.slice(0, 3)
  const topLine = top.length
    ? top
        .map(
          w =>
            `${w.name} (rank ${w.rank}, score ${w.score}%, elev ${w.elev_m.toFixed(0)} m, slope ${w.slope_pc.toFixed(1)}%)`,
        )
        .join('; ')
    : 'no ranked sites resolved'

  const overview = [
    `This Well Site Recommendation (Hydro-AI) report summarises drilling suitability screening for ${aoiName} (${areaHa.toFixed(2)} ha).`,
    `${wells.length} candidate well location${wells.length === 1 ? '' : 's'} were ranked from a DEM-derived suitability heatmap.`,
    `Best suitability score is ${bestScore}% (mean of recommended sites ${meanScore}%).`,
  ].join(' ')

  const suitability = [
    `Leading recommendations: ${topLine}.`,
    'Scores combine terrain favourability (moderate elevation, gentle slope), flow accumulation / wetness proxies, and estimated hydrogeology–soil–recharge attributes.',
    'The heatmap uses a continuous Low→High ramp so high-suitability corridors are visually distinct against the satellite basemap.',
  ].join(' ')

  const methodology = [
    'Workflow: AOI → DEM (elevation) → slope & flow accumulation → cell-level suitability → local maxima picking → ranked drilling sites with attribute table.',
    resolutionLabel !== '—'
      ? `Analysis grid resolution: ${resolutionLabel}.`
      : 'Spatial resolution follows the DEM tile grid used for the run.',
    'Hydrogeology, soil permeability, and recharge fields are physically motivated terrain proxies when external soil/climate layers are unavailable; confidence and risk flags indicate estimate reliability.',
  ].join(' ')

  const conclusion = [
    `${aoiName} yields ${wells.length} prioritised drilling site${wells.length === 1 ? '' : 's'} for follow-up hydrogeological investigation.`,
    'Use the map atlas (basemap + suitability heatmap + ranked markers), score charts, and attribute tables for field targeting.',
    'Hydro-AI does not certify that groundwater is present at any coordinate; scores express relative success probability from terrain and hydrologic indicators.',
    'Validate top sites with Electrical Resistivity Tomography (ERT), a pumping test, field geological study, and local permitting before any drilling decision.',
  ].join(' ')

  return { overview, suitability, methodology, conclusion }
}

/** Professional final recommendation: probability framing + pre-drill verification. */
export function buildWellSiteFinalRecommendation(input: {
  wells: WellSiteReportRow[]
  aoiName: string
}): {
  interpretation: string
  preDrillingIntro: string
  preDrillingSteps: string[]
} {
  const { wells, aoiName } = input
  const best = wells[0]
  const sitePhrase = best
    ? `the highest-ranked locations (led by ${best.name}, suitability ${best.score}%)`
    : 'the highest-ranked locations'
  return {
    interpretation: [
      'Final recommendation — interpretation of results:',
      'The system does not state that “water is present here with 100% certainty.”',
      `Based on terrain morphology, the Digital Elevation Model (DEM), slope, inferred aquifer type, and hydrological indicators, ${sitePhrase} within ${aoiName} are assessed as having the highest probability of drilling success.`,
      'Suitability scores are relative screening intelligence within the AOI and must be confirmed on the ground before any construction decision.',
    ].join(' '),
    preDrillingIntro:
      'Before actual drilling, the following professional verification steps are preferred:',
    preDrillingSteps: [
      'Electrical Resistivity Survey / Electrical Resistivity Tomography (ERT) — map subsurface resistivity structure and refine target depth.',
      'Pump Test (aquifer pumping test) — quantify sustainable yield, drawdown, and hydraulic properties at the shortlisted site.',
      'Field geological study — ground-truth lithology, structure, and hydrogeological setting with a licensed hydrogeologist.',
    ],
  }
}

export function buildWellSiteRecommendations(input: {
  wells: WellSiteReportRow[]
  aoiName: string
  areaHa: number
}): string[] {
  const { wells, aoiName, areaHa } = input
  const best = wells[0]
  const out: string[] = [
    `Prioritise field reconnaissance at the top-ranked site${best ? ` (${best.name}, score ${best.score}%)` : ''} within the ${areaHa.toFixed(1)} ha AOI (${aoiName}).`,
    'Confirm slope access, land tenure, and setbacks from surface water / infrastructure before mobilising a drill rig.',
  ]
  if (best && best.risk_lvl && /high|elevated/i.test(best.risk_lvl)) {
    out.push(
      `Site ${best.rank} carries an elevated risk flag (${best.risk_lvl}) — schedule additional hydrogeological QA before drilling.`,
    )
  }
  if (best && best.confidence && /low|moderate/i.test(best.confidence)) {
    out.push(
      `Confidence for leading attributes is ${best.confidence}; corroborate water-table and yield estimates with local well inventories.`,
    )
  }
  const steep = wells.filter(w => w.slope_pc >= 12)
  if (steep.length) {
    out.push(
      `${steep.length} recommended site(s) exceed ~12% slope — assess earthworks/access constraints and prefer gentler alternatives where scores are comparable.`,
    )
  }
  out.push(
    'Cross-check the suitability heatmap against stream networks and known aquifer units; avoid drilling solely on a single high pixel.',
  )
  out.push(
    'Export GeoJSON/CSV of recommended wells into the field GIS and re-run Hydro-AI after DEM or AOI updates.',
  )
  out.push(
    'Treat Hydro-AI scores as screening intelligence — not a substitute for licensed hydrogeological design or regulatory approval.',
  )
  return out
}

export const WELL_SITE_METHODOLOGY_NOTES = [
  'AOI → DEM tiles → Priority-Flood filled elevation → Horn slope → D8 flow accumulation → suitability scoring → ranked local maxima.',
  'Suitability heatmap is a continuous 0–100 index (Low→High RdYlGn ramp) clipped to the AOI.',
  'Recommended wells carry Shapefile-style attributes (terrain, aquifer proxies, soil, recharge, score, confidence, risk).',
  'Report maps composite Esri World Imagery basemap, georeferenced heatmap, AOI outline, north arrow, scale bar, and legend key.',
]

export const WELL_SITE_DATA_QUALITY_NOTES = [
  'DEM voids, coarse GSD, or small AOIs can bias slope and flow accumulation near edges.',
  'Aquifer type, water-table depth, yield, and soil fields are terrain-derived proxies unless external layers were supplied.',
  'Heatmap colours are relative within the AOI; absolute groundwater potential requires ground truth.',
  'Hydro-AI never asserts 100% presence of groundwater at a coordinate — rankings express relative success probability only.',
  'Rank order can change if top-N, steepness threshold, or DEM source changes between runs.',
]
