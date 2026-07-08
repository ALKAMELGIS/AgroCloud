export const ACP_WMS_LAYER_CATALOG = [
  { id: 'NDVI', letter: 'N', label: 'NDVI' },
  { id: 'NDMI', letter: 'N', label: 'NDMI' },
  { id: 'NDWI', letter: 'N', label: 'NDWI' },
  { id: 'EVI', letter: 'E', label: 'EVI' },
  { id: 'ET', letter: 'E', label: 'ET' },
  { id: 'CHAS', letter: 'C', label: 'CHAS' },
  { id: 'CHAS_ALERT', letter: 'A', label: 'Alert' },
] as const

export type AcpWmsLayerId = (typeof ACP_WMS_LAYER_CATALOG)[number]['id']

export function normalizeAcpWmsLayerId(raw: string): string {
  return String(raw || 'NDVI').trim().toUpperCase()
}

export function buildAcpWmsChunkLayerKey(wmsLayerId: string, chunkKey: string): string {
  return `${normalizeAcpWmsLayerId(wmsLayerId)}__${chunkKey}`
}

export function normalizeActiveAcpWmsLayers(layers: string[], fallback: string): string[] {
  const fb = normalizeAcpWmsLayerId(fallback)
  const out: string[] = []
  for (const raw of layers) {
    const id = normalizeAcpWmsLayerId(raw)
    if (!out.includes(id)) out.push(id)
  }
  return out.length ? out : [fb]
}

export function toggleActiveAcpWmsLayer(layers: string[], layerId: string): string[] | null {
  const id = normalizeAcpWmsLayerId(layerId)
  const list = normalizeActiveAcpWmsLayers(layers, id)
  const on = list.includes(id)
  if (on && list.length <= 1) return null
  return on ? list.filter(l => l !== id) : [...list, id]
}

export function resolveAcpWmsLayerOpacity(layerId: string, primaryLayerId: string, active: boolean): number {
  if (!active) return 0
  return normalizeAcpWmsLayerId(layerId) === normalizeAcpWmsLayerId(primaryLayerId) ? 1 : 0.52
}
