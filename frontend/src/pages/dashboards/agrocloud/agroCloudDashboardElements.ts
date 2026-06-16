import type { GisContentRow } from '../../master/gisContentPortalData'
import type {
  AgroCloudDashboardAggregation,
  AgroCloudDashboardConfig,
  AgroCloudDashboardElement,
  AgroCloudDashboardElementKind,
} from './agroCloudDashboardData'
import { collectDashboardDataSources, widgetKindsUsingDataSource } from './agroCloudDashboardDataSourceEngine'
import type { AgroCloudDashboardMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'
import type { AgroCloudDashboardIndicatorWidgetSettings } from './agroCloudDashboardIndicatorWidgetSettings'
import { defaultMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'
import {
  appendElementToBodyLayout,
  duplicateElementInBodyLayout,
  removeElementFromBodyLayout,
  resolveBodyLayout,
} from './agroCloudDashboardBodyLayout'

const BODY_ELEMENT_KINDS = new Set<AgroCloudDashboardElementKind>(['map', 'serial-chart', 'pie-chart', 'embedded'])

function isBodyElement(el: AgroCloudDashboardElement): boolean {
  return BODY_ELEMENT_KINDS.has(el.kind)
}

let dashboardElementSeq = 0

function newDashboardElementId(): string {
  dashboardElementSeq += 1
  return `el-${Date.now()}-${dashboardElementSeq}`
}

export function registerGisContentDataSource(
  config: AgroCloudDashboardConfig,
  row: GisContentRow,
): AgroCloudDashboardConfig {
  const id = `ds-${row.id}`
  const existing = config.dataSources ?? []
  if (existing.some(ds => ds.gisContentId === row.id)) return config
  return {
    ...config,
    dataSources: [
      ...existing,
      { id, gisContentId: row.id, title: row.title, typeLabel: row.typeLabel },
    ],
  }
}

export function createMapElementFromGisContent(row: GisContentRow): AgroCloudDashboardElement {
  return {
    id: newDashboardElementId(),
    kind: 'map',
    label: row.title,
    gisContentId: row.id,
    gisContentType: row.type,
    dataSourceId: `ds-${row.id}`,
  }
}

export function createGenericDashboardElement(
  kind: AgroCloudDashboardElement['kind'],
  label: string,
): AgroCloudDashboardElement {
  return { id: newDashboardElementId(), kind, label }
}

function defaultAggregation(kind: AgroCloudDashboardElementKind): AgroCloudDashboardElement['aggregation'] {
  if (kind === 'indicator' || kind === 'gauge') return 'count'
  if (kind === 'serial-chart' || kind === 'pie-chart') return 'sum'
  return 'none'
}

function suggestFieldForLayer(
  kind: AgroCloudDashboardElementKind,
  layer: { fields: Array<{ name: string; type: string; isKey?: boolean }> },
): string | undefined {
  const fields = layer.fields
  if (kind === 'serial-chart' || kind === 'pie-chart') {
    return (
      fields.find(f => f.type === 'double' || f.type === 'integer')?.name ??
      fields.find(f => f.name === 'Farm_Code')?.name ??
      fields.find(f => !f.isKey)?.name
    )
  }
  if (kind === 'indicator' || kind === 'gauge') {
    return fields.find(f => f.type === 'double' || f.type === 'integer')?.name ?? fields.find(f => !f.isKey)?.name
  }
  return (
    fields.find(f => f.name === 'Farm_Code')?.name ??
    fields.find(f => f.type === 'string' && !f.isKey)?.name ??
    fields.find(f => !f.isKey)?.name ??
    fields[0]?.name
  )
}

/** Bind a widget to a specific data source layer (+ inferred field). */
export function bindWidgetToLayer(
  config: AgroCloudDashboardConfig,
  elementId: string,
  binding: {
    dataSourceId: string
    sourceLayer: string
    field?: string
    aggregation?: AgroCloudDashboardElement['aggregation']
  },
): AgroCloudDashboardConfig {
  const el = config.elements.find(e => e.id === elementId)
  if (!el || el.kind === 'map') return config

  const sources = collectDashboardDataSources(config)
  const source = sources.find(s => s.id === binding.dataSourceId)
  const layer = source?.layers.find(l => l.name === binding.sourceLayer)
  const field = binding.field ?? (layer ? suggestFieldForLayer(el.kind, layer) : undefined)

  return {
    ...config,
    elements: config.elements.map(e =>
      e.id === elementId
        ? {
            ...e,
            dataSourceId: binding.dataSourceId,
            sourceLayer: binding.sourceLayer,
            field,
            aggregation: binding.aggregation ?? defaultAggregation(e.kind),
          }
        : e,
    ),
  }
}

/** Bind chart/indicator widgets to the primary registered data source layer + field. */
export function bindWidgetToPrimaryDataSource(
  config: AgroCloudDashboardConfig,
  elementId: string,
): AgroCloudDashboardConfig {
  const el = config.elements.find(e => e.id === elementId)
  if (!el || !widgetKindsUsingDataSource().includes(el.kind) || el.kind === 'map') return config

  const sources = collectDashboardDataSources(config)
  if (!sources.length) return config

  const primary = sources[0]!
  const layer = primary.layers[0]
  if (!layer) return config

  const field =
    layer.fields.find(f => f.name === 'Farm_Code') ??
    layer.fields.find(f => f.type === 'string' && !f.isKey) ??
    layer.fields.find(f => !f.isKey) ??
    layer.fields[0]

  return {
    ...config,
    elements: config.elements.map(e =>
      e.id === elementId
        ? {
            ...e,
            dataSourceId: primary.id,
            sourceLayer: layer.name,
            field: field?.name,
            aggregation: defaultAggregation(e.kind),
          }
        : e,
    ),
  }
}

export function appendDashboardElement(
  config: AgroCloudDashboardConfig,
  element: AgroCloudDashboardElement,
): AgroCloudDashboardConfig {
  const next = {
    ...config,
    elements: [...config.elements, element],
  }
  if (!isBodyElement(element)) return next
  return {
    ...next,
    bodyLayout: resolveBodyLayout(next),
  }
}

export function duplicateDashboardElement(
  config: AgroCloudDashboardConfig,
  elementId: string,
): AgroCloudDashboardConfig {
  const source = config.elements.find(el => el.id === elementId)
  if (!source) return config

  const clone: AgroCloudDashboardElement = {
    ...source,
    id: newDashboardElementId(),
    label: `${source.label} (copy)`,
    mapSettings: source.mapSettings ? { ...source.mapSettings } : undefined,
    indicatorSettings: source.indicatorSettings
      ? {
          ...source.indicatorSettings,
          topText: { ...source.indicatorSettings.topText },
          middleText: { ...source.indicatorSettings.middleText },
          bottomText: { ...source.indicatorSettings.bottomText },
        }
      : undefined,
    size: source.size ? { ...source.size } : undefined,
  }

  const index = config.elements.findIndex(el => el.id === elementId)
  const elements = [...config.elements]
  elements.splice(index + 1, 0, clone)

  const layout = resolveBodyLayout(config)
  const bodyLayout = isBodyElement(clone)
    ? duplicateElementInBodyLayout(layout, elementId, clone.id)
    : resolveBodyLayout({ ...config, elements })

  return { ...config, elements, bodyLayout }
}

export function removeDashboardElement(
  config: AgroCloudDashboardConfig,
  elementId: string,
): AgroCloudDashboardConfig {
  const el = config.elements.find(e => e.id === elementId)
  const elements = config.elements.filter(e => e.id !== elementId)
  const layout = resolveBodyLayout(config)
  const bodyLayout = el && isBodyElement(el) ? removeElementFromBodyLayout(layout, elementId) : layout
  return { ...config, elements, bodyLayout }
}

/** Move dragged element before `beforeElementId`, or to end when null. */
export function reorderDashboardElement(
  config: AgroCloudDashboardConfig,
  draggedElementId: string,
  beforeElementId: string | null,
): AgroCloudDashboardConfig {
  if (draggedElementId === beforeElementId) return config

  const elements = [...config.elements]
  const fromIndex = elements.findIndex(el => el.id === draggedElementId)
  if (fromIndex < 0) return config

  const [moved] = elements.splice(fromIndex, 1)
  if (!moved) return config

  if (!beforeElementId) {
    elements.push(moved)
    return { ...config, elements }
  }

  const toIndex = elements.findIndex(el => el.id === beforeElementId)
  if (toIndex < 0) {
    elements.push(moved)
  } else {
    elements.splice(toIndex, 0, moved)
  }

  return { ...config, elements }
}

export function appendDashboardElementWithBinding(
  config: AgroCloudDashboardConfig,
  element: AgroCloudDashboardElement,
): AgroCloudDashboardConfig {
  const withElement = appendDashboardElement(config, element)
  return bindWidgetToPrimaryDataSource(withElement, element.id)
}

export function addMapFromGisContent(
  config: AgroCloudDashboardConfig,
  row: GisContentRow,
): AgroCloudDashboardConfig {
  return addMapFromGisContentWithSettings(config, row)
}

export function addMapFromGisContentWithSettings(
  config: AgroCloudDashboardConfig,
  row: GisContentRow,
  mapSettings?: AgroCloudDashboardMapWidgetSettings,
): AgroCloudDashboardConfig {
  const settings = mapSettings ?? defaultMapWidgetSettings(row.title)
  const withSource = registerGisContentDataSource(config, row)
  const mapEl: AgroCloudDashboardElement = {
    ...createMapElementFromGisContent(row),
    label: settings.name.trim() || row.title,
    mapSettings: settings,
  }
  return appendDashboardElement(withSource, mapEl)
}

export function updateMapElementSettings(
  config: AgroCloudDashboardConfig,
  elementId: string,
  mapSettings: AgroCloudDashboardMapWidgetSettings,
): AgroCloudDashboardConfig {
  return {
    ...config,
    elements: config.elements.map(el =>
      el.id === elementId && el.kind === 'map'
        ? { ...el, label: mapSettings.name.trim() || el.label, mapSettings }
        : el,
    ),
  }
}

export type IndicatorElementUpdatePayload = {
  settings: AgroCloudDashboardIndicatorWidgetSettings
  sourceLayer?: string
  field?: string
  aggregation?: AgroCloudDashboardAggregation
  dataSourceId?: string
  dataSources?: AgroCloudDashboardConfig['dataSources']
  size?: AgroCloudDashboardElement['size']
}

export function updateIndicatorElementSettings(
  config: AgroCloudDashboardConfig,
  elementId: string,
  payload: IndicatorElementUpdatePayload,
): AgroCloudDashboardConfig {
  const { settings, sourceLayer, field, aggregation, dataSourceId, size } = payload
  return {
    ...config,
    elements: config.elements.map(el => {
      if (el.id !== elementId || el.kind !== 'indicator') return el
      return {
        ...el,
        label: settings.name.trim() || el.label,
        indicatorSettings: settings,
        ...(sourceLayer !== undefined ? { sourceLayer } : {}),
        ...(field !== undefined ? { field } : {}),
        ...(aggregation !== undefined ? { aggregation } : {}),
        ...(dataSourceId !== undefined ? { dataSourceId } : {}),
        ...(size !== undefined ? { size } : {}),
      }
    }),
  }
}

export function resizeDashboardElement(
  config: AgroCloudDashboardConfig,
  elementId: string,
  size: AgroCloudDashboardElement['size'],
): AgroCloudDashboardConfig {
  return {
    ...config,
    elements: config.elements.map(el => (el.id === elementId ? { ...el, size } : el)),
  }
}

export function addDataSourceFromGisContent(
  config: AgroCloudDashboardConfig,
  row: GisContentRow,
): AgroCloudDashboardConfig {
  return registerGisContentDataSource(config, row)
}
