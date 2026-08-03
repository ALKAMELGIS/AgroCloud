import { buildSentinelHubWmsDisplayChunks, isSentinelHubWmsRenderReady } from './src/lib/sentinelHubWmsAoiClip.ts'
import {
  buildSentinelHubWmsGetMapUrlParts,
  resolveSentinelHubWmsGetMapLayerName,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsTimeWindow,
} from './src/lib/sentinelHubWmsLayers.ts'
import { getSentinelHubWmsBaseUrl } from './src/lib/sentinelHubWmsInstance.ts'

const clip = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[44.0, 24.0], [44.008, 24.0], [44.008, 24.008], [44.0, 24.008], [44.0, 24.0]]],
      },
    },
  ],
}

const chunks = buildSentinelHubWmsDisplayChunks(clip, 'NDVI', { sceneDate: '2026-07-22' })
console.log('chunks', chunks.length, 'ready', isSentinelHubWmsRenderReady('NDVI', chunks))
console.log('evalLen', chunks[0]?.evalscriptB64?.length, 'wktLen', chunks[0]?.geometryWkt3857?.length)
const catalog = getSentinelHubWmsLayerCatalog()
const layer = resolveSentinelHubWmsGetMapLayerName('NDVI', catalog)
const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow('NDVI', '2026-07-22', null)
const url = buildSentinelHubWmsGetMapUrlParts({
  baseUrl: getSentinelHubWmsBaseUrl(),
  layer,
  timeStart,
  timeEnd,
  cloudCoverage: 50,
  geometryWkt3857: chunks[0]?.geometryWkt3857 ?? undefined,
  evalscriptB64: chunks[0]?.evalscriptB64 ?? undefined,
  tilePixels: 512,
})
console.log('layer', layer, 'urlLen', url.length)
const res = await fetch(url.replace('{bbox-epsg-3857}', '4891960,2738940,4892960,2739940'))
console.log('fetch', res.status, res.headers.get('content-type'), (await res.arrayBuffer()).byteLength)
