import { lngLatToWebMercator } from '@/modules/remote-sensing/imagery/sentinelHubWmsAoiClip'

/** EPSG:3857 BBOX for a WGS84 west/south/east/north box (Sentinel GetMap). */
export function lngLatBoxToBboxEpsg3857(box: [number, number, number, number]): string {
  const [w, s, e, n] = box
  const [minX, minY] = lngLatToWebMercator(w, s)
  const [maxX, maxY] = lngLatToWebMercator(e, n)
  return `${minX},${minY},${maxX},${maxY}`
}

export function resolveDevelopEliteLayerLiveAoiImageUrl(
  urlTemplate: string,
  boundsLngLat: [number, number, number, number],
): string {
  return urlTemplate.replace('{bbox-epsg-3857}', lngLatBoxToBboxEpsg3857(boundsLngLat))
}
