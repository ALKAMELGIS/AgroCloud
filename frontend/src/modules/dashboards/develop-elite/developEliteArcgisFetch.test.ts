import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearLiveArcgisLayerEndpointCache,
  developElitePrimaryStructuresLayerUrl,
  developEliteStructuresQueryLayerUrls,
  fetchArcGisTableRows,
  fetchFeatureLayerGeoJson,
  resolveDevelopEliteFeatureLayerUrl,
  resolveLiveArcgisLayerEndpoint,
} from './developEliteArcgisFetch'

const SERVICE =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer'
const PIPE_SERVICE =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Irrigation_Pressure_Main_Pipe/FeatureServer'

describe('developEliteStructuresQueryLayerUrls', () => {
  it('maps portal layer 27 to the polygon layers (21 then legacy 0)', () => {
    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/27`)).toEqual([`${SERVICE}/21`, `${SERVICE}/0`])
  })

  it('tries a configured polygon id first', () => {
    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/0`)).toEqual([`${SERVICE}/0`, `${SERVICE}/21`])
    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/21`)).toEqual([`${SERVICE}/21`, `${SERVICE}/0`])
  })

  it('never queries a crops table id as polygons', () => {
    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/1`)).toEqual([`${SERVICE}/21`, `${SERVICE}/0`])
    expect(developEliteStructuresQueryLayerUrls(`${SERVICE}/32`)).toEqual([`${SERVICE}/21`, `${SERVICE}/0`])
  })
})

describe('developElitePrimaryStructuresLayerUrl', () => {
  it('maps portal layer 27 to FeatureServer/21 for zone Name list', () => {
    expect(developElitePrimaryStructuresLayerUrl(`${SERVICE}/27`)).toBe(`${SERVICE}/21`)
    expect(developElitePrimaryStructuresLayerUrl(`${SERVICE}/0`)).toBe(`${SERVICE}/21`)
  })
})

describe('resolveDevelopEliteFeatureLayerUrl', () => {
  it('uses the polygon layer when settings reference layer 27 or a crops table', () => {
    expect(resolveDevelopEliteFeatureLayerUrl(`${SERVICE}/27`)).toBe(`${SERVICE}/21`)
    expect(resolveDevelopEliteFeatureLayerUrl(`${SERVICE}/1`)).toBe(`${SERVICE}/21`)
  })
})

type Route = (url: string) => unknown

function mockFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = route(url)
    if (body === 400) return new Response('Bad Request', { status: 400 })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const layerNotFound = { error: { code: 400, message: '', details: ['The requested layer (layerId: 0) was not found.'] } }

describe('resolveLiveArcgisLayerEndpoint (republished services)', () => {
  beforeEach(() => clearLiveArcgisLayerEndpointCache())
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a layer id that still exists', async () => {
    const fetchMock = mockFetch(() => ({ id: 56, name: 'Irrigation Pressure Main Pipe' }))
    await expect(resolveLiveArcgisLayerEndpoint(`${PIPE_SERVICE}/56`)).resolves.toBe(`${PIPE_SERVICE}/56`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('moves a vanished layer id to the live layer of the same service', async () => {
    mockFetch(url =>
      url.startsWith(`${PIPE_SERVICE}/0`)
        ? layerNotFound
        : { layers: [{ id: 56, name: 'Irrigation Pressure Main Pipe' }], tables: [] },
    )
    await expect(resolveLiveArcgisLayerEndpoint(`${PIPE_SERVICE}/0`)).resolves.toBe(`${PIPE_SERVICE}/56`)
  })

  it('resolves tables separately from layers', async () => {
    mockFetch(url =>
      url.startsWith(`${SERVICE}/1`)
        ? layerNotFound
        : { layers: [{ id: 21, name: 'Agro_Structures' }], tables: [{ id: 32, name: 'Crops_Planted' }] },
    )
    await expect(resolveLiveArcgisLayerEndpoint(`${SERVICE}/1`, 'table')).resolves.toBe(`${SERVICE}/32`)
  })

  it('leaves non-FeatureServer URLs and network failures alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await expect(resolveLiveArcgisLayerEndpoint(`${SERVICE}/5`)).resolves.toBe(`${SERVICE}/5`)
    await expect(resolveLiveArcgisLayerEndpoint('https://example.com/data.geojson')).resolves.toBe(
      'https://example.com/data.geojson',
    )
  })

  it('loads structures from the live layer when every known id is gone', async () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { OBJECTID: 1 }, geometry: null }] }
    mockFetch(url => {
      if (url.includes('/query?')) return url.startsWith(`${SERVICE}/40/`) ? fc : 400
      if (url.startsWith(`${SERVICE}?`)) return { layers: [{ id: 40, name: 'Agro_Structures' }] }
      return layerNotFound
    })
    await expect(fetchFeatureLayerGeoJson(`${SERVICE}/21`)).resolves.toEqual(fc)
  })

  it('reads table rows from the live table id', async () => {
    mockFetch(url => {
      if (url.startsWith(`${SERVICE}/32/query`)) return { features: [{ attributes: { Farm_Code: 'A1' } }] }
      if (url.startsWith(`${SERVICE}?`)) return { layers: [{ id: 21 }], tables: [{ id: 32, name: 'Crops_Planted' }] }
      return layerNotFound
    })
    await expect(fetchArcGisTableRows(`${SERVICE}/1`)).resolves.toEqual([{ Farm_Code: 'A1' }])
  })
})
