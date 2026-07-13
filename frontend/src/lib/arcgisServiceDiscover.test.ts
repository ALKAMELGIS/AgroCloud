import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectArcGisFeatureServiceUrl, parseArcGisDirectLayerUrl } from './arcgisServiceDiscover'
import { AGRO_STRUCTURES_FS21_URL, resolveAgroStructuresLayerUrl } from './agroStructuresPrimaryAoi'

describe('arcgisServiceDiscover', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses direct FeatureServer layer URLs', () => {
    const parsed = parseArcGisDirectLayerUrl(
      'https://example.com/arcgis/rest/services/Test/FeatureServer/3',
    )
    expect(parsed?.layerId).toBe(3)
    expect(parsed?.serviceBase).toBe('https://example.com/arcgis/rest/services/Test/FeatureServer')
  })

  it('falls back to service discovery when a direct layer id is invalid', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/FeatureServer/99?')) {
        return new Response(
          JSON.stringify({
            error: { code: 400, details: ['The requested layer (layerId: 99) was not found.'] },
          }),
          { status: 400 },
        )
      }
      if (url.includes('/FeatureServer?')) {
        return new Response(
          JSON.stringify({
            layers: [{ id: 0, name: 'Parcels', geometryType: 'esriGeometryPolygon' }],
            tables: [],
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { layers, selected } = await connectArcGisFeatureServiceUrl(
      'https://example.com/arcgis/rest/services/Test/FeatureServer/99',
    )

    expect(layers).toHaveLength(1)
    expect(selected.id).toBe(0)
    expect(selected.name).toBe('Parcels')
  })

  it('resolves Agro_Structures legacy ids before connecting', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith(AGRO_STRUCTURES_FS21_URL)) {
        return new Response(
          JSON.stringify({
            id: 21,
            name: 'Agro_Structures',
            type: 'Feature Layer',
            geometryType: 'esriGeometryPolygon',
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { selected } = await connectArcGisFeatureServiceUrl(
      'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/27',
      '',
      { resolveUrl: resolveAgroStructuresLayerUrl },
    )

    expect(selected.id).toBe(21)
    expect(selected.name).toBe('Agro_Structures')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/FeatureServer/21?')
  })
})
