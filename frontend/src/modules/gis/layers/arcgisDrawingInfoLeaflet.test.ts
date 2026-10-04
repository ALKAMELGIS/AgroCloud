import { describe, expect, it } from 'vitest'
import {
  arcgisFeaturePointSymbolPreview,
  arcgisFeatureToLeafletPathOptions,
} from './arcgisDrawingInfoLeaflet'

const AGRO_STRUCTURES_DRAWING_INFO = {
  renderer: {
    type: 'uniqueValue',
    field1: 'Structure_Type',
    uniqueValueGroups: [
      {
        heading: 'Structure_Type',
        classes: [
          {
            label: 'Greenhouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [76, 230, 0, 132],
              outline: { color: [110, 110, 110, 255], width: 0.7 },
            },
            values: [['1000']],
          },
          {
            label: 'PIVOT',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [130, 130, 130, 0],
              outline: { color: [0, 0, 0, 255], width: 2 },
            },
            values: [['1006']],
          },
        ],
      },
    ],
  },
}

describe('arcgisFeatureToLeafletPathOptions', () => {
  it('maps Structure_Type code to unique-value polygon symbol', () => {
    const style = arcgisFeatureToLeafletPathOptions(AGRO_STRUCTURES_DRAWING_INFO, { Structure_Type: 1000 })
    expect(style.fillColor).toBe('#4ce600')
    expect(style.fillOpacity).toBeGreaterThan(0)
  })

  it('renders hollow fill as outline-only', () => {
    const style = arcgisFeatureToLeafletPathOptions(AGRO_STRUCTURES_DRAWING_INFO, { Structure_Type: 1006 })
    expect(style.fillOpacity).toBe(0)
    expect(style.weight).toBe(2)
  })
})

describe('arcgisFeaturePointSymbolPreview', () => {
  it('returns a preview for a matched unique-value feature', () => {
    const preview = arcgisFeaturePointSymbolPreview(AGRO_STRUCTURES_DRAWING_INFO, { Structure_Type: 1000 })
    expect(preview?.strokeColor).toBeTruthy()
    expect(preview?.fillColor).toBe('#4ce600')
  })
})
