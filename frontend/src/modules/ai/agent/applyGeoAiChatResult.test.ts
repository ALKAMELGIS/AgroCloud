import { describe, expect, it, vi } from 'vitest'
import { applyGeoAiChatResult } from './applyGeoAiChatResult'

describe('applyGeoAiChatResult', () => {
  it('appends statistics table to reply text', () => {
    const applied = applyGeoAiChatResult(
      {
        answer: 'Done.',
        statistics: { areaHa: 42.5, meanNdvi: 0.61 },
      },
      {},
    )
    expect(applied.replyText).toContain('Done.')
    expect(applied.replyText).toContain('| Metric |')
    expect(applied.table?.rows.length).toBe(2)
  })

  it('calls flyTo and addGeoJsonResultLayer for map actions', () => {
    const flyTo = vi.fn()
    const addGeoJsonResultLayer = vi.fn().mockReturnValue('layer-1')
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [] },
        },
      ],
    }

    const applied = applyGeoAiChatResult(
      {
        answer: 'Buffered.',
        action: { type: 'ADD_GEOJSON_LAYER', layerId: 'buffer' },
        geojson: fc,
      },
      { flyTo, addGeoJsonResultLayer },
    )

    expect(addGeoJsonResultLayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'buffer', geojson: fc }),
    )
    expect(applied.replyText).toBe('Buffered.')
  })
})
