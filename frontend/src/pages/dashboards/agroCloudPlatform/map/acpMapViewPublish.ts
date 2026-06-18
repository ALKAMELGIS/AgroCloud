import {
  lngLatBBoxCacheKey,
  quantizeLngLatBBox,
  type LngLatBBox,
} from '../../../../lib/siMapViewport'

/** Coarser grid than SI — fewer React updates while panning. */
export const ACP_MAP_VIEW_BBOX_TILE_DEG = 0.12

export function quantizeAcpMapViewBbox(bbox: LngLatBBox): LngLatBBox {
  return quantizeLngLatBBox(bbox, ACP_MAP_VIEW_BBOX_TILE_DEG)
}

export function buildAcpMapViewPublishSignature(bbox: LngLatBBox, zoom: number): string {
  const q = quantizeAcpMapViewBbox(bbox)
  const qZoom = (Math.round(zoom * 4) / 4).toFixed(2)
  return `${lngLatBBoxCacheKey(q, ACP_MAP_VIEW_BBOX_TILE_DEG)}|z${qZoom}`
}
