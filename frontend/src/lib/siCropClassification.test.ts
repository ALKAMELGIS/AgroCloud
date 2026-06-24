import { describe, expect, it } from 'vitest'
import {
  CROP_CLASSIFICATION_LAYER_ID,
  defaultCropClassificationSeason,
  isCropClassificationLayerId,
  resolveCropClassificationTimeWindow,
} from './siCropClassification'
import { buildCropClassificationEvalscript } from './siCropClassificationEvalscript'

describe('siCropClassification', () => {
  it('detects crop classification layer id', () => {
    expect(isCropClassificationLayerId('CROP_CLASS')).toBe(true)
    expect(isCropClassificationLayerId('NDVI')).toBe(false)
  })

  it('builds default growing season from map date', () => {
    const season = defaultCropClassificationSeason('2025-08-15', 90)
    expect(season.seasonEnd).toBe('2025-08-15')
    expect(season.seasonStart).toBe('2025-05-17')
  })

  it('resolves TIME window for temporal stack', () => {
    const win = resolveCropClassificationTimeWindow('2025-04-01', '2025-08-01', '2025-08-01')
    expect(win.timeStart).toBe('2025-04-01')
    expect(win.timeEnd).toBe('2025-08-01')
  })
})

describe('buildCropClassificationEvalscript', () => {
  it('emits temporal evalscript with required bands', () => {
    const script = buildCropClassificationEvalscript()
    expect(script).toContain('temporal: true')
    expect(script).toContain('B02')
    expect(script).toContain('B08')
    expect(script).toContain('evaluatePixel')
  })

  it('exports stable layer id', () => {
    expect(CROP_CLASSIFICATION_LAYER_ID).toBe('CROP_CLASS')
  })
})
