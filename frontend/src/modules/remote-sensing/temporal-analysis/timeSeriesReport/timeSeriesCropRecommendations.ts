import type { TimeSeriesWeatherBlock } from './timeSeriesWeatherTimeline'
import type { TimeSeriesLayerStatistics } from './timeSeriesReportTypes'

export type CropRecommendationInput = {
  centroidLat: number | null
  centroidLng: number | null
  areaHa: number
  weather: TimeSeriesWeatherBlock | null
  statistics: TimeSeriesLayerStatistics[]
  /** Mean salinity-related index if available (SAL_NDSI / SI / SSI). */
  salinityMean: number | null
  ndviMean: number | null
  ndmiMean: number | null
}

export type CropRecommendationResult = {
  climateBand: string
  soilMoistureReading: string
  salinityReading: string
  crops: Array<{ name: string; rationale: string; seasonHint: string }>
  practiceNotes: string[]
  bullets: string[]
}

function climateBandFromLat(lat: number | null, avgTemp: number | null): string {
  if (lat == null || !Number.isFinite(lat)) {
    if (avgTemp != null && avgTemp >= 28) return 'Hot tropical / arid-adjacent'
    if (avgTemp != null && avgTemp >= 18) return 'Warm temperate / subtropical'
    if (avgTemp != null && avgTemp >= 8) return 'Cool temperate'
    return 'Unclassified climate (insufficient location/temperature data)'
  }
  const abs = Math.abs(lat)
  if (abs < 15) return 'Tropical / equatorial belt'
  if (abs < 25) return 'Subtropical / hot semi-arid belt'
  if (abs < 35) return 'Warm temperate / Mediterranean–steppe transition'
  if (abs < 50) return 'Cool temperate belt'
  return 'Boreal / high-latitude belt'
}

function salinityReading(mean: number | null): string {
  if (mean == null || !Number.isFinite(mean)) return 'Salinity index not selected — treat soil EC as unknown'
  if (mean < 0.1) return 'Low salinity spectral signal'
  if (mean < 0.25) return 'Moderate salinity spectral signal'
  return 'Elevated salinity spectral signal — favour salt-tolerant crops'
}

function moistureReading(ndmi: number | null, rainfallMm: number | null): string {
  if (ndmi != null) {
    if (ndmi < 0.1) return 'Constrained canopy moisture (irrigation-dependent)'
    if (ndmi < 0.25) return 'Moderate canopy moisture'
    return 'Adequate canopy moisture signal'
  }
  if (rainfallMm != null) {
    if (rainfallMm < 50) return 'Low period rainfall — irrigation planned systems preferred'
    if (rainfallMm < 200) return 'Moderate period rainfall'
    return 'Higher period rainfall — drainage and flood risk matter'
  }
  return 'Moisture regime uncertain'
}

type CropRule = {
  name: string
  minLat: number
  maxLat: number
  minTemp: number
  maxTemp: number
  preferLowSalinity?: boolean
  preferIrrigated?: boolean
  seasonHint: string
  rationale: string
}

const CROP_RULES: CropRule[] = [
  {
    name: 'Date palm / oasis orchard systems',
    minLat: 15,
    maxLat: 35,
    minTemp: 18,
    maxTemp: 40,
    preferIrrigated: true,
    seasonHint: 'Perennial; align irrigation with peak summer evaporative demand',
    rationale: 'Hot subtropical belt with irrigation suits deep-rooted orchard/palm systems.',
  },
  {
    name: 'Wheat (winter cereal)',
    minLat: 20,
    maxLat: 50,
    minTemp: 8,
    maxTemp: 28,
    seasonHint: 'Sow in cool season; harvest before peak summer heat',
    rationale: 'Warm–cool temperate belts with seasonal cool months favour wheat.',
  },
  {
    name: 'Sorghum / millet (drought-tolerant cereals)',
    minLat: 5,
    maxLat: 35,
    minTemp: 20,
    maxTemp: 38,
    preferIrrigated: false,
    seasonHint: 'Warm-season planting after reliable soil temperature rise',
    rationale: 'Hot, rainfall-limited settings fit drought-resilient C4 cereals.',
  },
  {
    name: 'Alfalfa / fodder (irrigated)',
    minLat: 15,
    maxLat: 45,
    minTemp: 12,
    maxTemp: 35,
    preferIrrigated: true,
    seasonHint: 'Multi-cut forage under managed irrigation',
    rationale: 'Responds well where NDVI recovery is irrigation-driven and soils allow lucerne.',
  },
  {
    name: 'Tomato / vegetable horticulture (protected or irrigated)',
    minLat: 10,
    maxLat: 40,
    minTemp: 15,
    maxTemp: 32,
    preferLowSalinity: true,
    preferIrrigated: true,
    seasonHint: 'Schedule transplants outside extreme heat waves; mulch for soil moisture',
    rationale: 'Requires controllable water and lower salinity for fruit quality.',
  },
  {
    name: 'Barley (salinity-tolerant cereal)',
    minLat: 20,
    maxLat: 50,
    minTemp: 5,
    maxTemp: 28,
    seasonHint: 'Cool-season cereal; useful on mildly saline fields',
    rationale: 'Better salinity tolerance than wheat for screening saline AOIs.',
  },
  {
    name: 'Sesame / oilseed (warm season)',
    minLat: 5,
    maxLat: 30,
    minTemp: 22,
    maxTemp: 38,
    seasonHint: 'Warm-season oilseed after rains or with supplemental irrigation',
    rationale: 'Fits hot belts with moderate water and lighter soils.',
  },
  {
    name: 'Citrus (orchard, frost-free)',
    minLat: 20,
    maxLat: 38,
    minTemp: 14,
    maxTemp: 32,
    preferLowSalinity: true,
    preferIrrigated: true,
    seasonHint: 'Perennial; protect young trees from salinity and water stress',
    rationale: 'Subtropical frost-free zones with irrigation and low-moderate salinity.',
  },
]

export function buildCropPlantingRecommendations(input: CropRecommendationInput): CropRecommendationResult {
  const avgTemp = input.weather?.summary?.avgTemperatureC ?? null
  const rain = input.weather?.summary?.totalRainfallMm ?? null
  const lat = input.centroidLat
  const absLat = lat != null && Number.isFinite(lat) ? Math.abs(lat) : 25
  const temp = avgTemp ?? 24
  const moisture = moistureReading(input.ndmiMean, rain)
  const salinity = salinityReading(input.salinityMean)
  const climateBand = climateBandFromLat(lat, avgTemp)
  const highSalinity = input.salinityMean != null && input.salinityMean >= 0.25
  const lowMoisture =
    (input.ndmiMean != null && input.ndmiMean < 0.12) || (rain != null && rain < 80)

  const scored = CROP_RULES.map(rule => {
    let score = 0
    if (absLat >= rule.minLat && absLat <= rule.maxLat) score += 2
    if (temp >= rule.minTemp && temp <= rule.maxTemp) score += 2
    if (rule.preferIrrigated && lowMoisture) score += 1
    if (rule.preferLowSalinity && !highSalinity) score += 1
    if (rule.preferLowSalinity && highSalinity) score -= 2
    if (!rule.preferLowSalinity && highSalinity && /barley|sorghum|millet/i.test(rule.name)) score += 2
    if (input.ndviMean != null && input.ndviMean < 0.25 && /sorghum|millet|barley/i.test(rule.name))
      score += 1
    if (input.ndviMean != null && input.ndviMean > 0.45 && /tomato|citrus|alfalfa|date/i.test(rule.name))
      score += 1
    return { rule, score }
  })
    .filter(s => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const crops =
    scored.length > 0
      ? scored.map(s => ({
          name: s.rule.name,
          rationale: s.rule.rationale,
          seasonHint: s.rule.seasonHint,
        }))
      : [
          {
            name: 'Field validation crops (soil test first)',
            rationale:
              'Location/climate signals are incomplete — run soil EC, texture, and topography survey before committing crop choice.',
            seasonHint: 'Pilot strip trials in the next suitable season',
          },
        ]

  const practiceNotes = [
    `Climate band (AOI lat ${lat != null ? lat.toFixed(2) : 'n/a'}° · avg temp ${avgTemp != null ? `${avgTemp.toFixed(1)}°C` : 'n/a'}): ${climateBand}.`,
    `Moisture & rainfall: ${moisture}${rain != null ? ` · period rainfall ≈ ${rain.toFixed(0)} mm` : ''}.`,
    `Soil salinity spectral screening: ${salinity}. Confirm with lab EC, texture, and profile sampling.`,
    input.areaHa > 0
      ? `Geography · AOI ≈ ${input.areaHa.toFixed(1)} ha at ${lat != null && input.centroidLng != null ? `${lat.toFixed(3)}°, ${input.centroidLng.toFixed(3)}°` : 'local coordinates'} — match irrigation blocks to drainage and micro-topography.`
      : 'Confirm AOI boundary accuracy before fertilizer/irrigation zoning.',
    'Topography: cross-check DEM/slope — avoid stagnant lowspots for salinity-sensitive vegetables; reserve them for tolerant cereals or fodder.',
    'Natural factors: align sowing with heat/rain windows from the weather timeline; wind exposure and ET peaks raise irrigation demand.',
    highSalinity
      ? 'Elevate leaching fraction and gypsum/organic amendments after lab EC confirmation.'
      : 'Maintain soil organic matter to buffer mild salinity and improve structure.',
    lowMoisture
      ? 'Prioritise deficit-irrigation scheduling using NDMI regeneration after waterings.'
      : 'Watch excess water / fungal risk when NDVI rises with wet periods.',
  ]

  const bullets = [
    ...crops.map(
      c =>
        `Crop option — ${c.name}: ${c.rationale} Season: ${c.seasonHint}.`,
    ),
    ...practiceNotes.slice(0, 6),
  ]

  return {
    climateBand,
    soilMoistureReading: moisture,
    salinityReading: salinity,
    crops,
    practiceNotes,
    bullets,
  }
}

export function resolveSalinityMeanFromStats(
  statistics: TimeSeriesLayerStatistics[],
): number | null {
  const ids = ['SAL_NDSI', 'SI', 'SSI', 'NDSI']
  for (const id of ids) {
    const row = statistics.find(s => s.layerId.toUpperCase() === id)
    if (row?.mean != null && Number.isFinite(row.mean)) return row.mean
  }
  return null
}
