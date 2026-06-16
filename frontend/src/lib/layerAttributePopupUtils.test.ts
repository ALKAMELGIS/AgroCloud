import { describe, expect, it } from 'vitest'
import {
  extractNdviFromRows,
  filterEmptyRows,
  isEmptyAttributeValue,
  isImageUrl,
  ndviHealthLabel,
} from './layerAttributePopupUtils'

describe('layerAttributePopupUtils', () => {
  it('detects empty attribute values', () => {
    expect(isEmptyAttributeValue('')).toBe(true)
    expect(isEmptyAttributeValue('—')).toBe(true)
    expect(isEmptyAttributeValue('NDVI')).toBe(false)
  })

  it('filters empty rows', () => {
    const rows = filterEmptyRows([
      { label: 'A', value: '1' },
      { label: 'B', value: '' },
    ])
    expect(rows).toHaveLength(1)
  })

  it('extracts NDVI from rows', () => {
    const ndvi = extractNdviFromRows([{ key: 'NDVI', label: 'NDVI', value: '0.72' }])
    expect(ndvi).toBe(0.72)
    expect(ndviHealthLabel(ndvi!).tone).toBe('high')
  })

  it('detects image urls', () => {
    expect(isImageUrl('https://example.com/a.png')).toBe(true)
    expect(isImageUrl('https://example.com/doc.pdf')).toBe(false)
  })
})
