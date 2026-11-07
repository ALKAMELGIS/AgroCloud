import { describe, expect, it } from 'vitest'
import {
  formatDevelopEliteArcGisDate,
  formatDevelopEliteCropPlantingDate,
  resolveDevelopEliteCropPlantingDateRaw,
} from './developEliteArcgisDate'

describe('developEliteArcgisDate', () => {
  it('formats ArcGIS epoch milliseconds', () => {
    expect(formatDevelopEliteArcGisDate(1759190400000)).toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/)
  })

  it('formats numeric strings from JSON', () => {
    expect(formatDevelopEliteArcGisDate('1759190400000')).toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/)
  })

  it('reads Planting_Date from crop table row attributes', () => {
    const row = { Planting_Date: 1759190400000, Farm_Name: 'NH-01' }
    expect(formatDevelopEliteCropPlantingDate(row)).toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/)
  })

  it('derives planting from harvest and duration when planting is null', () => {
    const row = {
      Planting_Date: null,
      Harvest_Date: 1743638400000,
      Duration_Days: 90,
    }
    const raw = resolveDevelopEliteCropPlantingDateRaw(row)
    expect(typeof raw).toBe('number')
    expect(formatDevelopEliteArcGisDate(raw)).toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/)
  })
})
