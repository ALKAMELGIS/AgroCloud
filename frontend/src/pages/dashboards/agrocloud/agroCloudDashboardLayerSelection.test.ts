import { describe, expect, it } from 'vitest'
import { DEFAULT_AGROCLOUD_DASHBOARD_CONFIG } from './agroCloudDashboardData'
import { bindWidgetToLayer } from './agroCloudDashboardElements'
import {
  applyDashboardLayerSelection,
  listDashboardLayerOptions,
  widgetKindNeedsLayerSelection,
  widgetKindSkipsDataPicker,
} from './agroCloudDashboardLayerSelection'
import { appendElementWithoutDataBinding } from './agroCloudDashboardLayerSelection'
import { registerGisContentDataSource } from './agroCloudDashboardElements'
import type { GisContentRow } from '../../master/gisContentPortalData'
import { queryDefinitionFromElement } from './agroCloudDashboardQueryEngine'
import { widgetRequiresDataPicker } from './agroCloudDashboardWidgetRegistry'

const mockWebMapRow: GisContentRow = {
  id: '2',
  title: 'Irrigation zones — West block',
  type: 'web-map',
  typeLabel: 'Web map',
  modified: '',
  created: '',
  sharing: 'shared',
  folderId: 'all',
}

describe('agroCloudDashboardLayerSelection', () => {
  it('lists layers after a data source is registered', () => {
    const withSource = registerGisContentDataSource(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG, mockWebMapRow)
    const options = listDashboardLayerOptions(withSource)
    expect(options.length).toBeGreaterThan(0)
    expect(options.some(o => o.layerName === 'Agro Structures')).toBe(true)
  })

  it('binds widget to selected layer', () => {
    const withSource = registerGisContentDataSource(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG, mockWebMapRow)
    const { config, element } = appendElementWithoutDataBinding(withSource, 'indicator', 'Indicator')
    const option = listDashboardLayerOptions(config).find(o => o.layerName === 'Agro Structures')
    expect(option).toBeTruthy()
    const next = applyDashboardLayerSelection(config, element.id, option!)
    const bound = next.elements.find(e => e.id === element.id)
    expect(bound?.dataSourceId).toBe(`ds-${mockWebMapRow.id}`)
    expect(bound?.sourceLayer).toBe('Agro Structures')
    expect(bound?.field).toBeTruthy()
  })
})

describe('agroCloudDashboardWidgetRegistry', () => {
  it('requires data picker for chart widgets but not rich text', () => {
    expect(widgetRequiresDataPicker('serial-chart')).toBe(true)
    expect(widgetKindSkipsDataPicker('rich-text')).toBe(true)
    expect(widgetKindNeedsLayerSelection('map')).toBe(true)
  })
})

describe('agroCloudDashboardQueryEngine', () => {
  it('builds query from bound element', () => {
    const el = {
      id: 'el-1',
      kind: 'indicator' as const,
      label: 'KPI',
      dataSourceId: 'ds-1',
      sourceLayer: 'Agri_Location',
      field: 'Area_Ha',
      aggregation: 'sum' as const,
    }
    const q = queryDefinitionFromElement(el)
    expect(q?.dataSourceId).toBe('ds-1')
    expect(q?.statistics?.[0]?.aggregation).toBe('sum')
  })
})

describe('bindWidgetToLayer', () => {
  it('sets aggregation defaults by widget kind', () => {
    const withSource = registerGisContentDataSource(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG, mockWebMapRow)
    const { config, element } = appendElementWithoutDataBinding(withSource, 'gauge', 'Gauge')
    const next = bindWidgetToLayer(config, element.id, {
      dataSourceId: `ds-${mockWebMapRow.id}`,
      sourceLayer: 'Agro Structures',
    })
    const gauge = next.elements.find(e => e.id === element.id)
    expect(gauge?.aggregation).toBe('count')
  })
})
