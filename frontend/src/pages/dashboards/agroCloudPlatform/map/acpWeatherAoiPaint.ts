import type { ExpressionSpecification, GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import { computeStableGisFeatureKey } from '../../../../lib/gisFeatureStableKey'
import { isAgroStructuresMapOutlineStructureType } from '../../../../lib/agroStructuresPrimaryAoi'
import type { AcpFieldWeatherLayerEntry } from './acpWeatherAlertLayerModel'

export const ACP_LAYER_AOI_FILL = 'acp-aoi-fill'
export const ACP_LAYER_AOI_LINE = 'acp-aoi-line'
export const ACP_SOURCE_AOI = 'acp-aoi'

function resolveWeatherEntryForFeature(
  f: GeoJSON.Feature,
  featureIndex: number,
  entries: AcpFieldWeatherLayerEntry[],
): AcpFieldWeatherLayerEntry | undefined {
  const stableKey = computeStableGisFeatureKey(f, featureIndex)
  const byKey = entries.find(e => e.fieldKey === stableKey)
  if (byKey) return byKey
  const props = (f.properties ?? {}) as Record<string, unknown>
  const oid = String(props.OBJECTID ?? props.objectid ?? '')
  if (oid) return entries.find(e => e.objectId === oid)
  return undefined
}

const AOI_FILL_COLOR_NORMAL: ExpressionSpecification = [
  'match',
  ['get', '__acpOutlineRole'],
  'greenhouse',
  '#38bdf8',
  '#39ff14',
]

const AOI_FILL_COLOR_WEATHER: ExpressionSpecification = [
  'case',
  ['==', ['get', '__acpOutlineRole'], 'greenhouse'],
  '#38bdf8',
  [
    'match',
    ['get', '__acpWeatherLevel'],
    'red',
    '#ef4444',
    'orange',
    '#f97316',
    'yellow',
    '#facc15',
    '#39ff14',
  ],
]

const AOI_LINE_COLOR_NORMAL: ExpressionSpecification = [
  'match',
  ['get', '__acpOutlineRole'],
  'greenhouse',
  '#0284c7',
  '#39ff14',
]

const AOI_LINE_COLOR_WEATHER: ExpressionSpecification = [
  'case',
  ['==', ['get', '__acpOutlineRole'], 'greenhouse'],
  '#0284c7',
  [
    'match',
    ['get', '__acpWeatherLevel'],
    'red',
    '#b91c1c',
    'orange',
    '#c2410c',
    'yellow',
    '#ca8a04',
    '#15803d',
  ],
]

export function applyAoiWeatherFillPaint(map: MaplibreMap, weatherAlertsEnabled: boolean) {
  if (!map.getLayer(ACP_LAYER_AOI_FILL)) return
  map.setPaintProperty(
    ACP_LAYER_AOI_FILL,
    'fill-color',
    weatherAlertsEnabled ? AOI_FILL_COLOR_WEATHER : AOI_FILL_COLOR_NORMAL,
  )
  if (map.getLayer(ACP_LAYER_AOI_LINE)) {
    map.setPaintProperty(
      ACP_LAYER_AOI_LINE,
      'line-color',
      weatherAlertsEnabled ? AOI_LINE_COLOR_WEATHER : AOI_LINE_COLOR_NORMAL,
    )
  }
}

export function enrichAoiMaskWithWeather(
  aoiMask: GeoJSON.FeatureCollection,
  entries: AcpFieldWeatherLayerEntry[],
  weatherAlertsEnabled: boolean,
): GeoJSON.FeatureCollection {
  return {
    ...aoiMask,
    features: aoiMask.features.map((f, i) => {
      const props = (f as { properties?: Record<string, unknown> }).properties ?? {}
      const stableKey = computeStableGisFeatureKey(f, i)
      const key = String(props.OBJECTID ?? props.objectid ?? i)
      const outlineRole = isAgroStructuresMapOutlineStructureType(props) ? 'greenhouse' : 'mask'
      const entry = resolveWeatherEntryForFeature(f as GeoJSON.Feature, i, entries)
      const level = weatherAlertsEnabled && entry ? entry.level : 'none'
      return {
        ...(f as object),
        properties: {
          ...props,
          __acpFieldKey: key,
          __acpStableFieldKey: stableKey,
          __acpOutlineRole: outlineRole,
          __acpWeatherLevel: level,
          __acpWeatherActive: weatherAlertsEnabled && level !== 'none',
        },
      }
    }),
  }
}

export function patchAoiWeatherOnMap(
  map: MaplibreMap,
  aoiMask: GeoJSON.FeatureCollection,
  entries: AcpFieldWeatherLayerEntry[],
  weatherAlertsEnabled: boolean,
) {
  const source = map.getSource(ACP_SOURCE_AOI) as GeoJSONSource | undefined
  if (!source) return

  source.setData(
    enrichAoiMaskWithWeather(aoiMask, entries, weatherAlertsEnabled) as GeoJSON.FeatureCollection,
  )
  applyAoiWeatherFillPaint(map, weatherAlertsEnabled)
}
