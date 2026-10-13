import { describe, expect, it } from 'vitest'
import { preparePieSlices } from './fieldAttributesPieSlices'

const color = (_l: string, i: number) => `#c${i}`

describe('preparePieSlices', () => {
  it('merges tail categories into Other', () => {
    const rows = [
      { label: 'A', count: 40 },
      { label: 'B', count: 30 },
      { label: 'C', count: 15 },
      { label: 'D', count: 10 },
      { label: 'E', count: 5 },
    ]
    const slices = preparePieSlices(rows, color, { maxSlices: 3 })
    expect(slices).toHaveLength(4)
    expect(slices[3]?.label).toBe('Other')
    expect(slices[3]?.count).toBe(15)
  })

  it('keeps single-category charts at 100%', () => {
    const slices = preparePieSlices([{ label: 'Cropland', count: 27 }], color)
    expect(slices).toHaveLength(1)
    expect(slices[0]?.pct).toBe(100)
  })
})
