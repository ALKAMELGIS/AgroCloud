import { describe, expect, it } from 'vitest'
import { DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS } from './developEliteMapLibreOverlays'

describe('developEliteMapLibreFeaturePopup', () => {
  it('queries vector data layers but not world countries outline', () => {
    expect(DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS.some(id => id.includes('world'))).toBe(false)
    expect(DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS.some(id => id.includes('agro-structures'))).toBe(true)
    expect(DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS.some(id => id.includes('trees'))).toBe(true)
  })
})
