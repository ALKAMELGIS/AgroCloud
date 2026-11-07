import { describe, expect, it } from 'vitest'
import {
  resolveDevelopEliteChartFlashCropLabel,
  resolveDevelopEliteChartSelectionCropLabel,
} from './developEliteChartFlash'

describe('resolveDevelopEliteChartFlashCropLabel', () => {
  it('returns Crop_Type for the flashing table row', () => {
    const rows = [
      { _rowId: '1', Crop_Type: 'Capsicum Yellow' },
      { _rowId: '2', Crop_Type: 'Tomato Beef' },
    ]
    expect(resolveDevelopEliteChartFlashCropLabel(rows, '2')).toBe('Tomato Beef')
    expect(resolveDevelopEliteChartFlashCropLabel(rows, null)).toBeNull()
  })
})

describe('resolveDevelopEliteChartSelectionCropLabel', () => {
  it('returns Crop_Type for the highlighted table row', () => {
    const rows = [{ _rowId: 'a', Crop_Type: 'Plum Tomato' }]
    expect(resolveDevelopEliteChartSelectionCropLabel(rows, 'a')).toBe('Plum Tomato')
    expect(resolveDevelopEliteChartSelectionCropLabel(rows, null)).toBeNull()
  })
})
