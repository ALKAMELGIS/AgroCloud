import { describe, expect, it } from 'vitest'

import {
  applyBuilderFilters,
  builderCategories,
  builderDistinctValues,
  builderStatistic,
  formatBuilderNumber,
  type BuilderFieldInfo,
} from './builderStats'
import { createBuilderElement, isEmbeddableUrl, normalizeBuilderElement, normalizeBuilderElements } from './builderTypes'

const rows = [
  { Type: 'Greenhouse', Country: 'Egypt', Area: 10 },
  { Type: 'Greenhouse', Country: 'Morocco', Area: '5' },
  { Type: 'Nethouse', Country: 'Egypt', Area: 2.5 },
  { Type: 'Glasshouse', Country: 'Serbia', Area: null },
  { Type: '', Country: 'Egypt', Area: 1 },
]

describe('builder statistics', () => {
  it('count / sum / avg / min / max skip non-numeric values', () => {
    expect(builderStatistic(rows, 'count', '')).toBe(5)
    expect(builderStatistic(rows, 'sum', 'Area')).toBe(18.5)
    expect(builderStatistic(rows, 'avg', 'Area')).toBeCloseTo(4.625)
    expect(builderStatistic(rows, 'min', 'Area')).toBe(1)
    expect(builderStatistic(rows, 'max', 'Area')).toBe(10)
    expect(builderStatistic(rows, 'sum', '')).toBeNull()
    expect(builderStatistic([], 'avg', 'Area')).toBeNull()
  })

  it('filters with conditions and cross-filter selections', () => {
    expect(applyBuilderFilters(rows, [{ field: 'Country', op: '=', value: 'egypt' }])).toHaveLength(3)
    expect(applyBuilderFilters(rows, [{ field: 'Area', op: '>=', value: '5' }])).toHaveLength(2)
    expect(applyBuilderFilters(rows, [{ field: 'Type', op: 'empty', value: '' }])).toHaveLength(1)
    expect(applyBuilderFilters(rows, [{ field: 'Type', op: 'contains', value: 'house' }])).toHaveLength(4)
    expect(applyBuilderFilters(rows, [], [{ field: 'Type', values: ['Greenhouse', 'Nethouse'] }])).toHaveLength(3)
  })

  it('ignores selections on a field the data does not have', () => {
    expect(applyBuilderFilters(rows, [], [{ field: 'Crop', values: ['Tomato'] }])).toHaveLength(5)
  })

  it('groups, sorts and folds the tail into Other', () => {
    const cats = builderCategories(rows, 'Type', 'count', '', { sort: 'value-desc', max: 3 })
    expect(cats.map(c => [c.label, c.value])).toEqual([
      ['Greenhouse', 2],
      ['(empty)', 1],
      ['Other', 2],
    ])
    const byArea = builderCategories(rows, 'Country', 'sum', 'Area', { sort: 'label-asc', max: 10 })
    expect(byArea.map(c => [c.key, c.value])).toEqual([
      ['Egypt', 13.5],
      ['Morocco', 5],
      ['Serbia', 0],
    ])
  })

  it('decodes coded-value domains for labels but keeps raw keys', () => {
    const field: BuilderFieldInfo = { name: 'T', alias: 'T', type: 'number', codes: new Map([['1', 'Greenhouse']]) }
    const cats = builderCategories([{ T: 1 }, { T: 1 }, { T: 2 }], 'T', 'count', '', { sort: 'value-desc', max: 5, field })
    expect(cats[0]).toMatchObject({ key: '1', label: 'Greenhouse', value: 2 })
    expect(builderDistinctValues([{ T: 1 }, { T: 2 }], 'T', field).map(v => v.label)).toEqual(['2', 'Greenhouse'])
  })

  it('formats numbers with prefix, suffix, decimals and compact', () => {
    expect(formatBuilderNumber(1234.5, { decimals: 1, prefix: '', suffix: ' ha', compact: false })).toBe('1,234.5 ha')
    expect(formatBuilderNumber(48262, { decimals: 0, prefix: '', suffix: '', compact: true })).toBe('48.3K')
    expect(formatBuilderNumber(null, { decimals: 0, prefix: '', suffix: '', compact: false })).toBe('—')
  })
})

describe('builder element model', () => {
  it('creates elements with sensible defaults per type', () => {
    expect(createBuilderElement('serial-chart', 'el-a')).toMatchObject({ id: 'el-a', actionTargets: 'all', source: { kind: 'catalog' } })
    expect(createBuilderElement('text', 'el-b')).toMatchObject({ source: null, actionTargets: 'none' })
  })

  it('repairs stored elements and drops unknown ones', () => {
    const els = normalizeBuilderElements({
      'el-1': { type: 'indicator', title: 'Farms', statistic: 'bogus', format: { decimals: 99 }, color: 'red' },
      'el-2': { type: 'not-a-type' },
      'kpi-x': { type: 'indicator' },
    })
    expect(Object.keys(els)).toEqual(['el-1'])
    expect(els['el-1']).toMatchObject({ title: 'Farms', statistic: 'count', color: '#22c55e', format: { decimals: 6 } })
    expect(normalizeBuilderElement({ type: 'list', actionTargets: ['el-9', 3] }, 'el-x')?.actionTargets).toEqual(['el-9'])
  })

  it('only embeds HTTPS pages', () => {
    expect(isEmbeddableUrl('https://embed.windy.com/x')).toBe(true)
    expect(isEmbeddableUrl('http://example.com')).toBe(false)
    expect(isEmbeddableUrl('javascript:alert(1)')).toBe(false)
  })
})
