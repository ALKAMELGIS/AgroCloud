import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import { geometryBBox } from '../hydroWatershed/terrainTiles'
import {
  compositeHydroMapSnapshot,
  fetchHydroBasemapForExtent,
  resolveHydroSnapshotExtent,
} from '../hydroWatershed/hydroReportMapSnapshots'
import {
  buildFloodDepthProxyLayer,
  buildFloodRiskProxyLayer,
  changeRasterLegend,
  floodExtentLegend,
  floodVectorToOutlineResult,
  inundationClassLegend,
} from './sarFloodReportDerived'
import {
  buildSarFloodExecutiveSummary,
  buildSarFloodReportTables,
  SAR_FLOOD_DATA_QUALITY,
  SAR_FLOOD_METHODOLOGY,
  sarFloodRecommendations,
} from './sarFloodReportExecutive'
import type {
  BuildSarFloodReportInput,
  SarFloodReportPayload,
  SarFloodReportSnapshot,
} from './sarFloodReportTypes'
import {
  floodBoundsToCorners,
  legendToText,
  SAR_FLOOD_REPORT_MAP_SPECS,
} from './sarFloodReportTypes'

function centroidLabel(geometry: GeoJSON.Geometry): string {
  const bbox = geometryBBox(geometry)
  if (!bbox) return '—'
  const lat = ((bbox.north + bbox.south) / 2).toFixed(5)
  const lng = ((bbox.east + bbox.west) / 2).toFixed(5)
  return `${lat}°N, ${lng}°E`
}

export async function buildSarFloodReportPayload(
  input: BuildSarFloodReportInput,
): Promise<SarFloodReportPayload> {
  const now = new Date().toISOString()
  const areaHa = geodesicAreaM2(input.geometry) / 10000
  const { result } = input
  const rasterCoords = floodBoundsToCorners(result.bounds)
  const snapshotExtent = resolveHydroSnapshotExtent(input.geometry, rasterCoords)
  if (!snapshotExtent) {
    throw new Error('Could not resolve map extent for the flood AOI.')
  }

  const basemapDataUrl = await fetchHydroBasemapForExtent(snapshotExtent)
  const outline = floodVectorToOutlineResult(result.vector, result.stats.floodedHa)

  input.onProgress?.(0, SAR_FLOOD_REPORT_MAP_SPECS.length + 2, 'Building depth & risk proxies…')
  const depthLayer = await buildFloodDepthProxyLayer(
    result.flood.url,
    result.bounds,
    input.elevBand ?? null,
  )
  const riskLayer = await buildFloodRiskProxyLayer(
    result.flood.url,
    result.change.url,
    result.bounds,
  )

  const snapshots: SarFloodReportSnapshot[] = []
  const total = SAR_FLOOD_REPORT_MAP_SPECS.length
  let done = 0

  for (const spec of SAR_FLOOD_REPORT_MAP_SPECS) {
    input.onProgress?.(done, total, spec.title)
    let imageBase64: string | null = null
    let legend = undefined as ReturnType<typeof floodExtentLegend> | undefined
    let stats: Array<{ label: string; value: string }> = []
    let available = false
    let note: string | undefined

    try {
      if (spec.kind === 'aoi') {
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
        })
        available = !!imageBase64
        stats = [
          { label: 'AOI area', value: `${areaHa.toFixed(2)} ha` },
          { label: 'Centroid', value: centroidLabel(input.geometry) },
        ]
      } else if (spec.kind === 'flood-raster') {
        legend = floodExtentLegend(result.stats.floodedHa)
        stats = [
          { label: 'Flooded', value: `${result.stats.floodedHa.toFixed(2)} ha` },
          { label: 'Inundated', value: `${result.stats.pctInundated.toFixed(1)}%` },
        ]
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: result.flood.url,
          rasterCoordinates: rasterCoords,
          legend,
        })
        available = !!imageBase64
      } else if (spec.kind === 'change-raster' || spec.kind === 'classes') {
        legend =
          spec.kind === 'classes'
            ? inundationClassLegend(result.classStats)
            : changeRasterLegend()
        stats = result.classStats.map(c => ({
          label: c.name,
          value: `${c.pct.toFixed(1)}% · ${c.areaHa.toFixed(2)} ha`,
        }))
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: result.change.url,
          rasterCoordinates: rasterCoords,
          legend,
        })
        available = !!imageBase64
      } else if (spec.kind === 'boundaries') {
        legend = outline.legend
        stats = outline.stats
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          vectorResult: outline,
          legend,
        })
        available = !!imageBase64
      } else if (spec.kind === 'depth') {
        legend = depthLayer.legend
        stats = depthLayer.stats
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: depthLayer.dataUrl,
          rasterCoordinates: depthLayer.coordinates,
          legend,
        })
        available = !!imageBase64
      } else if (spec.kind === 'risk') {
        legend = riskLayer.legend
        stats = riskLayer.stats
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: riskLayer.dataUrl,
          rasterCoordinates: riskLayer.coordinates,
          legend,
        })
        available = !!imageBase64
      }
    } catch (err) {
      note = err instanceof Error ? err.message : 'Map snapshot failed'
      available = false
    }

    snapshots.push({
      id: spec.id,
      title: spec.title,
      subtitle: spec.subtitle,
      imageBase64,
      legendText: legendToText(legend),
      stats,
      available,
      note,
    })
    done += 1
    input.onProgress?.(done, total, spec.title)
  }

  const executive = buildSarFloodExecutiveSummary({
    aoiName: input.aoiName,
    areaHa,
    result,
    depthStats: depthLayer.stats,
    riskStats: riskLayer.stats,
  })

  return {
    projectName: input.projectName ?? 'AgroCloud SAR Flood Intelligence',
    generatedBy: input.generatedBy ?? 'AgroCloud',
    generatedAt: now,
    aoiName: input.aoiName,
    areaHa,
    crs: 'EPSG:4326 (WGS 84)',
    centroidLabel: centroidLabel(input.geometry),
    analysisDate: now.slice(0, 10),
    sensorLabel: result.stats.sourceLabel
      ? `Sentinel-1 C-band SAR (${result.stats.sourceLabel})`
      : 'Sentinel-1 C-band SAR',
    modality: result.stats.polarization
      ? `GRD / IW · ${result.stats.polarization}`
      : 'GRD / IW · VV (primary)',
    preDate: result.stats.preDate ?? '—',
    postDate: result.stats.postDate ?? '—',
    thresholdDb: result.stats.thresholdDb,
    mode: result.stats.mode,
    resolution: result.stats.resolution,
    executive,
    snapshots,
    tables: buildSarFloodReportTables({
      areaHa,
      result,
      depthStats: depthLayer.stats,
      riskStats: riskLayer.stats,
    }),
    recommendations: sarFloodRecommendations(result),
    dataQualityNotes: SAR_FLOOD_DATA_QUALITY,
    methodologyNotes: SAR_FLOOD_METHODOLOGY,
  }
}
