export type DevelopEliteMapDataLayerId =
  | 'agro-structures'
  | 'world-countries'
  | 'trees'
  | 'irrigation-valves'
  | 'irrigation-main-pipe'
  | 'agri-location'

export const DEVELOP_ELITE_MAP_DATA_LAYER_IDS: DevelopEliteMapDataLayerId[] = [
  'trees',
  'irrigation-valves',
  'agri-location',
  'irrigation-main-pipe',
  'agro-structures',
  'world-countries',
]

/** Panel order top → bottom; top row draws above others on the map. */
export const DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER: DevelopEliteMapDataLayerId[] = [
  'trees',
  'irrigation-valves',
  'agri-location',
  'irrigation-main-pipe',
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
  { id: 'irrigation-valves', label: 'Irrigation System Valve' },
  { id: 'irrigation-main-pipe', label: 'Irrigation Pressure Main Pipe' },
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
  'irrigation-valves': true,
  'irrigation-main-pipe': true,
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
  return placeAgriLocationAfterTrees(ensureMapOverlaysAboveStructureFills(out))
}

const DEVELOP_ELITE_OVERLAY_ABOVE_STRUCTURE_IDS: DevelopEliteMapDataLayerId[] = [
  'trees',
  'irrigation-valves',
  'agri-location',
  'irrigation-main-pipe',
]

/** Valves / pipes / trees must draw above opaque structure polygons (panel order: lower index = on top). */
function ensureMapOverlaysAboveStructureFills(
  order: DevelopEliteMapDataLayerId[],
): DevelopEliteMapDataLayerId[] {
  const structureIdx = order.indexOf('agro-structures')
  if (structureIdx < 0) return order
  let next = [...order]
  for (const id of DEVELOP_ELITE_OVERLAY_ABOVE_STRUCTURE_IDS) {
    const idx = next.indexOf(id)
    if (idx < 0 || idx < structureIdx) continue
    next = next.filter(layerId => layerId !== id)
    const structuresAt = next.indexOf('agro-structures')
    if (structuresAt < 0) {
      next.unshift(id)
      continue
    }
    next.splice(structuresAt, 0, id)
  }
  return next
}

/** Keep point overlays stacked: Tree → Irrigation valves → AgroLocation (when present). */
function placeAgriLocationAfterTrees(
  order: DevelopEliteMapDataLayerId[],
): DevelopEliteMapDataLayerId[] {
  const treeIdx = order.indexOf('trees')
  if (treeIdx < 0) return order
  const stackAfterTrees: DevelopEliteMapDataLayerId[] = [
    'irrigation-valves',
    'agri-location',
    'irrigation-main-pipe',
  ]
  const present = stackAfterTrees.filter(id => order.includes(id))
  if (!present.length) return order
  const without = order.filter(id => !stackAfterTrees.includes(id))
  const nextTreeIdx = without.indexOf('trees')
  if (nextTreeIdx < 0) return order
  without.splice(nextTreeIdx + 1, 0, ...present)
  return without
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
