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

const IRRIGATION_MAIN_PIPE_DRAWING_INFO = {
  renderer: {
    type: 'uniqueValue',
    field1: 'SUBTYPE',
    uniqueValueGroups: [
      {
        heading: 'SUBTYPE',
        classes: [
          {
            label: 'Distribution Main',
            symbol: {
              type: 'esriSLS',
              style: 'esriSLSSolid',
              color: [0, 77, 168, 255],
              width: 14,
            },
            values: [['1']],
          },
          {
            label: 'Transmission Main',
            symbol: {
              type: 'esriSLS',
              style: 'esriSLSSolid',
              color: [228, 26, 28, 255],
              width: 14,
            },
            values: [['2']],
          },
        ],
      },
    ],
  },
}

describe('irrigation main pipe line symbology', () => {
  it('maps SUBTYPE to esriSLS color and weight', () => {
    const style = arcgisFeatureToLeafletPathOptions(IRRIGATION_MAIN_PIPE_DRAWING_INFO, { SUBTYPE: 1 })
    expect(style.color).toBe('#004da8')
    expect(style.weight).toBeGreaterThanOrEqual(2)
    expect(style.fillOpacity).toBe(0)
  })

  it('maps another SUBTYPE code', () => {
    const style = arcgisFeatureToLeafletPathOptions(IRRIGATION_MAIN_PIPE_DRAWING_INFO, { SUBTYPE: '2' })
    expect(style.color).toBe('#e41a1c')
  })
})

const IRRIGATION_VALVE_DRAWING_INFO = {
  renderer: {
    type: 'uniqueValue',
    field1: 'SUBTYPE',
    uniqueValueGroups: [
      {
        heading: 'SUBTYPE',
        classes: [
          {
            label: 'Solenoid',
            symbol: {
              type: 'esriPMS',
              imageData:
                'iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
              contentType: 'image/png',
              width: 10,
              height: 10,
            },
            values: [['5']],
          },
        ],
      },
    ],
  },
}

describe('arcgisFeaturePointSymbolPreview', () => {
  it('returns a preview for a matched unique-value feature', () => {
    const preview = arcgisFeaturePointSymbolPreview(AGRO_STRUCTURES_DRAWING_INFO, { Structure_Type: 1000 })
    expect(preview?.strokeColor).toBeTruthy()
    expect(preview?.fillColor).toBe('#4ce600')
  })

  it('maps Irrigation_System_Valve SUBTYPE to esriPMS picture marker', () => {
    const preview = arcgisFeaturePointSymbolPreview(IRRIGATION_VALVE_DRAWING_INFO, { SUBTYPE: 5 })
    expect(preview?.kind).toBe('picture')
    expect(preview?.imageUrl).toMatch(/^data:image\/png;base64,/)
    expect(preview?.imageWidth).toBe(10)
  })
})
