import { describe, expect, it } from 'vitest'
import {
  applyDataSourceReplacement,
  areFieldTypesCompatible,
  buildAutoDataSourceMapping,
  collectDashboardDataSources,
  findBestFieldMatch,
  findBestLayerMatch,
  normalizeDashboardConfig,
  resolveDataSourceLayers,
  resolveReplacementLayers,
  validateDataSourceMapping,
} from './agroCloudDashboardDataSourceEngine'
import { addDataSourceFromGisContent, addMapFromGisContent, appendDashboardElementWithBinding, createGenericDashboardElement } from './agroCloudDashboardElements'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'

describe('agroCloudDashboardDataSourceEngine', () => {
  const webMapRow = {
    id: '2',
    title: 'Irrigation zones — West block',
    type: 'web-map' as const,
    typeLabel: 'Web map',
    modified: '',
    created: '',
    sharing: 'shared' as const,
    folderId: 'all',
  }

  it('resolves Smart AgriTech-style layers for web maps', () => {
    const layers = resolveDataSourceLayers(webMapRow)
    expect(layers.some(l => l.name === 'Agro Structures')).toBe(true)
    expect(layers.find(l => l.name === 'Agro Structures')?.fields.some(f => f.name === 'Farm_Code')).toBe(true)
  })

  it('auto-matches layers and fields by name', () => {
    const current = resolveDataSourceLayers(webMapRow)
    const replacement = resolveReplacementLayers({ ...webMapRow, id: '8', title: 'Weather stations map' })
    const draft = buildAutoDataSourceMapping(current, replacement)
    expect(draft.layerMapping['Agro Structures']).toBe('Agro Structures')
    expect(draft.fieldMapping['Agro Structures']?.Farm_Code).toBe('Farm_Code')
  })

  it('rejects incompatible field types', () => {
    expect(areFieldTypesCompatible('string', 'double')).toBe(false)
    expect(areFieldTypesCompatible('integer', 'double')).toBe(true)
  })

  it('findBestLayerMatch prefers normalized names', () => {
    const current = resolveDataSourceLayers(webMapRow)
    const layer = current.find(l => l.name === 'Agro Structures')
    const replacement = resolveReplacementLayers(webMapRow)
    const match = findBestLayerMatch('Agro Structures', layer, replacement)
    expect(match).toBe('Agro Structures')
  })

  it('findBestFieldMatch respects type compatibility', () => {
    const field = { name: 'Farm_Code', type: 'string' as const }
    const targets = [
      { name: 'Area', type: 'double' as const },
      { name: 'Farm_Code', type: 'string' as const },
    ]
    expect(findBestFieldMatch(field, targets)).toBe('Farm_Code')
  })

  it('registers data sources independently of map elements', () => {
    let config: AgroCloudDashboardConfig = {
      theme: 'light',
      timeZone: 'device',
      elements: [],
    }
    config = addDataSourceFromGisContent(config, webMapRow)
    expect(collectDashboardDataSources(config)).toHaveLength(1)
    expect(config.dataSources?.[0]?.gisContentId).toBe('2')
  })

  it('binds indicator widgets to primary data source fields', () => {
    let config: AgroCloudDashboardConfig = {
      theme: 'light',
      timeZone: 'device',
      elements: [],
    }
    config = addDataSourceFromGisContent(config, webMapRow)
    config = appendDashboardElementWithBinding(config, createGenericDashboardElement('indicator', 'Farm count'))
    const indicator = config.elements[0]
    expect(indicator?.dataSourceId).toBe('ds-2')
    expect(indicator?.sourceLayer).toBe('Agro Structures')
    expect(indicator?.field).toBe('Farm_Code')
    expect(indicator?.aggregation).toBe('count')
  })

  it('applyDataSourceReplacement rewires map widgets', () => {
    let config: AgroCloudDashboardConfig = {
      theme: 'light',
      timeZone: 'device',
      elements: [],
      dataSources: [],
    }
    config = addMapFromGisContent(config, webMapRow)
    config = appendDashboardElementWithBinding(config, createGenericDashboardElement('indicator', 'Farm count'))
    const replacementRow = { ...webMapRow, id: '8', title: 'Weather stations map' }
    const current = resolveDataSourceLayers(webMapRow)
    const replacement = resolveReplacementLayers(replacementRow)
    const draft = buildAutoDataSourceMapping(current, replacement)
    draft.replacementGisContentId = replacementRow.id

    const validation = validateDataSourceMapping(current, replacement, draft)
    expect(validation.valid).toBe(true)

    const indicatorBefore = config.elements.find(e => e.kind === 'indicator')
    expect(config.elements).toHaveLength(2)
    expect(indicatorBefore?.dataSourceId).toBe('ds-2')

    const next = applyDataSourceReplacement(config, '2', replacementRow, draft)
    const indicatorAfter = next.elements.find(e => e.kind === 'indicator')
    expect(next.elements.find(e => e.kind === 'map')?.gisContentId).toBe('8')
    expect(indicatorAfter?.dataSourceId).toBe('ds-8')
    expect(indicatorAfter?.sourceLayer).toBe('Agro Structures')
    expect(indicatorAfter?.field).toBe('Farm_Code')
    expect(next.dataSources?.some(ds => ds.gisContentId === '8')).toBe(true)
  })

  it('normalizes legacy configs without dataSources array', () => {
    const normalized = normalizeDashboardConfig({
      theme: 'light',
      timeZone: 'device',
      elements: [
        {
          id: 'el-1',
          kind: 'map',
          label: webMapRow.title,
          gisContentId: '2',
          gisContentType: 'web-map',
        },
      ],
    })
    expect(normalized.dataSources?.[0]?.gisContentId).toBe('2')
  })
})
