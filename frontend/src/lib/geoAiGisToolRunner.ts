/**
 * Shared runner for gis_* agent tools and MAP_ACTION gisOp fallback.
 */

import type { FeatureCollection } from 'geojson'
import type { GeoAiLiveMapState } from './geoAiLiveMapContext'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  parseGisDistance,
  runGisAreaTable,
  runGisBuffer,
  runGisClip,
  runGisConvexHull,
  runGisDissolve,
  runGisErase,
  runGisIntersect,
  runGisSelectByAttribute,
  runGisSelectByLocation,
  runGisUnionOrMerge,
  runGisVoronoi,
  type GisEngineResult,
} from './geoAiGisEngine'
import { resolveGisInputLayer } from './geoAiGisLayerResolve'
import { downloadGeoJsonFile } from './siLayerExport'
import { exportVectorLayer, type VectorExportFormat } from './vectorLayerExport'

export type GeoAiGisToolHost = {
  vectorLayers: GeoAiMapLayer[]
  liveMapState?: GeoAiLiveMapState | null
  addGeoJsonResultLayer?: (input: {
    name: string
    geojson: FeatureCollection
    fit?: boolean
  }) => string
}

export type GeoAiGisToolRunResult = {
  ok: boolean
  content: string
  table?: GeoExplorerDataTablePayload
  outputName?: string
  featureCount?: number
}

function applyResultLayer(host: GeoAiGisToolHost, result: GisEngineResult): GeoAiGisToolRunResult {
  if (!result.ok) {
    return { ok: false, content: result.message, outputName: result.outputName }
  }
  if (result.geojson && host.addGeoJsonResultLayer) {
    const msg = host.addGeoJsonResultLayer({
      name: result.outputName,
      geojson: result.geojson,
      fit: true,
    })
    return {
      ok: true,
      content: msg || result.message,
      outputName: result.outputName,
      featureCount: result.featureCount,
      ...(result.table ? { table: result.table } : {}),
    }
  }
  if (result.table) {
    return {
      ok: true,
      content: result.message,
      table: result.table,
      outputName: result.outputName,
      featureCount: result.featureCount,
    }
  }
  if (result.geojson && !host.addGeoJsonResultLayer) {
    return {
      ok: false,
      content: `${result.message} (map host cannot add layers in this session)`,
      outputName: result.outputName,
    }
  }
  return { ok: true, content: result.message, outputName: result.outputName, featureCount: result.featureCount }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim()
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function runGeoAiGisTool(
  tool: string,
  args: Record<string, unknown> | null | undefined,
  host: GeoAiGisToolHost,
): Promise<GeoAiGisToolRunResult> {
  const a = args && typeof args === 'object' ? args : {}
  const name = tool.replace(/^gis_/, '').replace(/^gis/, '')

  const resolveOne = (hint: string | undefined, allowAoi = true) =>
    resolveGisInputLayer({
      hint,
      layers: host.vectorLayers || [],
      liveMapState: host.liveMapState,
      allowAoiFallback: allowAoi,
    })

  try {
    switch (name) {
      case 'buffer': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.input ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        let distance = num(a.distance ?? a.dist ?? a.radius)
        let unit = str(a.unit) || 'meters'
        if (distance == null && a.distanceText) {
          const parsed = parseGisDistance(a.distanceText)
          if (parsed) {
            distance = parsed.distance
            unit = parsed.unit
          }
        }
        if (distance == null) {
          const parsed = parseGisDistance(a.distance ?? a.dist)
          if (parsed) {
            distance = parsed.distance
            unit = parsed.unit
          }
        }
        if (distance == null || distance <= 0) {
          return { ok: false, content: 'gis_buffer requires a positive distance (e.g. 500 meters).' }
        }
        const ringsRaw = a.rings ?? a.distances
        const rings = Array.isArray(ringsRaw)
          ? ringsRaw.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0)
          : undefined
        const result = runGisBuffer({
          collection: resolved.layer.collection,
          distance,
          unit,
          rings,
          outputName: str(a.output ?? a.outputName) || undefined,
          inputName: resolved.layer.name,
        })
        return applyResultLayer(host, result)
      }
      case 'intersect': {
        const aHint = str(a.layerA ?? a.inputLayer ?? a.layer ?? a.a)
        const bHint = str(a.layerB ?? a.overlay ?? a.b ?? a.with)
        const ra = resolveOne(aHint || undefined, false)
        const rb = resolveOne(bHint || undefined, true)
        if (!ra.ok) return { ok: false, content: ra.error }
        if (!rb.ok) return { ok: false, content: rb.error }
        return applyResultLayer(
          host,
          runGisIntersect({
            a: ra.layer.collection,
            b: rb.layer.collection,
            nameA: ra.layer.name,
            nameB: rb.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'clip': {
        const targetHint = str(a.layer ?? a.target ?? a.inputLayer)
        const clipHint = str(a.clipLayer ?? a.mask ?? a.clip ?? a.with) || 'AOI'
        const rt = resolveOne(targetHint || undefined, false)
        const rc = resolveOne(clipHint, true)
        if (!rt.ok) return { ok: false, content: rt.error }
        if (!rc.ok) return { ok: false, content: rc.error }
        return applyResultLayer(
          host,
          runGisClip({
            target: rt.layer.collection,
            clip: rc.layer.collection,
            targetName: rt.layer.name,
            clipName: rc.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'erase': {
        const targetHint = str(a.layer ?? a.target ?? a.inputLayer)
        const eraseHint = str(a.eraser ?? a.eraseLayer ?? a.mask ?? a.with)
        const rt = resolveOne(targetHint || undefined, false)
        const re = resolveOne(eraseHint || undefined, true)
        if (!rt.ok) return { ok: false, content: rt.error }
        if (!re.ok) return { ok: false, content: re.error }
        return applyResultLayer(
          host,
          runGisErase({
            target: rt.layer.collection,
            eraser: re.layer.collection,
            targetName: rt.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'union':
      case 'merge': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        return applyResultLayer(
          host,
          runGisUnionOrMerge({
            collection: resolved.layer.collection,
            inputName: resolved.layer.name,
            mode: name === 'merge' ? 'merge' : 'union',
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'dissolve': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        return applyResultLayer(
          host,
          runGisDissolve({
            collection: resolved.layer.collection,
            field: str(a.field ?? a.by ?? a.attribute) || undefined,
            inputName: resolved.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'convex_hull':
      case 'convexhull': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        return applyResultLayer(
          host,
          runGisConvexHull({
            collection: resolved.layer.collection,
            inputName: resolved.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'voronoi':
      case 'thiessen': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        return applyResultLayer(
          host,
          runGisVoronoi({
            collection: resolved.layer.collection,
            inputName: resolved.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'area': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        const result = runGisAreaTable({
          collection: resolved.layer.collection,
          inputName: resolved.layer.name,
          idField: str(a.idField ?? a.field) || undefined,
        })
        return {
          ok: result.ok,
          content: result.message,
          ...(result.table ? { table: result.table } : {}),
          outputName: result.outputName,
          featureCount: result.featureCount,
        }
      }
      case 'select_by_location':
      case 'selectbylocation': {
        const targetHint = str(a.layer ?? a.target ?? a.inputLayer)
        const maskHint = str(a.mask ?? a.near ?? a.with ?? a.overlay)
        const rt = resolveOne(targetHint || undefined, false)
        const rm = resolveOne(maskHint || undefined, true)
        if (!rt.ok) return { ok: false, content: rt.error }
        if (!rm.ok) return { ok: false, content: rm.error }
        let distance = num(a.distance)
        let unit = str(a.unit) || 'meters'
        if (distance == null && a.distanceText) {
          const parsed = parseGisDistance(a.distanceText)
          if (parsed) {
            distance = parsed.distance
            unit = parsed.unit
          }
        }
        return applyResultLayer(
          host,
          runGisSelectByLocation({
            target: rt.layer.collection,
            mask: rm.layer.collection,
            distance: distance ?? undefined,
            unit,
            relationship: (str(a.relationship) as 'within' | 'intersects' | 'within_distance') || undefined,
            targetName: rt.layer.name,
            maskName: rm.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'select_by_attribute':
      case 'selectbyattribute': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        const field = str(a.field ?? a.attribute)
        if (!field) return { ok: false, content: 'gis_select_by_attribute requires a field name.' }
        return applyResultLayer(
          host,
          runGisSelectByAttribute({
            collection: resolved.layer.collection,
            field,
            value: (a.value ?? a.equals) as string | number | boolean,
            operator: (str(a.operator) as '=' | '!=' | 'contains' | '>' | '<') || '=',
            inputName: resolved.layer.name,
            outputName: str(a.output ?? a.outputName) || undefined,
          }),
        )
      }
      case 'export_layer':
      case 'export': {
        const layerHint = str(a.layer ?? a.inputLayer ?? a.target)
        const resolved = resolveOne(layerHint || undefined)
        if (!resolved.ok) return { ok: false, content: resolved.error }
        const formatRaw = str(a.format || 'geojson').toLowerCase()
        const fc = {
          type: 'FeatureCollection' as const,
          features: resolved.layer.collection.features as FeatureCollection['features'],
        }
        const base = resolved.layer.name.replace(/\s+/g, '_')
        if (formatRaw === 'geojson' || formatRaw === 'json') {
          downloadGeoJsonFile(fc, `${base}.geojson`)
          return { ok: true, content: `Exported ${resolved.layer.name} as GeoJSON (${fc.features.length} features).` }
        }
        const formatMap: Record<string, VectorExportFormat> = {
          shapefile: 'shp',
          shp: 'shp',
          kmz: 'kmz',
          kml: 'kmz',
          excel: 'xlsx',
          xlsx: 'xlsx',
          csv: 'xlsx',
        }
        const fmt = formatMap[formatRaw]
        if (!fmt) {
          return {
            ok: false,
            content: `Unsupported export format "${formatRaw}". Use geojson, shapefile, kmz, or excel.`,
          }
        }
        await exportVectorLayer(fc, base, fmt)
        return {
          ok: true,
          content: `Exported ${resolved.layer.name} as ${fmt.toUpperCase()} (${fc.features.length} features).`,
        }
      }
      default:
        return { ok: false, content: `Unknown GIS tool: ${tool}` }
    }
  } catch (err) {
    return { ok: false, content: err instanceof Error ? err.message : 'GIS tool failed.' }
  }
}

export const GEO_AI_GIS_TOOL_NAMES = [
  'gis_buffer',
  'gis_intersect',
  'gis_clip',
  'gis_erase',
  'gis_union',
  'gis_merge',
  'gis_dissolve',
  'gis_convex_hull',
  'gis_voronoi',
  'gis_area',
  'gis_select_by_location',
  'gis_select_by_attribute',
  'export_layer',
] as const
