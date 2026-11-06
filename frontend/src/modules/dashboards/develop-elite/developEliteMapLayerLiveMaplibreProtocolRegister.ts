import maplibregl from 'maplibre-gl'
import {
  DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG,
  resolveDevelopEliteLayerLiveTileFetchUrl,
} from './developEliteMapLayerLiveMaplibreProtocol'

let legacyProtocolRegistered = false

/**
 * MapLibre worker path for unregistered custom schemes can call `makeRequest` without an
 * AbortController, which throws `reading 'signal'`. Legacy `de-layer-live-tile://` styles
 * still get a safe protocol handler; new sources use the fake HTTPS tile template.
 */
export function ensureDevelopEliteLayerLiveMaplibreProtocol(): void {
  if (legacyProtocolRegistered) return
  legacyProtocolRegistered = true
  maplibregl.addProtocol('de-layer-live-tile', async (params, abortController) => {
    const target =
      resolveDevelopEliteLayerLiveTileFetchUrl(params.url) ?? DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG
    const res = await fetch(target, {
      signal: abortController?.signal,
      credentials: 'omit',
      mode: 'cors',
    })
    if (!res.ok) {
      throw new Error(`Layer live tile failed (${res.status})`)
    }
    return { data: await res.arrayBuffer() }
  })
}
