import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import { geometryBBox } from '../hydroWatershed/terrainTiles'
import {
  compositeHydroMapSnapshot,
  fetchHydroBasemapForExtent,
  resolveHydroSnapshotExtent,
  type HydroRasterCoordinates,
} from '../hydroWatershed/hydroReportMapSnapshots'
import type { HydroLegend } from '../hydroWatershed/hydroEngine'
import {
  buildCropClassificationExecutive,
  buildCropRecommendations,
  CROP_DATA_QUALITY_NOTES,
  CROP_METHODOLOGY_NOTES,
  enrichCropClassRows,
} from './cropClassificationReportExecutive'
import type {
  BuildCropClassificationReportInput,
  CropClassificationReportPayload,
  CropReportMapSnapshot,
} from './cropClassificationReportTypes'

function centroidLabel(geometry: GeoJSON.Geometry): string {
  const bbox = geometryBBox(geometry)
  if (!bbox) return '—'
  const lat = ((bbox.north + bbox.south) / 2).toFixed(5)
  const lng = ((bbox.east + bbox.west) / 2).toFixed(5)
  return `${lat}°, ${lng}°`
}

function boundsToCorners(bounds: [number, number, number, number]): HydroRasterCoordinates {
  const [w, s, e, n] = bounds
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

async function fetchImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || '') || null)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function dataUrlToBase64(dataUrl: string | null): string | null {
  if (!dataUrl) return null
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : null
}

function cropLegend(classes: Array<{ name: string; color: string }>): HydroLegend {
  return {
    title: 'Crop Type',
    kind: 'classes',
    swatches: classes.slice(0, 12).map(c => ({ color: c.color, label: c.name })),
  }
}

export async function buildCropClassificationReportPayload(
  input: BuildCropClassificationReportInput,
): Promise<CropClassificationReportPayload> {
  const areaHa = geodesicAreaM2(input.geometry) / 10000
  const classes = enrichCropClassRows(input.result, areaHa)
  const result = input.result
  const predictionUrl = result.prediction?.url ?? null
  const bounds = result.prediction?.bounds ?? null

  const snapshotExtent = resolveHydroSnapshotExtent(
    input.geometry,
    bounds ? boundsToCorners(bounds) : null,
  )
  if (!snapshotExtent) {
    throw new Error('Could not resolve map extent for the crop AOI.')
  }

  const mapSpecs: Array<{
    key: string
    title: string
    subtitle: string
    layerUrl?: string | null
    useBounds?: boolean
    legend?: HydroLegend
  }> = [
    {
      key: 'aoi',
      title: 'AOI Overview',
      subtitle: `${input.aoiName} · ${areaHa.toFixed(2)} ha`,
    },
    {
      key: 't1',
      title: 'Scene T1 — Early season',
      subtitle: result.dates?.[0] ?? input.season.start,
      layerUrl: result.scenes?.t1,
    },
    {
      key: 't2',
      title: 'Scene T2 — Mid season',
      subtitle: result.dates?.[Math.floor((result.dates?.length || 1) / 2)] ?? 'Mid window',
      layerUrl: result.scenes?.t2,
    },
    {
      key: 't3',
      title: 'Scene T3 — Late season',
      subtitle: result.dates?.[Math.max(0, (result.dates?.length || 1) - 1)] ?? input.season.end,
      layerUrl: result.scenes?.t3,
    },
    {
      key: 'crop',
      title: 'Crop Type Classification',
      subtitle: result.engine === 'prithvi' ? 'Prithvi inference' : 'Country engine',
      layerUrl: predictionUrl,
      useBounds: true,
      legend: cropLegend(classes),
    },
  ]

  input.onProgress?.(0, mapSpecs.length, 'Basemap…')
  const basemapDataUrl = await fetchHydroBasemapForExtent(snapshotExtent)
  const maps: CropReportMapSnapshot[] = []

  for (let i = 0; i < mapSpecs.length; i += 1) {
    const spec = mapSpecs[i]!
    input.onProgress?.(i, mapSpecs.length, spec.title)
    let imageBase64: string | null = null
    let note: string | undefined
    try {
      const layerDataUrl = spec.layerUrl ? await fetchImageAsDataUrl(spec.layerUrl) : null
      if (spec.key === 'aoi' || layerDataUrl || basemapDataUrl) {
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: layerDataUrl ?? undefined,
          rasterCoordinates:
            spec.useBounds && bounds ? boundsToCorners(bounds) : undefined,
          legend: spec.legend,
        })
      }
      if (!imageBase64 && layerDataUrl) {
        imageBase64 = dataUrlToBase64(layerDataUrl)
        note = 'Preview tile (not georeferenced composite).'
      }
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

  const executive = buildCropClassificationExecutive({
    aoiName: input.aoiName,
    areaHa,
    seasonStart: input.season.start,
    seasonEnd: input.season.end,
    result,
    classes,
  })

  return {
    projectName: input.projectName?.trim() || 'AgroCloud Crop Classification Intelligence',
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy?.trim() || 'AgroCloud',
    aoiName: input.aoiName,
    areaHa,
    centroidLabel: centroidLabel(input.geometry),
    seasonStart: input.season.start,
    seasonEnd: input.season.end,
    engine:
      result.engine === 'prithvi'
        ? 'Prithvi'
        : result.engine === 'country'
          ? 'Country phenology'
          : 'Crop classification',
    countryLabel: result.country?.name
      ? `${result.country.name}${result.country.code ? ` (${result.country.code})` : ''}`
      : '—',
    resolutionLabel: result.resolutionMeters
      ? `${result.resolutionMeters} m/px${result.superResolution === 'ai' ? ' · AI SR' : ''}`
      : '—',
    cloudLabel:
      typeof result.maxSceneCloud === 'number' ? `≤ ${Math.ceil(result.maxSceneCloud)}%` : '—',
    datesLabel: (result.dates ?? []).filter(Boolean).join(' · ') || `${input.season.start} → ${input.season.end}`,
    classes,
    maps,
    executive,
    recommendations: buildCropRecommendations({
      classes,
      areaHa,
      seasonStart: input.season.start,
      seasonEnd: input.season.end,
      countryName: result.country?.name,
    }),
    methodologyNotes: CROP_METHODOLOGY_NOTES,
    dataQualityNotes: CROP_DATA_QUALITY_NOTES,
  }
}
