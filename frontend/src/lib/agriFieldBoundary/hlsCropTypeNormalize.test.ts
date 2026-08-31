import { describe, expect, it } from 'vitest'
import { HLS_INPUT_CHANNELS, normalizeHlsCropTypeName } from './hlsCropTypeNormalize'

describe('hlsCropTypeNormalize', () => {
  it('uses 18 input channels (3 timesteps × 6 bands)', () => {
    expect(HLS_INPUT_CHANNELS).toBe(18)
  })

  it('maps Prithvi crop labels to Example.xlsx names', () => {
    expect(normalizeHlsCropTypeName('Corn')).toBe('Maize / Corn')
    expect(normalizeHlsCropTypeName('Winter Wheat')).toBe('Wheat')
    expect(normalizeHlsCropTypeName('Soybeans')).toBe('Soybeans')
  })

  it('returns null for non-crop HLS classes', () => {
    expect(normalizeHlsCropTypeName('Natural vegetation')).toBeNull()
    expect(normalizeHlsCropTypeName('Open Water')).toBeNull()
    expect(normalizeHlsCropTypeName('Developed/Barren')).toBeNull()
    expect(normalizeHlsCropTypeName('Fallow/Idle cropland')).toBeNull()
  })

  it('keeps spectral proxy labels that are not exact HLS non-crop classes', () => {
    expect(normalizeHlsCropTypeName('Fallow / sparse vegetation')).toBe('Fallow / sparse vegetation')
    expect(normalizeHlsCropTypeName('Herbaceous cropland')).toBe('Herbaceous cropland')
  })
})
