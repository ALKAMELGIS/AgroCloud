import { describe, expect, it } from 'vitest'
import {
  classifyLandActivity,
  hasActiveVegetationGrowthPattern,
  isNoCropActivity,
  qualifiesForCropHealthLabel,
} from './landActivityClassifier'

describe('landActivityClassifier', () => {
  it('detects bare unplanted soil', () => {
    const state = classifyLandActivity({
      current: { NDVI: 0.06, NDMI: 0.01, NDWI: -0.02 },
      prev1: { NDVI: 0.05, NDMI: 0.0, NDWI: 0.01 },
      prev2: { NDVI: 0.04, NDMI: 0.02, NDWI: 0.0 },
    })
    expect(state).toBe('BARE_SOIL_UNPLANTED')
    expect(isNoCropActivity(state)).toBe(true)
  })

  it('detects non-cultivated stable low NDVI', () => {
    const state = classifyLandActivity({
      current: { NDVI: 0.12, NDMI: 0.08, NDWI: 0.06 },
      prev1: { NDVI: 0.11, NDMI: 0.08, NDWI: 0.06 },
      prev2: { NDVI: 0.12, NDMI: 0.07, NDWI: 0.05 },
    })
    expect(state).toBe('NON_CULTIVATED_STABLE')
    expect(isNoCropActivity(state)).toBe(true)
  })

  it('detects active crop establishment after low baseline', () => {
    const state = classifyLandActivity({
      current: { NDVI: 0.28, NDMI: 0.12, NDWI: 0.08 },
      prev1: { NDVI: 0.11, NDMI: 0.1, NDWI: 0.07 },
      prev2: { NDVI: 0.09, NDMI: 0.09, NDWI: 0.06 },
    })
    expect(state).toBe('ACTIVE_CROP_ESTABLISHED')
    expect(isNoCropActivity(state)).toBe(false)
  })

  it('blocks healthy label without growth pattern', () => {
    const history = {
      current: { NDVI: 0.55, NDMI: 0.12, NDWI: 0.08 },
      prev1: { NDVI: 0.56, NDMI: 0.12, NDWI: 0.08 },
      prev2: { NDVI: 0.57, NDMI: 0.11, NDWI: 0.07 },
    }
    expect(hasActiveVegetationGrowthPattern(history)).toBe(false)
    expect(qualifiesForCropHealthLabel(0.55, history, 'ACTIVE_CROP_ONGOING')).toBe(false)
  })

  it('allows healthy label with positive growth pattern', () => {
    const history = {
      current: { NDVI: 0.55, NDMI: 0.12, NDWI: 0.08 },
      prev1: { NDVI: 0.48, NDMI: 0.12, NDWI: 0.08 },
      prev2: { NDVI: 0.44, NDMI: 0.11, NDWI: 0.07 },
    }
    expect(hasActiveVegetationGrowthPattern(history)).toBe(true)
    expect(qualifiesForCropHealthLabel(0.55, history, 'ACTIVE_CROP_ONGOING')).toBe(true)
  })
})
