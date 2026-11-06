import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteMapLegendSections,
  buildDevelopElitePointLayerLegendItems,
  buildDevelopEliteStructuresLegendItems,
  developEliteMapDataLayerLegendPreviewRow,
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

  it('skips polygon unique-value classes for irrigation valves (no yellow/purple TOC box)', () => {
    const rows = buildDevelopElitePointLayerLegendItems(
      {
        renderer: {
          type: 'uniqueValue',
          uniqueValueInfos: [
            {
              value: 1,
              label: 'Valve area',
              symbol: {
                type: 'esriSFS',
                color: [255, 255, 0, 255],
                outline: { color: [169, 0, 230, 255], width: 2 },
              },
            },
            {
              value: 2,
              label: 'Butterfly',
              symbol: {
                type: 'esriPMS',
                imageData:
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                contentType: 'image/png',
                width: 14,
                height: 14,
              },
            },
          ],
        },
      },
      'irrigation-valves',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.pointPreview?.kind).toBe('picture')
  })

  it('picks picture marker for layer list preview when multiple tree classes exist', () => {
    const legend = buildDevelopEliteMapLegendSections(null, {
      renderer: {
        type: 'uniqueValue',
        uniqueValueInfos: [
          {
            value: 1,
            label: 'Date Tree',
            symbol: {
              type: 'esriPMS',
              imageData:
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
              contentType: 'image/png',
              width: 16,
              height: 16,
            },
          },
          {
            value: 2,
            label: 'Other',
            symbol: { type: 'esriSMS', color: [255, 0, 0, 255], size: 8 },
          },
        ],
      },
    })
    const row = developEliteMapDataLayerLegendPreviewRow('trees', legend)
    expect(row?.pointPreview?.kind).toBe('picture')
    expect(row?.label).toBe('Date Tree')
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
