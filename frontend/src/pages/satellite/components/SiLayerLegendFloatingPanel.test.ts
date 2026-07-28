import { describe, expect, it } from 'vitest'
import { buildSiLayerLegendRows } from './SiLayerLegendFloatingPanel'

describe('buildSiLayerLegendRows', () => {
  it('falls back to a single color swatch', () => {
    const rows = buildSiLayerLegendRows({
      id: 'aoi',
      name: 'AOI',
      color: '#22c55e',
      fillColor: '#16a34a',
    })
    expect(rows).toEqual([{ label: 'AOI', color: '#16a34a' }])
  })

  it('uses unique-value ArcGIS colors when present', () => {
    const rows = buildSiLayerLegendRows({
      id: 'agro',
      name: 'Agro',
      useArcGisSymbology: true,
      symbology: { useArcGisOnline: true },
      arcgisDrawingInfo: {
        renderer: {
          type: 'uniqueValue',
          uniqueValueInfos: [
            {
              value: 'A',
              label: 'Class A',
              symbol: { type: 'esriSFS', color: [34, 197, 94, 255], outline: { color: [0, 0, 0, 255], width: 1 } },
            },
            {
              value: 'B',
              label: 'Class B',
              symbol: { type: 'esriSFS', color: [59, 130, 246, 255], outline: { color: [0, 0, 0, 255], width: 1 } },
            },
          ],
        },
      },
    })
    expect(rows.length).toBe(2)
    expect(rows[0]?.label).toBe('Class A')
    expect(rows[1]?.label).toBe('Class B')
  })
})
