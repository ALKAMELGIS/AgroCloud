import {
  buildAgroStructureFieldOptions,
  resolveAgroStructureFieldByKey,
  type AcpStructureFieldOption,
} from '../../dashboards/agroCloudPlatform/acpMapSpatial'
import { AGRO_STRUCTURES_PRIMARY_LAYER_ID, isAgroStructuresLayer } from '../../../lib/agroStructuresPrimaryAoi'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields'
import {
  listSiAoiMaskBuilderFieldOptions,
  readFeatureFieldToken,
  type SiAoiMaskBuilderLayerLike,
} from '../../../lib/siAoiMaskBuilder'

export const SI_IMAGERY_COMMITTED_AOI_KEY = '__aoi__'
export const SI_IMAGERY_DRAWN_AOI_LABEL = 'Drawn AOI'
export const SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX = 'vl:'

function buildBaseStructureFieldOptions(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
): AcpStructureFieldOption[] {
  const agro = buildAgroStructureFieldOptions(agroStructuresMask)
  if (agro.length) return agro
  if (aoiFields.length) {
    return aoiFields
      .map(f => ({
        fieldKey: f.id,
        displayName: f.name,
        objectId: f.id,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
  }
  return []
}

function isPolygonGeometry(g: GeoJSON.Geometry | null | undefined): g is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon')
}

/** Empty / unset = auto-detect a sensible name/id attribute. */
export const SI_IMAGERY_PLOT_LABEL_AUTO = ''

const AUTO_LABEL_KEYS = [
  'name',
  'Name',
  'NAME',
  'Plot_ID',
  'PLOT_ID',
  'plot_id',
  'PlotID',
  'plotId',
  'Object_Name',
  'OBJECT_NAME',
  'ObjectName',
  'object_name',
  'label',
  'Label',
  'PLOT_NAME',
  'Plot_Name',
  'plot_name',
  'id',
  'ID',
  'OBJECTID',
  'ObjectID',
  'objectid',
] as const

const PREFERRED_LABEL_FIELD_ORDER = [
  'Name',
  'name',
  'NAME',
  'Plot_ID',
  'PLOT_ID',
  'plot_id',
  'PlotID',
  'Object_Name',
  'OBJECT_NAME',
  'ObjectName',
  'OBJECTID',
  'ObjectID',
  'objectid',
  'PLOT_NAME',
  'Plot_Name',
  'plot_name',
  'label',
  'Label',
  'id',
  'ID',
] as const

function looksLikeLayerFileId(value: string): boolean {
  const s = String(value || '').trim()
  if (!s) return true
  if (/\.(zip|shp|dbf|shx|kml|kmz|geojson|json|gpkg|tif|tiff)$/i.test(s)) return true
  if (/^custom-\d+/i.test(s)) return true
  if (/^vl:/i.test(s)) return true
  return false
}

function featureDisplayName(
  props: Record<string, unknown> | null | undefined,
  fallback: string,
  labelAttribute?: string | null,
): string {
  if (!props) return looksLikeLayerFileId(fallback) ? fallback.replace(/^.*?#/, 'Plot ') : fallback
  const preferred = String(labelAttribute ?? '').trim()
  if (preferred) {
    const token = readFeatureFieldToken(props, preferred)
    if (token && !looksLikeLayerFileId(token)) return token
  }
  for (const key of AUTO_LABEL_KEYS) {
    const v = props[key]
    if (v != null && String(v).trim() && !looksLikeLayerFileId(String(v))) {
      return String(v).trim()
    }
  }
  // Last resort: any property whose key looks like a name/id and value is human-readable.
  for (const [key, raw] of Object.entries(props)) {
    if (!/name|plot|object|label|id/i.test(key)) continue
    if (raw == null) continue
    const token = String(raw).trim()
    if (!token || looksLikeLayerFileId(token)) continue
    return token
  }
  if (looksLikeLayerFileId(fallback)) {
    const hash = fallback.match(/#\s*(\d+)\s*$/)
    if (hash) return `Plot ${hash[1]}`
    return 'Plot'
  }
  return fallback
}

function featureObjectIdToken(
  props: Record<string, unknown>,
  layerId: string,
  featureIndex: number,
): string {
  for (const key of [
    'OBJECTID',
    'ObjectID',
    'objectid',
    'Plot_ID',
    'PLOT_ID',
    'plot_id',
    'PlotID',
    'id',
    'ID',
  ]) {
    const token = readFeatureFieldToken(props, key)
    if (token && !looksLikeLayerFileId(token)) return token
  }
  if (!looksLikeLayerFileId(String(layerId))) return `${layerId}-${featureIndex}`
  return `Plot_${featureIndex + 1}`
}

function isEligiblePlotVectorLayer(layer: SiAoiMaskBuilderLayerLike | null | undefined): boolean {
  if (!layer?.id || layer.renderMode === 'raster') return false
  if (String(layer.id) === AGRO_STRUCTURES_PRIMARY_LAYER_ID || isAgroStructuresLayer(layer as any)) {
    return false
  }
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  return features.some(f => isPolygonGeometry((f as GeoJSON.Feature | undefined)?.geometry ?? null))
}

/** Prefer explicit Agro mask; else recover polygons from paint/viewport Agro layer. */
function resolveEffectiveAgroStructuresMask(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  vectorLayers?: SiAoiMaskBuilderLayerLike[] | null,
): GeoJSON.FeatureCollection | null {
  if (Array.isArray(agroStructuresMask?.features) && agroStructuresMask!.features!.length > 0) {
    return agroStructuresMask!
  }
  if (!vectorLayers?.length) return null
  for (const layer of vectorLayers) {
    if (!layer?.id) continue
    const isAgro =
      String(layer.id) === AGRO_STRUCTURES_PRIMARY_LAYER_ID || isAgroStructuresLayer(layer as any)
    if (!isAgro) continue
    const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
    if (!features.length) continue
    return { type: 'FeatureCollection', features: features as GeoJSON.Feature[] }
  }
  return null
}

/** Attribute fields available on plot AOI layers (Name, OBJECTID, …). */
export function listSiImageryPlotLabelAttributes(
  vectorLayers: SiAoiMaskBuilderLayerLike[] | null | undefined,
): Array<{ name: string; label: string }> {
  if (!vectorLayers?.length) return []
  const names = new Set<string>()
  for (const layer of vectorLayers) {
    if (!isEligiblePlotVectorLayer(layer)) continue
    for (const name of listSiAoiMaskBuilderFieldOptions(layer)) {
      if (name) names.add(name)
    }
  }
  const sorted = Array.from(names).sort((a, b) => {
    const ai = PREFERRED_LABEL_FIELD_ORDER.findIndex(k => k.toLowerCase() === a.toLowerCase())
    const bi = PREFERRED_LABEL_FIELD_ORDER.findIndex(k => k.toLowerCase() === b.toLowerCase())
    const aRank = ai >= 0 ? ai : PREFERRED_LABEL_FIELD_ORDER.length
    const bRank = bi >= 0 ? bi : PREFERRED_LABEL_FIELD_ORDER.length
    if (aRank !== bRank) return aRank - bRank
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  return sorted.map(name => ({ name, label: name }))
}

function vectorLayerFieldKey(layerId: string, featureIndex: number): string {
  return `${SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX}${layerId}:${featureIndex}`
}

function parseVectorLayerFieldKey(
  fieldKey: string,
): { layerId: string; featureIndex: number } | null {
  if (!fieldKey.startsWith(SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX)) return null
  const rest = fieldKey.slice(SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX.length)
  const colon = rest.lastIndexOf(':')
  if (colon <= 0) return null
  const layerId = rest.slice(0, colon)
  const featureIndex = Number(rest.slice(colon + 1))
  if (!layerId || !Number.isInteger(featureIndex) || featureIndex < 0) return null
  return { layerId, featureIndex }
}

/** Polygon features from Layers-panel vector uploads (SHP/KMZ/GeoJSON), for Time Series AOI pickers. */
export function buildVectorLayerFieldOptions(
  vectorLayers: SiAoiMaskBuilderLayerLike[] | null | undefined,
  labelAttribute?: string | null,
): AcpStructureFieldOption[] {
  if (!vectorLayers?.length) return []
  const options: AcpStructureFieldOption[] = []
  for (const layer of vectorLayers) {
    if (!isEligiblePlotVectorLayer(layer)) continue
    const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
    if (!features.length) continue
    const layerNameRaw = String(layer.name || layer.id).trim() || String(layer.id)
    const layerName = looksLikeLayerFileId(layerNameRaw) ? 'AOI' : layerNameRaw
    let polyIdx = 0
    for (let i = 0; i < features.length; i++) {
      const raw = features[i] as GeoJSON.Feature | undefined
      if (!raw || !isPolygonGeometry(raw.geometry ?? null)) continue
      polyIdx += 1
      const props = (raw.properties ?? {}) as Record<string, unknown>
      const featLabel = featureDisplayName(props, `Plot ${polyIdx}`, labelAttribute)
      const displayName =
        layerName === 'AOI' ||
        featLabel === `Plot ${polyIdx}` ||
        featLabel.toLowerCase() === layerName.toLowerCase()
          ? featLabel
          : `${layerName}: ${featLabel}`
      options.push({
        fieldKey: vectorLayerFieldKey(String(layer.id), i),
        displayName,
        objectId: featureObjectIdToken(props, String(layer.id), i),
      })
    }
  }
  return options.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
}

export function buildSiImageryFieldOptions(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
  committedAoiGeometry: GeoJSON.Geometry | null | undefined,
  vectorLayers?: SiAoiMaskBuilderLayerLike[] | null,
  labelAttribute?: string | null,
): AcpStructureFieldOption[] {
  const effectiveAgroMask = resolveEffectiveAgroStructuresMask(agroStructuresMask, vectorLayers)
  const base = buildBaseStructureFieldOptions(effectiveAgroMask, aoiFields)
  const fromLayers = buildVectorLayerFieldOptions(vectorLayers, labelAttribute)
  const seen = new Set(base.map(o => o.fieldKey))
  const merged = [...base]
  for (const opt of fromLayers) {
    if (seen.has(opt.fieldKey)) continue
    seen.add(opt.fieldKey)
    merged.push(opt)
  }
  if (!committedAoiGeometry) return merged
  if (merged.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)) return merged
  return [
    ...merged,
    {
      fieldKey: SI_IMAGERY_COMMITTED_AOI_KEY,
      displayName: SI_IMAGERY_DRAWN_AOI_LABEL,
      objectId: 'aoi',
    },
  ]
}

function ringCentroid(ring: number[][]): [number, number] {
  if (!ring.length) return [0, 0]
  let sx = 0
  let sy = 0
  const n =
    ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.length - 1
      : ring.length
  for (let i = 0; i < n; i++) {
    sx += ring[i]![0]
    sy += ring[i]![1]
  }
  const d = Math.max(1, n)
  return [sx / d, sy / d]
}

function geometryCentroid(geometry: GeoJSON.Geometry): [number, number] {
  if (geometry.type === 'Point') return [geometry.coordinates[0]!, geometry.coordinates[1]!]
  if (geometry.type === 'Polygon' && geometry.coordinates[0]?.length) {
    return ringCentroid(geometry.coordinates[0] as number[][])
  }
  if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]?.[0]?.length) {
    return ringCentroid(geometry.coordinates[0]![0] as number[][])
  }
  return [0, 0]
}

function resolveVectorLayerField(
  vectorLayers: SiAoiMaskBuilderLayerLike[] | null | undefined,
  fieldKey: string,
  labelAttribute?: string | null,
): CropAlertFieldInput | null {
  const parsed = parseVectorLayerFieldKey(fieldKey)
  if (!parsed || !vectorLayers?.length) return null
  const layer = vectorLayers.find(l => String(l?.id) === parsed.layerId)
  if (!layer) return null
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  const raw = features[parsed.featureIndex] as GeoJSON.Feature | undefined
  if (!raw || !isPolygonGeometry(raw.geometry ?? null)) return null
  const props = (raw.properties ?? {}) as Record<string, unknown>
  const farmName = featureDisplayName(
    props,
    `Plot ${parsed.featureIndex + 1}`,
    labelAttribute,
  )
  return {
    fieldKey,
    objectId: featureObjectIdToken(props, parsed.layerId, parsed.featureIndex),
    farmName: looksLikeLayerFileId(farmName) ? `Plot ${parsed.featureIndex + 1}` : farmName,
    farmCode: '',
    structureType: 'AOI Layer',
    country: '',
    city: '',
    centroid: geometryCentroid(raw.geometry),
    geometry: raw.geometry,
  }
}

export function resolveSiImageryField(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
  committedAoiGeometry: GeoJSON.Geometry | null | undefined,
  fieldKey: string,
  vectorLayers?: SiAoiMaskBuilderLayerLike[] | null,
  labelAttribute?: string | null,
): CropAlertFieldInput | null {
  const effectiveAgroMask = resolveEffectiveAgroStructuresMask(agroStructuresMask, vectorLayers)
  const agro = resolveAgroStructureFieldByKey(effectiveAgroMask, fieldKey)
  if (agro) return agro
  if (fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY && committedAoiGeometry) {
    return {
      fieldKey,
      objectId: 'aoi',
      farmName: SI_IMAGERY_DRAWN_AOI_LABEL,
      farmCode: '',
      structureType: 'AOI',
      country: '',
      city: '',
      centroid: geometryCentroid(committedAoiGeometry),
      geometry: committedAoiGeometry,
    }
  }
  const fromLayer = resolveVectorLayerField(vectorLayers, fieldKey, labelAttribute)
  if (fromLayer) return fromLayer
  const sketch = aoiFields.find(f => f.id === fieldKey)
  if (!sketch) return null
  return {
    fieldKey: sketch.id,
    objectId: sketch.id,
    farmName: sketch.name,
    farmCode: '',
    structureType: 'Field',
    country: '',
    city: '',
    centroid: sketch.centroid,
    geometry: sketch.geometry,
  }
}
