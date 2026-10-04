import { describe, expect, it } from 'vitest'
import { aggregateChartSlices, readArcGisNumber } from './developEliteChartAggregate'

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
    }
    const slices = aggregateChartSlices(rows, 'Crop_Type', meta, 'Total_Tree')
    const plum = slices.find(s => s.label === 'Plum Tomato')
    expect(plum?.value).toBe(920)
    expect(plum?.color).toBe('#38bdf8')
  })

  it('falls back to row count when sum field is all zero', () => {
    const rows = [
      { crop_type: 'A', Total_Tree: 0 },
      { crop_type: 'A', Total_Tree: 0 },
      { crop_type: 'B', total_tree: 0 },
    ]
    const meta = { cropTypeLabels: new Map<string, string>() }
    const slices = aggregateChartSlices(rows, 'Crop_Type', meta, 'Total_Tree')
    const a = slices.find(s => s.label === 'A')
    const b = slices.find(s => s.label === 'B')
    expect(a?.value).toBe(2)
    expect(b?.value).toBe(1)
  })
})

describe('readArcGisNumber', () => {
  it('reads case-insensitive numeric fields', () => {
    expect(readArcGisNumber({ TOTAL_TREE: '14,004' }, 'Total_Tree')).toBe(14004)
  })
})
