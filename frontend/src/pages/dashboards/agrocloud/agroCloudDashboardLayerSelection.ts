import type { GisContentRow } from '../../master/gisContentPortalData'
import type {
  AgroCloudDashboardConfig,
  AgroCloudDashboardElement,
  AgroCloudDashboardElementKind,
} from './agroCloudDashboardData'
import {
  addDataSourceFromGisContent,
  addMapFromGisContent,
  appendDashboardElement,
  bindWidgetToLayer,
  createGenericDashboardElement,
  registerGisContentDataSource,
} from './agroCloudDashboardElements'
import {
  buildDashboardDataSource,
  collectDashboardDataSources,
  widgetKindsUsingDataSource,
} from './agroCloudDashboardDataSourceEngine'

export type DashboardPendingElement = {
  kind: AgroCloudDashboardElementKind
  label: string
}

export type DashboardLayerOption = {
  dataSourceId: string
  gisContentId: string
  sourceTitle: string
  layerId: string
  layerName: string
}

export function widgetKindNeedsLayerSelection(kind: AgroCloudDashboardElementKind): boolean {
  return widgetKindsUsingDataSource().includes(kind)
}

export function widgetKindSkipsDataPicker(kind: AgroCloudDashboardElementKind): boolean {
  return kind === 'rich-text' || kind === 'embedded'
}

/** Flatten registered GIS data sources into selectable layer rows. */
export function listDashboardLayerOptions(config: AgroCloudDashboardConfig): DashboardLayerOption[] {
  const out: DashboardLayerOption[] = []
  for (const source of collectDashboardDataSources(config)) {
    for (const layer of source.layers) {
      out.push({
        dataSourceId: source.id,
        gisContentId: source.gisContentId,
        sourceTitle: source.title,
        layerId: layer.id,
        layerName: layer.name,
      })
    }
  }
  return out
}

export function appendElementWithoutDataBinding(
  config: AgroCloudDashboardConfig,
  kind: AgroCloudDashboardElementKind,
  label: string,
): { config: AgroCloudDashboardConfig; element: AgroCloudDashboardElement } {
  const element = createGenericDashboardElement(kind, label)
  return { config: appendDashboardElement(config, element), element }
}

/** Bind a pending widget to a layer from an existing data source. */
export function applyDashboardLayerSelection(
  config: AgroCloudDashboardConfig,
  elementId: string,
  option: DashboardLayerOption,
): AgroCloudDashboardConfig {
  return bindWidgetToLayer(config, elementId, {
    dataSourceId: option.dataSourceId,
    sourceLayer: option.layerName,
  })
}

/** Register GIS Content item and bind pending widget (or add map widget). */
export function applyGisContentToPendingWidget(
  config: AgroCloudDashboardConfig,
  pending: DashboardPendingElement,
  row: GisContentRow,
  layerName?: string,
): AgroCloudDashboardConfig {
  if (pending.kind === 'map' && row.type === 'web-map') {
    return addMapFromGisContent(config, row)
  }

  const withSource = registerGisContentDataSource(config, row)
  const ds = buildDashboardDataSource(row.id)
  const layer =
    ds?.layers.find(l => l.name === layerName) ??
    ds?.layers[0]

  const { config: withElement, element } = appendElementWithoutDataBinding(
    withSource,
    pending.kind,
    pending.label,
  )

  if (!layer) return withElement

  return bindWidgetToLayer(withElement, element.id, {
    dataSourceId: `ds-${row.id}`,
    sourceLayer: layer.name,
  })
}

/** After browse: register portal item; returns layers for follow-up pick if needed. */
export function registerGisContentForLayerPick(
  config: AgroCloudDashboardConfig,
  row: GisContentRow,
): { config: AgroCloudDashboardConfig; layers: DashboardLayerOption[] } {
  const next = addDataSourceFromGisContent(config, row)
  const layers = listDashboardLayerOptions(next).filter(o => o.gisContentId === row.id)
  return { config: next, layers }
}
