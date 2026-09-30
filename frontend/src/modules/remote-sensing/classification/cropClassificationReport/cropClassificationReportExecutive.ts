import type { CropClassificationResult } from '../siPrithviCropPipeline'
import type { CropReportClassRow } from './cropClassificationReportTypes'

export function enrichCropClassRows(
  result: CropClassificationResult,
  aoiAreaHa: number,
): CropReportClassRow[] {
  const legend = result.legend ?? []
  const colorByName = new Map(legend.map(l => [l.name.toLowerCase(), l.color]))
  const stats = [...(result.classStats ?? [])].filter(s => Number.isFinite(s.pct) && s.pct > 0)
  stats.sort((a, b) => b.pct - a.pct)
  return stats.map((s, i) => {
    const areaHa =
      s.areaHa != null && Number.isFinite(s.areaHa)
        ? s.areaHa
        : aoiAreaHa > 0
          ? (aoiAreaHa * s.pct) / 100
          : null
    return {
      id: String(s.id ?? s.name ?? i),
      name: s.name,
      color: colorByName.get(s.name.toLowerCase()) ?? '#94a3b8',
      pct: Math.round(s.pct * 10) / 10,
      areaHa: areaHa != null ? Math.round(areaHa * 100) / 100 : null,
    }
  })
}

export function buildCropClassificationExecutive(input: {
  aoiName: string
  areaHa: number
  seasonStart: string
  seasonEnd: string
  result: CropClassificationResult
  classes: CropReportClassRow[]
}): CropClassificationReportPayloadExecutive {
  const { aoiName, areaHa, seasonStart, seasonEnd, result, classes } = input
  const top = classes.slice(0, 3)
  const topLine = top.length
    ? top.map(c => `${c.name} (${c.pct}%${c.areaHa != null ? `, ${c.areaHa.toFixed(2)} ha` : ''})`).join('; ')
    : 'no dominant class resolved'
  const cropland = classes.filter(c => !/water|wetland|developed|barren|forest|natural vegetation/i.test(c.name))
  const croplandPct = cropland.reduce((a, c) => a + c.pct, 0)
  const engine =
    result.engine === 'prithvi'
      ? 'Prithvi multi-temporal deep learning'
      : result.engine === 'country'
        ? 'country spectral–phenology engine'
        : 'crop classification engine'

  const overview = [
    `This Crop Classification Intelligence Report summarises satellite-based crop type mapping for ${aoiName} (${areaHa.toFixed(2)} ha).`,
    `The analysis covers the growing season window ${seasonStart} to ${seasonEnd}.`,
    result.country?.name
      ? `Detected country context: ${result.country.name}${result.country.code ? ` (${result.country.code})` : ''}.`
      : 'Country context was inferred from the AOI footprint where available.',
  ].join(' ')

  const composition = [
    `Classified composition is dominated by ${topLine}.`,
    cropland.length
      ? `Crop-related classes account for approximately ${croplandPct.toFixed(1)}% of the AOI footprint.`
      : 'Composition is summarised in the class table and pie chart.',
    `In total, ${classes.length} land-cover / crop classes were detected above the reporting threshold.`,
  ].join(' ')

  const methodology = [
    `Processing used the ${engine} with multi-temporal Sentinel / HLS true-colour scenes (T1–T3) and a classified Crop Type prediction layer.`,
    result.resolutionMeters
      ? `Output ground sampling distance is approximately ${result.resolutionMeters} m/px${result.superResolution === 'ai' ? ' (AI super-resolution)' : ''}.`
      : 'Spatial resolution follows the inference raster delivered by the pipeline.',
    typeof result.maxSceneCloud === 'number'
      ? `Scene selection constrained cloud cover to ≤ ${Math.ceil(result.maxSceneCloud)}% where reported.`
      : 'Cloud-screened scenes were preferred for phenology sampling.',
  ].join(' ')

  const conclusion = [
    `${aoiName} shows a mixed agricultural mosaic for ${seasonStart}–${seasonEnd}, with leading share(s): ${top.map(c => c.name).join(', ') || '—'}.`,
    'Use the class table, pie chart, and map atlas for acreage planning, insurance screening, and agronomic follow-up.',
    'Validate critical fields with ground truth before contractual or regulatory decisions.',
  ].join(' ')

  return {
    overview,
    composition,
    methodology,
    conclusion,
    narrative: [overview, composition, methodology, conclusion].join('\n\n'),
  }
}

type CropClassificationReportPayloadExecutive = {
  overview: string
  composition: string
  methodology: string
  conclusion: string
  narrative: string
}

export function buildCropRecommendations(input: {
  classes: CropReportClassRow[]
  areaHa: number
  seasonStart: string
  seasonEnd: string
  countryName?: string | null
}): string[] {
  const { classes, areaHa, seasonStart, seasonEnd, countryName } = input
  const top = classes[0]
  const water = classes.find(c => /water|wetland/i.test(c.name))
  const fallow = classes.find(c => /fallow|idle/i.test(c.name))
  const forest = classes.find(c => /forest|natural vegetation/i.test(c.name))
  const out: string[] = [
    `Prioritise field verification for the dominant class${top ? ` (${top.name}, ${top.pct}%)` : ''} across the ${areaHa.toFixed(1)} ha AOI.`,
    `Align agronomic calendars and input logistics with the mapped season window ${seasonStart} → ${seasonEnd}${countryName ? ` in ${countryName}` : ''}.`,
  ]
  if (water && water.pct >= 5) {
    out.push(
      `Account for open water / wetlands (~${water.pct}%) when planning irrigation, drainage, and buffer setbacks.`,
    )
  }
  if (fallow && fallow.pct >= 8) {
    out.push(
      `Fallow / idle cropland (~${fallow.pct}%) may suit cover crops, rotational planning, or soil-moisture recovery measures.`,
    )
  }
  if (forest && forest.pct >= 10) {
    out.push(
      `Natural vegetation / forest share (~${forest.pct}%) should be conserved; exclude from intensive cropping recommendations.`,
    )
  }
  out.push(
    'Cross-check Crop Type maps with NDVI/NDMI time series and recent optical scenes before seeding or harvesting decisions.',
  )
  out.push(
    'Re-run classification after major phenological transitions or cloud-free constellation updates to refresh acreage estimates.',
  )
  out.push(
    'Treat class percentages as screening intelligence — not a substitute for cadastral survey or certified crop declaration.',
  )
  return out
}

export const CROP_METHODOLOGY_NOTES = [
  'AOI → multi-temporal Sentinel / HLS acquisition → preprocessing → Prithvi or country phenology inference → classified Crop Type raster.',
  'Class shares are derived from prediction pixel counts within the AOI; area (ha) is scaled from AOI geodesic area when backend area is absent.',
  'T1 / T2 / T3 tiles are representative clear scenes spanning the selected season for visual QA.',
]

export const CROP_DATA_QUALITY_NOTES = [
  'Cloud residual, mixed pixels, and similar spectral signatures can confuse closely related crops.',
  'Country engine and Prithvi engine may differ in class taxonomy; legend colours follow the active run.',
  'Edge pixels along AOI boundaries may be clipped; small parcels can be under-represented at coarse GSD.',
  'Super-resolution (when enabled) improves visual detail but does not create new spectral information.',
]
