import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import { geometryBBox } from '../hydroWatershed/terrainTiles'
import type { HydroLegend } from '../hydroWatershed/hydroEngine'
import {
  compositeHydroMapSnapshot,
  fetchHydroBasemapForExtent,
  resolveHydroSnapshotExtent,
  type HydroReportMapMarker,
} from '../hydroWatershed/hydroReportMapSnapshots'
import {
  WELL_SITE_DATA_QUALITY_NOTES,
  WELL_SITE_METHODOLOGY_NOTES,
  buildWellSiteExecutive,
  buildWellSiteFinalRecommendation,
  buildWellSiteRecommendations,
} from './wellSiteReportExecutive'
import {
  wellPointToReportRow,
  type BuildWellSiteReportInput,
  type WellSiteReportMapSnapshot,
  type WellSiteReportPayload,
} from './wellSiteReportTypes'

function centroidLabel(geometry: GeoJSON.Geometry): string {
  const bbox = geometryBBox(geometry)
  if (!bbox) return '—'
  const lat = ((bbox.north + bbox.south) / 2).toFixed(5)
  const lng = ((bbox.east + bbox.west) / 2).toFixed(5)
  return `${lat}°, ${lng}°`
}

function suitabilityLegend(source?: HydroLegend): HydroLegend {
  const swatches =
    source?.swatches?.length && source.swatches.length >= 2
      ? source.swatches
      : [
          { color: '#d73027', label: '' },
          { color: '#fc8d59', label: '' },
          { color: '#fee08b', label: '' },
          { color: '#d9ef8b', label: '' },
          { color: '#91cf60', label: '' },
          { color: '#1a9850', label: '' },
        ]
  return {
    title: 'Drilling suitability',
    kind: 'gradient',
    swatches,
    minLabel: source?.minLabel || 'Low',
    maxLabel: source?.maxLabel || 'High',
    note: source?.note || 'Suitability index 0–100 (heatmap)',
  }
}

function markerColorForScore(score: number): string {
  if (score >= 80) return '#14532d'
  if (score >= 65) return '#1e3a8a'
  if (score >= 50) return '#b45309'
  return '#7f1d1d'
}

export async function buildWellSiteReportPayload(
  input: BuildWellSiteReportInput,
): Promise<WellSiteReportPayload> {
  const areaHa = geodesicAreaM2(input.geometry) / 10000
  const result = input.result
  const wells = result.points.map(wellPointToReportRow)
  const bestScore = wells.reduce((m, w) => Math.max(m, w.score), 0)
  const meanScore = wells.length
    ? Math.round((wells.reduce((a, w) => a + w.score, 0) / wells.length) * 10) / 10
    : 0
  const resolutionLabel =
    result.stats.find(s => /resolut/i.test(s.label))?.value ??
    result.stats.find(s => /m\/px|metres|meters/i.test(s.value))?.value ??
    '—'
  const meanSlope =
    result.stats.find(s => /slope/i.test(s.label))?.value ??
    (wells.length
      ? `${(wells.reduce((a, w) => a + w.slope_pc, 0) / wells.length).toFixed(1)}%`
      : '—')

  const snapshotExtent = resolveHydroSnapshotExtent(
    input.geometry,
    result.raster.coordinates ?? null,
  )
  if (!snapshotExtent) {
    throw new Error('Could not resolve map extent for the well-site AOI.')
  }

  const heatLegend = suitabilityLegend(result.raster.legend)
  const markers: HydroReportMapMarker[] = result.points.map(p => ({
    lng: p.lng,
    lat: p.lat,
    label: String(p.rank),
    color: markerColorForScore(p.score),
  }))

  const mapSpecs: Array<{
    key: string
    title: string
    subtitle: string
    useHeat?: boolean
    markers?: HydroReportMapMarker[]
    legend?: HydroLegend
    layerOpacity?: number
  }> = [
    {
      key: 'aoi',
      title: 'AOI Overview',
      subtitle: `${input.aoiName} · ${areaHa.toFixed(2)} ha · Esri World Imagery`,
    },
    {
      key: 'heat',
      title: 'Drilling Suitability Heatmap',
      subtitle: 'DEM-derived suitability · Low → High · basemap + legend key',
      useHeat: true,
      legend: heatLegend,
      layerOpacity: 0.94,
    },
    {
      key: 'sites',
      title: 'Recommended Well Sites',
      subtitle: `${wells.length} ranked drilling locations on suitability surface`,
      useHeat: true,
      markers,
      legend: heatLegend,
      layerOpacity: 0.88,
    },
  ]

  input.onProgress?.(0, mapSpecs.length, 'Basemap…')
  const basemapDataUrl = await fetchHydroBasemapForExtent(snapshotExtent)
  const maps: WellSiteReportMapSnapshot[] = []

  for (let i = 0; i < mapSpecs.length; i += 1) {
    const spec = mapSpecs[i]!
    input.onProgress?.(i, mapSpecs.length, spec.title)
    let imageBase64: string | null = null
    let note: string | undefined
    try {
      imageBase64 = await compositeHydroMapSnapshot({
        geometry: input.geometry,
        title: spec.title,
        subtitle: spec.subtitle,
        extent: snapshotExtent,
        basemapDataUrl,
        layerDataUrl: spec.useHeat ? result.raster.dataUrl : undefined,
        rasterCoordinates: spec.useHeat ? result.raster.coordinates : undefined,
        markers: spec.markers,
        layerOpacity: spec.layerOpacity,
        legend: spec.legend,
      })
    } catch {
      note = 'Map snapshot unavailable for this layer.'
    }
    maps.push({
      title: spec.title,
      subtitle: spec.subtitle,
      imageBase64,
      note,
    })
  }
  input.onProgress?.(mapSpecs.length, mapSpecs.length, 'Charts & narrative…')

  const executive = buildWellSiteExecutive({
    aoiName: input.aoiName,
    areaHa,
    wells,
    bestScore,
    meanScore,
    resolutionLabel,
  })

  return {
    projectName: input.projectName?.trim() || 'AgroCloud Well Site Recommendation (Hydro-AI)',
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy?.trim() || 'AgroCloud',
    aoiName: input.aoiName,
    areaHa,
    centroidLabel: centroidLabel(input.geometry),
    siteCount: wells.length,
    bestScore,
    meanScore,
    meanSlope,
    resolutionLabel,
    stats: result.stats,
    wells,
    maps,
    executive,
    recommendations: buildWellSiteRecommendations({
      wells,
      aoiName: input.aoiName,
      areaHa,
    }),
    finalRecommendation: buildWellSiteFinalRecommendation({
      wells,
      aoiName: input.aoiName,
    }),
    methodologyNotes: WELL_SITE_METHODOLOGY_NOTES,
    dataQualityNotes: WELL_SITE_DATA_QUALITY_NOTES,
  }
}
