import { describe, expect, it } from 'vitest'
import {
  aggregateChartSlices,
  readArcGisNumber,
  resolveCodedFieldLabel,
} from './developEliteChartAggregate'
import { DEFAULT_DEVELOP_ELITE_CHART_PALETTE } from './developEliteChartsConfig'

describe('aggregateChartSlices', () => {
  it('sums Total_Tree per crop label', () => {
    const rows = [
      { Crop_Type: '100', Total_Tree: 400 },
      { Crop_Type: '100', Total_Tree: 520 },
      { Crop_Type: '200', Total_Tree: 100 },
    ]
    const meta = {
      cropTypeLabels: new Map([
        ['100', 'Plum Tomato'],
        ['200', 'Capsicum Red'],
      ]),
      fieldDomainLabels: new Map([
        [
          'Crop_Type',
          new Map([
            ['100', 'Plum Tomato'],
            ['200', 'Capsicum Red'],
          ]),
        ],
      ]),
    }
    const slices = aggregateChartSlices(rows, 'Crop_Type', meta, 'Total_Tree')
    const plum = slices.find(s => s.label === 'Plum Tomato')
    expect(plum?.value).toBe(920)
    expect(plum?.color).toBe(DEFAULT_DEVELOP_ELITE_CHART_PALETTE[0])
    expect(slices.find(s => s.label === 'Capsicum Red')?.color).toBe(DEFAULT_DEVELOP_ELITE_CHART_PALETTE[1])
  })

  it('falls back to row count when sum field is all zero', () => {
    const rows = [
      { crop_type: 'A', Total_Tree: 0 },
      { crop_type: 'A', Total_Tree: 0 },
      { crop_type: 'B', total_tree: 0 },
    ]
    const meta = { cropTypeLabels: new Map<string, string>(), fieldDomainLabels: new Map() }
    const slices = aggregateChartSlices(rows, 'Crop_Type', meta, 'Total_Tree')
    const a = slices.find(s => s.label === 'A')
    const b = slices.find(s => s.label === 'B')
    expect(a?.value).toBe(2)
    expect(b?.value).toBe(1)
  })
})

describe('resolveCodedFieldLabel', () => {
  it('maps Variety domain code to description name', () => {
    const meta = {
      cropTypeLabels: new Map<string, string>(),
      fieldDomainLabels: new Map([
        ['Variety', new Map([['14012', 'Cherry Tomato A'], ['14013', 'Beefsteak B']])],
      ]),
    }
    expect(resolveCodedFieldLabel({ Variety: 14012 }, meta, 'Variety')).toBe('Cherry Tomato A')
    expect(resolveCodedFieldLabel({ VARIETY: '14013' }, meta, 'Variety')).toBe('Beefsteak B')
  })
})

describe('readArcGisNumber', () => {
  it('reads case-insensitive numeric fields', () => {
    expect(readArcGisNumber({ TOTAL_TREE: '14,004' }, 'Total_Tree')).toBe(14004)
  })
})
