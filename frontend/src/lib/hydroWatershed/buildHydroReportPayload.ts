import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import { geometryBBox } from './terrainTiles'
import type { HydroStepId, HydroStepResult } from './hydroEngine'
import {
  buildAspectDerivedLayer,
  buildAoiMask,
  buildFloodRiskDerivedLayer,
  buildFlowDirectionDerivedLayer,
  buildSlopeClassificationTable,
  buildWetlandDerivedLayer,
  demLikeFromBand,
} from './hydroReportDerivedLayers'
import {
  buildHydroExecutiveSummary,
  buildHydroReportTables,
  completedHydroSteps,
  hydroRecommendations,
} from './hydroReportExecutive'
import { compositeHydroMapSnapshot, fetchHydroBasemapForExtent, resolveHydroSnapshotExtent } from './hydroReportMapSnapshots'
import type {
  BuildHydroReportInput,
  HydroReportPayload,
  HydroReportSnapshot,
} from './hydroReportTypes'
import { HYDRO_REPORT_MAP_SPECS, legendToText } from './hydroReportTypes'

function stepResult(input: BuildHydroReportInput, id: HydroStepId): HydroStepResult | null {
  const st = input.steps[id]
  return st?.status === 'done' ? st.result : null
}

function centroidLabel(geometry: GeoJSON.Geometry): string {
  const bbox = geometryBBox(geometry)
  if (!bbox) return '—'
  const lat = ((bbox.north + bbox.south) / 2).toFixed(5)
  const lng = ((bbox.east + bbox.west) / 2).toFixed(5)
  return `${lat}°N, ${lng}°E`
}

export async function buildHydroReportPayload(input: BuildHydroReportInput): Promise<HydroReportPayload> {
  const now = new Date().toISOString()
  const areaHa = geodesicAreaM2(input.geometry) / 10000
  const demResult = stepResult(input, 'dem')
  const demResolution = statOf(demResult, 'resolution') ?? '—'
  const masterRasterCoords =
    demResult?.kind === 'raster' ? demResult.coordinates : null
  const snapshotExtent = resolveHydroSnapshotExtent(input.geometry, masterRasterCoords)
  if (!snapshotExtent) {
    throw new Error('Could not resolve map extent for the AOI.')
  }
  const basemapDataUrl = await fetchHydroBasemapForExtent(snapshotExtent)

  const elevBand = demResult?.kind === 'raster' ? demResult.band : undefined
  const slopeResult = stepResult(input, 'slope')
  const slopeBand = slopeResult?.kind === 'raster' ? slopeResult.band : undefined
  const flowResult = stepResult(input, 'flow-accum')
  const flowBand = flowResult?.kind === 'raster' ? flowResult.band : undefined

  let aoiMask: Uint8Array | null = null
  if (elevBand) {
    const demLike = demLikeFromBand(elevBand)
    aoiMask = buildAoiMask(demLike as never, input.geometry)
  }

  let slopeRows: ReturnType<typeof buildSlopeClassificationTable> = []
  if (slopeBand) {
    const cs = slopeBand.width > 0 ? Math.sqrt(geodesicAreaM2(input.geometry) / (slopeBand.width * slopeBand.height)) : 30
    slopeRows = buildSlopeClassificationTable(slopeBand, aoiMask, cs * cs)
  }

  let floodRiskStats: Array<{ label: string; value: string }> = []
  let wetlandStats: Array<{ label: string; value: string }> = []
  let wetlandPct: number | undefined

  const derivedCache: Record<string, { dataUrl: string; legend?: HydroStepResult['legend']; stats?: Array<{ label: string; value: string }> }> =
    {}

  if (elevBand) {
    const aspect = buildAspectDerivedLayer(elevBand, aoiMask)
    derivedCache.aspect = { dataUrl: aspect.dataUrl, legend: aspect.legend }
    const flowDir = buildFlowDirectionDerivedLayer(elevBand, aoiMask)
    derivedCache['flow-direction'] = { dataUrl: flowDir.dataUrl, legend: flowDir.legend }
  }
  if (slopeBand && flowBand) {
    const flood = buildFloodRiskDerivedLayer(slopeBand, flowBand, aoiMask)
    derivedCache['flood-risk'] = { dataUrl: flood.dataUrl, legend: flood.legend, stats: flood.stats }
    floodRiskStats = flood.stats
    const wetland = buildWetlandDerivedLayer(slopeBand, flowBand, aoiMask)
    derivedCache.wetland = { dataUrl: wetland.dataUrl, legend: wetland.legend, stats: wetland.stats }
    wetlandStats = wetland.stats
    const pctRow = wetland.stats.find(s => s.label.toLowerCase().includes('coverage'))
    if (pctRow) wetlandPct = parseFloat(pctRow.value)
  }

  const snapshots: HydroReportSnapshot[] = []
  const total = HYDRO_REPORT_MAP_SPECS.length
  let done = 0

  for (const spec of HYDRO_REPORT_MAP_SPECS) {
    input.onProgress?.(done, total, spec.title)
    let imageBase64: string | null = null
    let legend: HydroStepResult['legend'] | undefined
    let stats: Array<{ label: string; value: string }> = []
    let available = false
    let note: string | undefined

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
    } else if (spec.kind === 'step' && spec.stepId) {
      const result = stepResult(input, spec.stepId)
      if (result) {
        available = true
        legend = result.legend
        stats = result.stats
        const layerDataUrl = result.kind === 'raster' ? result.dataUrl : null
        const rasterCoordinates = result.kind === 'raster' ? result.coordinates : masterRasterCoords
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl,
          rasterCoordinates,
          vectorResult: result.kind === 'vector' ? result : null,
          legend: result.legend,
        })
      } else {
        note = 'Run this analysis step in the Hydro Watershed tool to include this map.'
      }
    } else if (spec.kind === 'derived' && spec.derived) {
      const derived = derivedCache[spec.derived]
      if (derived) {
        available = true
        legend = derived.legend
        stats = derived.stats ?? []
        imageBase64 = await compositeHydroMapSnapshot({
          geometry: input.geometry,
          title: spec.title,
          subtitle: spec.subtitle,
          extent: snapshotExtent,
          basemapDataUrl,
          layerDataUrl: derived.dataUrl,
          rasterCoordinates: masterRasterCoords,
          legend: derived.legend,
        })
      } else {
        note = 'Requires DEM, Slope, and Flow Accumulation results.'
      }
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

  const executive = buildHydroExecutiveSummary({
    aoiName: input.aoiName,
    areaHa,
    demResolution,
    steps: input.steps,
    slopeClasses: slopeRows.map(r => ({ class: r.class, pct: r.pct })),
    floodRiskStats,
    wetlandPct,
  })

  return {
    projectName: input.projectName ?? 'AgroCloud Hydro Intelligence',
    generatedBy: input.generatedBy ?? 'AgroCloud',
    generatedAt: now,
    aoiName: input.aoiName,
    areaHa,
    crs: 'EPSG:4326 (WGS 84) · analysis grids EPSG:3857',
    demSource: 'Mapzen Terrarium terrain tiles (AWS open elevation)',
    demResolution,
    analysisDate: now.slice(0, 10),
    centroidLabel: centroidLabel(input.geometry),
    executive,
    snapshots,
    tables: buildHydroReportTables({
      steps: input.steps,
      areaHa,
      slopeRows,
      floodRiskStats,
      wetlandStats,
    }),
    completedSteps: completedHydroSteps(input.steps),
    recommendations: hydroRecommendations(input.steps),
    dataQualityNotes:
      'Terrain from Terrarium DEM tiles; hydrology derived client-side via D8 flow routing. Flood-risk and wetland layers are screening proxies from slope + flow accumulation — validate with field data and hydraulic models for engineering design.',
  }
}

function statOf(result: HydroStepResult | null, needle: string): string | null {
  if (!result) return null
  const row = result.stats.find(s => s.label.toLowerCase().includes(needle.toLowerCase()))
  return row?.value ?? null
}
