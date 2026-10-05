import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteMapLegendSections,
  buildDevelopElitePointLayerLegendItems,
  buildDevelopEliteStructuresLegendItems,
} from './developEliteMapLegend'

describe('buildDevelopEliteStructuresLegendItems', () => {
  it('returns all eight Structure_Type classes in catalog order', () => {
    const rows = buildDevelopEliteStructuresLegendItems(null)
    expect(rows).toHaveLength(8)
    expect(rows.map(r => r.label)).toEqual([
      'Greenhouse',
      'Nethouse',
      'Glasshouse',
      'Retractable Roof Houses',
      'Cravo',
      'Dates Farm',
      'PIVOT',
      'Farm Plots',
    ])
  })

  it('includes map overlay legend rows', () => {
    const { overlays } = buildDevelopEliteMapLegendSections(null)
    expect(overlays.some(r => r.label === 'Portfolio countries')).toBe(true)
    expect(overlays.some(r => r.label === 'Selected field')).toBe(true)
  })
})

describe('buildDevelopElitePointLayerLegendItems', () => {
  it('exposes picture marker previews for unique-value point symbology', () => {
    const rows = buildDevelopElitePointLayerLegendItems(
      {
        renderer: {
          type: 'uniqueValue',
          uniqueValueInfos: [
            {
              value: 1,
              label: 'Date Tree',
              symbol: {
                type: 'esriPMS',
                imageData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                contentType: 'image/png',
                width: 12,
                height: 12,
              },
            },
          ],
        },
      },
      'trees',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.symbolStyle).toBe('point')
    expect(rows[0]?.pointPreview?.kind).toBe('picture')
    expect(rows[0]?.pointPreview?.imageUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('builds irrigation valve legend from uniqueValueGroups + esriPMS', () => {
    const rows = buildDevelopElitePointLayerLegendItems(
      {
        renderer: {
          type: 'uniqueValue',
          field1: 'SUBTYPE',
          uniqueValueGroups: [
            {
              heading: 'SUBTYPE',
              classes: [
                {
                  label: 'Butterfly',
                  symbol: {
                    type: 'esriPMS',
                    imageData:
                      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                    contentType: 'image/png',
                    width: 15,
                    height: 15,
                  },
                  values: [['1']],
                },
              ],
            },
          ],
        },
      },
      'irrigation-valves',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.label).toBe('Butterfly')
    expect(rows[0]?.pointPreview?.kind).toBe('picture')
  })
})
