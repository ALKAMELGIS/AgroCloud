import {
  buildRemoteSensingLayerSelectGroups,
  type RemoteSensingLayerSelectGroup,
} from '../../../lib/agroCompositeIndices'
import { ACP_WMS_LAYER_CATALOG, normalizeAcpWmsLayerId } from './acpWmsLayerCatalog'

/** Full Layer Live catalog — same groups as Satellite Intelligence INDEX LAYER. */
export function buildAcpLayerLiveGroups(): RemoteSensingLayerSelectGroup[] {
  const groups = buildRemoteSensingLayerSelectGroups([])
  const seen = new Set<string>()
  for (const group of groups) {
    for (const opt of group.options) seen.add(opt.id.toUpperCase())
  }

  const extras = ACP_WMS_LAYER_CATALOG.filter(layer => !seen.has(layer.id.toUpperCase())).map(layer => ({
    id: layer.id,
    label: layer.label,
  }))

  if (!extras.length) return groups

  const core = groups.find(g => g.id === 'core')
  if (core) {
    return groups.map(g =>
      g.id === 'core'
        ? {
            ...g,
            options: [
              ...g.options,
              ...extras.map(e => ({ id: e.id, label: e.label, scientificName: undefined })),
            ],
          }
        : g,
    )
  }

  return [
    {
      id: 'core-legacy',
      label: 'Core Interpretation',
      options: extras.map(e => ({ id: e.id, label: e.label, scientificName: undefined })),
    },
    ...groups,
  ]
}

export function resolveAcpLayerLiveLetter(layerId: string): string {
  const id = normalizeAcpWmsLayerId(layerId)
  const hit = ACP_WMS_LAYER_CATALOG.find(layer => layer.id === id)
  if (hit) return hit.letter
  return id.charAt(0) || '?'
}

export function layerLiveOptionTitle(layerId: string, scientificName?: string): string {
  const id = normalizeAcpWmsLayerId(layerId)
  if (id === 'CHAS_ALERT') return 'CHAS Alert — derived 4-level overlay'
  if (scientificName?.trim()) return `${id} · ${scientificName.trim()}`
  return id
}
