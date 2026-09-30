import { describe, expect, it } from 'vitest'
import {
  buildCropAlertHvdTemplateSvg,
  cropAlertHvdTierFromLightweightTier,
  CROP_ALERT_HVD_MAP_ICON_ID,
} from './cropAlertLayerHvdIcon'

describe('cropAlertLayerHvdIcon', () => {
  it('builds minimal monochrome template svg', () => {
    const svg = buildCropAlertHvdTemplateSvg()
    expect(svg).toContain('<svg')
    expect(svg).toContain('HVD')
    expect(svg).toContain('xmlns=')
  })

  it('maps lightweight tier numbers to risk tiers', () => {
    expect(cropAlertHvdTierFromLightweightTier(3)).toBe('critical')
    expect(cropAlertHvdTierFromLightweightTier(0)).toBe('stable')
  })

  it('uses stable map icon id', () => {
    expect(CROP_ALERT_HVD_MAP_ICON_ID).toBe('crop-alert-hvd-icon')
  })
})
