import type { AgroCloudDashboardConfig, AgroCloudDashboardElement } from './agroCloudDashboardData'
import { getBodyElements } from './agroCloudDashboardLayout'

/** Vertical bands (dock top/bottom). */
export type DashboardLayoutRowDirection = 'row'
/** Horizontal panes (dock left/right). */
export type DashboardLayoutColumnDirection = 'column'

export type DashboardBodyLayoutNode =
  | { kind: 'element'; elementId: string }
  | {
      kind: 'split'
      direction: DashboardLayoutRowDirection | DashboardLayoutColumnDirection
      children: DashboardBodyLayoutNode[]
      sizes: number[]
    }
  | { kind: 'stack'; children: DashboardBodyLayoutNode[]; activeIndex: number }
  | {
      kind: 'group'
      direction: DashboardLayoutRowDirection | DashboardLayoutColumnDirection
      children: DashboardBodyLayoutNode[]
      sizes: number[]
    }

export type DashboardLayoutDropZone = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type DashboardLayoutDropIntent =
  | { type: 'dock'; zone: 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'stack' }
  | { type: 'group'; direction: 'row' | 'column' }

export function resolveLayoutDropIntent(zone: DashboardLayoutDropZone, shiftKey: boolean): DashboardLayoutDropIntent {
  if (zone === 'center') {
    return shiftKey ? { type: 'group', direction: 'row' } : { type: 'stack' }
  }
  return { type: 'dock', zone }
}

export function layoutDropHint(intent: DashboardLayoutDropIntent): string {
  if (intent.type === 'stack') return 'Stack the items'
  if (intent.type === 'group') {
    return intent.direction === 'row' ? 'Group as a row' : 'Group as a column'
  }
  const labels = {
    top: 'Dock as a row above',
    bottom: 'Dock as a row below',
    left: 'Dock as a column left',
    right: 'Dock as a column right',
  } as const
  return labels[intent.zone]
}

export function hitTestLayoutDropZone(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  options?: { precision?: boolean },
): DashboardLayoutDropZone {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  const precision = options?.precision ?? false
  const edge = precision ? 0.22 : 0.26
  const centerMin = precision ? 0.36 : 0.3
  const centerMax = precision ? 0.64 : 0.7

  if (x >= centerMin && x <= centerMax && y >= centerMin && y <= centerMax) return 'center'
  if (y < edge) return 'top'
  if (y > 1 - edge) return 'bottom'
  if (x < edge) return 'left'
  if (x > 1 - edge) return 'right'
  if (Math.abs(y - 0.5) > Math.abs(x - 0.5)) return y < 0.5 ? 'top' : 'bottom'
  return x < 0.5 ? 'left' : 'right'
}

function equalSizes(count: number): number[] {
  if (count <= 0) return []
  const each = Math.round((100 / count) * 100) / 100
  const sizes = Array.from({ length: count }, () => each)
  const sum = sizes.reduce((a, b) => a + b, 0)
  if (sizes.length) sizes[sizes.length - 1]! += 100 - sum
  return sizes
}

export function elementLayoutNode(elementId: string): DashboardBodyLayoutNode {
  return { kind: 'element', elementId }
}

/** Default body layout: body elements stacked vertically (full-width rows). */
export function buildDefaultBodyLayout(bodyElementIds: string[]): DashboardBodyLayoutNode | null {
  if (bodyElementIds.length === 0) return null
  if (bodyElementIds.length === 1) return elementLayoutNode(bodyElementIds[0]!)
  return {
    kind: 'split',
    direction: 'row',
    children: bodyElementIds.map(elementLayoutNode),
    sizes: equalSizes(bodyElementIds.length),
  }
}

export function collectLayoutElementIds(node: DashboardBodyLayoutNode | null | undefined): string[] {
  if (!node) return []
  if (node.kind === 'element') return [node.elementId]
  return node.children.flatMap(collectLayoutElementIds)
}

export function resolveBodyLayout(config: AgroCloudDashboardConfig): DashboardBodyLayoutNode | null {
  const bodyIds = getBodyElements(config.elements).map(el => el.id)
  if (bodyIds.length === 0) return null

  const stored = config.bodyLayout
  if (!stored) return buildDefaultBodyLayout(bodyIds)

  const layoutIds = collectLayoutElementIds(stored)
  const layoutIdSet = new Set(layoutIds)
  const hasDuplicateLayoutIds = layoutIds.length !== layoutIdSet.size
  const missing = bodyIds.filter(id => !layoutIdSet.has(id))
  const stale = layoutIds.filter(id => !bodyIds.includes(id))

  if (hasDuplicateLayoutIds) return buildDefaultBodyLayout(bodyIds)

  if (missing.length === 0 && stale.length === 0) return stored

  let next = stored
  for (const staleId of stale) next = removeElementFromBodyLayout(next, staleId)
  if (!next && bodyIds.length === 0) return null
  for (const id of missing) next = appendElementToBodyLayout(next, id)
  return next
}

export function appendElementToBodyLayout(
  layout: DashboardBodyLayoutNode | null,
  elementId: string,
): DashboardBodyLayoutNode {
  const incoming = elementLayoutNode(elementId)
  if (!layout) return incoming

  if (layout.kind === 'split' && layout.direction === 'row') {
    return {
      kind: 'split',
      direction: 'row',
      children: [...layout.children, incoming],
      sizes: equalSizes(layout.children.length + 1),
    }
  }

  return {
    kind: 'split',
    direction: 'row',
    children: [layout, incoming],
    sizes: [50, 50],
  }
}

function mapLayoutTree(
  node: DashboardBodyLayoutNode,
  elementId: string,
  mapper: (node: DashboardBodyLayoutNode, elementId: string) => DashboardBodyLayoutNode | null,
): DashboardBodyLayoutNode | null {
  if (node.kind === 'element') {
    if (node.elementId !== elementId) return node
    return mapper(node, elementId)
  }

  const children: DashboardBodyLayoutNode[] = []
  const sizes: number[] = []
  let changed = false

  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i]!
    const mapped = mapLayoutTree(child, elementId, mapper)
    if (mapped === null) {
      changed = true
      continue
    }
    if (mapped !== child) changed = true
    children.push(mapped)
    sizes.push(node.sizes[i] ?? equalSizes(node.children.length)[i] ?? 100 / node.children.length)
  }

  if (!changed) return node
  if (children.length === 0) return null
  if (children.length === 1) return children[0]!

  const normalizedSizes =
    sizes.length === children.length ? normalizeSizes(sizes) : equalSizes(children.length)

  if (node.kind === 'stack') {
    const activeIndex = Math.min(node.activeIndex, children.length - 1)
    return { kind: 'stack', children, activeIndex: Math.max(0, activeIndex) }
  }

  return { ...node, children, sizes: normalizedSizes }
}

function normalizeSizes(sizes: number[]): number[] {
  if (sizes.length === 0) return []
  const sum = sizes.reduce((a, b) => a + b, 0) || 100
  const scaled = sizes.map(s => (s / sum) * 100)
  const rounded = scaled.map(s => Math.round(s * 100) / 100)
  const drift = 100 - rounded.reduce((a, b) => a + b, 0)
  if (rounded.length) rounded[rounded.length - 1]! += drift
  return rounded
}

export function removeElementFromBodyLayout(
  layout: DashboardBodyLayoutNode | null,
  elementId: string,
): DashboardBodyLayoutNode | null {
  if (!layout) return null
  return mapLayoutTree(layout, elementId, () => null)
}

function wrapDock(
  target: DashboardBodyLayoutNode,
  incoming: DashboardBodyLayoutNode,
  zone: 'top' | 'bottom' | 'left' | 'right',
): DashboardBodyLayoutNode {
  const direction = zone === 'top' || zone === 'bottom' ? 'row' : 'column'
  const first = zone === 'top' || zone === 'left'
  return {
    kind: 'split',
    direction,
    children: first ? [incoming, target] : [target, incoming],
    sizes: [50, 50],
  }
}

function wrapStack(target: DashboardBodyLayoutNode, incoming: DashboardBodyLayoutNode): DashboardBodyLayoutNode {
  if (target.kind === 'stack') {
    return {
      kind: 'stack',
      children: [...target.children, incoming],
      activeIndex: target.activeIndex,
    }
  }
  return { kind: 'stack', children: [target, incoming], activeIndex: 0 }
}

function wrapGroup(
  target: DashboardBodyLayoutNode,
  incoming: DashboardBodyLayoutNode,
  direction: 'row' | 'column',
): DashboardBodyLayoutNode {
  if (target.kind === 'group' && target.direction === direction) {
    return {
      kind: 'group',
      direction,
      children: [...target.children, incoming],
      sizes: equalSizes(target.children.length + 1),
    }
  }
  return {
    kind: 'group',
    direction,
    children: [target, incoming],
    sizes: [50, 50],
  }
}

export function applyBodyLayoutDrop(
  layout: DashboardBodyLayoutNode | null,
  draggedElementId: string,
  targetElementId: string,
  intent: DashboardLayoutDropIntent,
): DashboardBodyLayoutNode | null {
  if (draggedElementId === targetElementId) return layout

  let tree = layout
  const draggedNode = elementLayoutNode(draggedElementId)
  tree = removeElementFromBodyLayout(tree, draggedElementId)

  if (!tree) return draggedNode

  let applied = false
  tree =
    mapLayoutTree(tree, targetElementId, target => {
      applied = true
      const incoming = draggedNode
      if (intent.type === 'dock') return wrapDock(target, incoming, intent.zone)
      if (intent.type === 'stack') return wrapStack(target, incoming)
      return wrapGroup(target, incoming, intent.direction)
    }) ?? null

  if (!applied) {
    tree = appendElementToBodyLayout(tree, draggedElementId)
  }

  return tree
}

export function applyBodyLayoutDropToConfig(
  config: AgroCloudDashboardConfig,
  draggedElementId: string,
  targetElementId: string,
  intent: DashboardLayoutDropIntent,
): AgroCloudDashboardConfig {
  const layout = resolveBodyLayout(config)
  const nextLayout = applyBodyLayoutDrop(layout, draggedElementId, targetElementId, intent)
  return { ...config, bodyLayout: nextLayout }
}

export function removeElementFromConfigLayout(
  config: AgroCloudDashboardConfig,
  elementId: string,
): AgroCloudDashboardConfig {
  const layout = resolveBodyLayout(config)
  return {
    ...config,
    bodyLayout: removeElementFromBodyLayout(layout, elementId),
  }
}

export function appendBodyElementToConfig(
  config: AgroCloudDashboardConfig,
  element: AgroCloudDashboardElement,
): AgroCloudDashboardConfig {
  const withElement = { ...config, elements: [...config.elements, element] }
  return {
    ...withElement,
    bodyLayout: resolveBodyLayout(withElement),
  }
}

export function duplicateElementInBodyLayout(
  layout: DashboardBodyLayoutNode | null,
  sourceElementId: string,
  cloneElementId: string,
): DashboardBodyLayoutNode | null {
  if (!layout) return elementLayoutNode(cloneElementId)

  let docked = false
  const next =
    mapLayoutTree(layout, sourceElementId, target => {
      docked = true
      return wrapDock(target, elementLayoutNode(cloneElementId), 'bottom')
    }) ?? layout

  if (!docked) return appendElementToBodyLayout(layout, cloneElementId)
  return next
}

export function bodyLayoutIsSingleMap(
  layout: DashboardBodyLayoutNode | null,
  elements: AgroCloudDashboardElement[],
): boolean {
  const ids = collectLayoutElementIds(layout)
  if (ids.length !== 1) return false
  const el = elements.find(e => e.id === ids[0])
  return el?.kind === 'map'
}
