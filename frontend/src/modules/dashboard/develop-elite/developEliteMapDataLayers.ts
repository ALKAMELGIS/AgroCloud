export type DevelopEliteMapDataLayerId =
  | 'agro-structures'
  | 'world-countries'
  | 'trees'
  | 'agri-location'

export const DEVELOP_ELITE_MAP_DATA_LAYER_IDS: DevelopEliteMapDataLayerId[] = [
  'agro-structures',
  'world-countries',
  'trees',
  'agri-location',
]

/** Panel order top → bottom; top row draws above others on the map. */
export const DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER: DevelopEliteMapDataLayerId[] = [
  'trees',
  'agri-location',
  'agro-structures',
  'world-countries',
]

export type DevelopEliteMapDataLayerDef = {
  id: DevelopEliteMapDataLayerId
  /** Display name in Layers panel (matches Settings → Data). */
  label: string
}

export const DEVELOP_ELITE_MAP_DATA_LAYERS: DevelopEliteMapDataLayerDef[] = [
  { id: 'agro-structures', label: 'Agro Structures' },
  { id: 'world-countries', label: 'World Countries' },
  { id: 'trees', label: 'Tree' },
  { id: 'agri-location', label: 'AgroLocation' },
]

/** Canonical stack order (top of Layers list → drawn above on map). */
export const CANONICAL_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER: DevelopEliteMapDataLayerId[] = [
  ...DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER,
]

export const DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY: Record<
  DevelopEliteMapDataLayerId,
  boolean
> = {
  'agro-structures': true,
  'world-countries': true,
  trees: true,
  'agri-location': true,
}

export function normalizeDevelopEliteMapLayerVisibility(
  partial?: Partial<Record<DevelopEliteMapDataLayerId, boolean>> | null,
): Record<DevelopEliteMapDataLayerId, boolean> {
  return { ...DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY, ...partial }
}

export function isDevelopEliteMapDataLayerVisible(
  visibility: Record<DevelopEliteMapDataLayerId, boolean>,
  id: DevelopEliteMapDataLayerId,
): boolean {
  return visibility[id] !== false
}

export function normalizeDevelopEliteMapDataLayerOrder(
  order?: DevelopEliteMapDataLayerId[] | null,
): DevelopEliteMapDataLayerId[] {
  const seen = new Set<DevelopEliteMapDataLayerId>()
  const out: DevelopEliteMapDataLayerId[] = []
  for (const id of order ?? []) {
    if (!DEVELOP_ELITE_MAP_DATA_LAYER_IDS.includes(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of DEVELOP_ELITE_MAP_DATA_LAYER_IDS) {
    if (!seen.has(id)) out.push(id)
  }
  return placeAgriLocationAfterTrees(out)
}

function placeAgriLocationAfterTrees(
  order: DevelopEliteMapDataLayerId[],
): DevelopEliteMapDataLayerId[] {
  const agriIdx = order.indexOf('agri-location')
  const treeIdx = order.indexOf('trees')
  if (agriIdx < 0 || treeIdx < 0 || agriIdx === treeIdx + 1) return order
  const next = order.filter(id => id !== 'agri-location')
  const nextTreeIdx = next.indexOf('trees')
  if (nextTreeIdx < 0) return order
  next.splice(nextTreeIdx + 1, 0, 'agri-location')
  return next
}

export function orderDevelopEliteMapDataLayerDefs(
  order: DevelopEliteMapDataLayerId[],
): DevelopEliteMapDataLayerDef[] {
  const byId = new Map(DEVELOP_ELITE_MAP_DATA_LAYERS.map(layer => [layer.id, layer]))
  return order.map(id => byId.get(id)).filter((layer): layer is DevelopEliteMapDataLayerDef => Boolean(layer))
}

export function moveMapDataLayerInOrder(
  order: DevelopEliteMapDataLayerId[],
  draggedId: DevelopEliteMapDataLayerId,
  targetId: DevelopEliteMapDataLayerId,
): DevelopEliteMapDataLayerId[] {
  const from = order.indexOf(draggedId)
  const to = order.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, draggedId)
  return normalizeDevelopEliteMapDataLayerOrder(next)
}
