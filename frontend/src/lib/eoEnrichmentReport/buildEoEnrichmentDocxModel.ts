import type { Feature, FeatureCollection } from 'geojson'
import { collectExistingLayerFieldKeys, normalizeEoFieldKey } from '../eoLayerEnrichmentRun'

export type EoEnrichmentDocxModel = {
  layerName: string
  generatedBy: string
  generatedStamp: string
  featureCount: number
  acquisitionDate: string
  fieldCount: number
  executiveSummary: string
  cropDistribution: Array<{ crop: string; count: number; pct: string }>
  healthDistribution: Array<{ label: string; count: number }>
  stressDistribution: Array<{ label: string; count: number }>
  tableHeaders: string[]
  tableRows: string[][]
  recommendations: string[]
  dataNotes: string
}

function prop(f: Feature, ...aliases: string[]): string {
  const props = (f.properties ?? {}) as Record<string, unknown>
  const wanted = new Set(aliases.map(a => normalizeEoFieldKey(a)))
  for (const [k, v] of Object.entries(props)) {
    if (!wanted.has(normalizeEoFieldKey(k))) continue
    if (v == null || String(v).trim() === '') continue
    return String(v)
  }
  return ''
}

function countBy(features: Feature[], ...aliases: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const f of features) {
    const v = prop(f, ...aliases) || 'Unknown'
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return map
}

function pickTableColumns(allKeys: string[]): string[] {
  const preferredNorm = [
    'objectname',
    'name',
    'objecttype',
    'structuretype',
    'croptype',
    'cropconfidence',
    'crophealth',
    'cropgrowthstage',
    'estimatedplantingdate',
    'estimatedharvestdate',
    'waterstress',
    'ndvi',
    'ndmi',
    'ndwi',
    'recommendation',
    'acquisitiondate',
  ]
  const byNorm = new Map(allKeys.map(k => [normalizeEoFieldKey(k), k]))
  const picked: string[] = []
  for (const n of preferredNorm) {
    const hit = byNorm.get(n)
    if (hit && !picked.includes(hit)) picked.push(hit)
    if (picked.length >= 10) break
  }
  if (picked.length < 6) {
    for (const k of allKeys) {
      if (!picked.includes(k)) picked.push(k)
      if (picked.length >= 10) break
    }
  }
  return picked
}

export function buildEoEnrichmentDocxModel(input: {
  geojson: FeatureCollection
  layerName: string
  acquisitionDate?: string | null
  generatedBy?: string
}): EoEnrichmentDocxModel {
  const features = (input.geojson.features ?? []).filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
  const keys = collectExistingLayerFieldKeys(features)
  const n = features.length || 1
  const cropMap = countBy(features, 'Crop_Type', 'Crop Type', 'crop')
  const healthMap = countBy(features, 'Crop_Health', 'Crop Health')
  const stressMap = countBy(features, 'Water_Stress', 'Water Stress')

  const cropDistribution = [...cropMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([crop, count]) => ({
      crop,
      count,
      pct: `${((100 * count) / n).toFixed(1)}%`,
    }))

  const healthDistribution = [...healthMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))

  const stressDistribution = [...stressMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))

  const topCrop = cropDistribution[0]
  const acquisition =
    input.acquisitionDate ||
    prop(features[0]!, 'Acquisition_Date', 'Scene_ID') ||
    '—'

  const executiveSummary = [
    `EO Layer Enrichment completed for “${input.layerName}” covering ${features.length} polygon field(s).`,
    `Attributes were filled from the latest available Sentinel-2 scene${acquisition !== '—' ? ` (${acquisition})` : ''}, using only the existing layer schema (${keys.length} field(s)).`,
    topCrop
      ? `Dominant estimated crop class: ${topCrop.crop} (${topCrop.count} fields, ${topCrop.pct}).`
      : 'Crop class estimates were not available on this schema.',
    'Planting and harvest dates, where present, were estimated from the latest green-up / senescence signals in the Sentinel-2 NDVI time series.',
  ].join(' ')

  const tableHeaders = pickTableColumns(keys)
  const tableRows = features.slice(0, 80).map(f => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    return tableHeaders.map(h => {
      const v = props[h]
      if (v == null) return '—'
      if (typeof v === 'number' && Number.isFinite(v)) {
        return Number.isInteger(v) ? String(v) : v.toFixed(3)
      }
      const s = String(v)
      return s.length > 48 ? `${s.slice(0, 45)}…` : s
    })
  })

  const recommendations = [
    ...new Set(
      features
        .map(f => prop(f, 'Recommendation'))
        .filter(Boolean)
        .slice(0, 12),
    ),
  ]
  if (!recommendations.length) {
    recommendations.push('Continue routine Sentinel-2 monitoring for active agricultural fields.')
  }

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  return {
    layerName: input.layerName,
    generatedBy: input.generatedBy || 'AgroCloud Satellite Intelligence',
    generatedStamp: stamp,
    featureCount: features.length,
    acquisitionDate: acquisition,
    fieldCount: keys.length,
    executiveSummary,
    cropDistribution,
    healthDistribution,
    stressDistribution,
    tableHeaders,
    tableRows,
    recommendations,
    dataNotes:
      features.length > 80
        ? `Attribute table shows the first 80 of ${features.length} features. Download GeoJSON/CSV/XLSX for the full enriched layer.`
        : 'Attribute values mirror the updated layer after EO enrichment (existing fields only).',
  }
}
