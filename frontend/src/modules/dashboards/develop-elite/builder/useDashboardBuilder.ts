import { useCallback, useEffect, useRef } from 'react'

import { applyGridCardDrop } from '../developEliteGridEngine'
import {
  DEVELOP_ELITE_GRID_COLS,
  isDevelopEliteNarrowGridBreakpoint,
  type DevelopEliteGridBreakpoint,
  type DevelopEliteGridLayoutItem,
  type DevelopEliteResponsiveGridLayouts,
} from '../developEliteGridLayout'
import type { DevelopEliteLayoutConfig } from '../developEliteLayoutConfig'
import {
  builderElementKind,
  createBuilderElement,
  isBuilderElementId,
  newBuilderElementId,
  type BuilderElementConfig,
  type BuilderElementType,
} from './builderTypes'

type LayoutPatch =
  | Partial<DevelopEliteLayoutConfig>
  | ((prev: DevelopEliteLayoutConfig) => Partial<DevelopEliteLayoutConfig>)

type Args = {
  gridLayouts: DevelopEliteResponsiveGridLayouts
  nudgeLayout: (patch: LayoutPatch) => void
  commitLayoutPatch: (patch?: LayoutPatch) => void
  onSelect: (id: string | null) => void
}

const BPS = Object.keys(DEVELOP_ELITE_GRID_COLS) as DevelopEliteGridBreakpoint[]

function maxRow(items: DevelopEliteGridLayoutItem[]): number {
  return items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
}

function bpForCols(cols: number): DevelopEliteGridBreakpoint | null {
  return BPS.find(bp => DEVELOP_ELITE_GRID_COLS[bp] === cols) ?? null
}

/**
 * Place a new element on every desktop breakpoint: at the drop cell on the breakpoint it was
 * dropped on, at the end elsewhere. Phone/tablet presets stack builder elements automatically.
 */
export function placeBuilderElement(
  layouts: DevelopEliteResponsiveGridLayouts,
  id: string,
  type: BuilderElementType,
  drop?: { x: number; y: number; w: number; h: number; cols: number },
  template?: DevelopEliteGridLayoutItem,
): DevelopEliteResponsiveGridLayouts {
  const kind = builderElementKind(type)
  const dropBp = drop ? bpForCols(drop.cols) : null
  const next: DevelopEliteResponsiveGridLayouts = { ...layouts }
  for (const bp of BPS) {
    const cols = DEVELOP_ELITE_GRID_COLS[bp]
    const base = layouts[bp] ?? []
    if (isDevelopEliteNarrowGridBreakpoint(bp)) {
      next[bp] = [...base, { i: id, x: 0, y: maxRow(base), w: cols, h: template?.h ?? kind.h, minW: 1, minH: 2 }]
      continue
    }
    const scale = cols / DEVELOP_ELITE_GRID_COLS.lg
    const w = Math.max(2, Math.min(cols, Math.round((template?.w ?? kind.w) * scale)))
    const h = template?.h ?? kind.h
    const item: DevelopEliteGridLayoutItem =
      drop && dropBp === bp
        ? { i: id, x: Math.min(drop.x, cols - drop.w), y: drop.y, w: drop.w, h: drop.h, minW: 2, minH: 2 }
        : template
          ? { i: id, x: Math.min(template.x, cols - w), y: template.y + template.h, w, h, minW: 2, minH: 2 }
          : { i: id, x: 0, y: maxRow(base), w, h, minW: 2, minH: 2 }
    next[bp] = applyGridCardDrop([...base, item], item, cols)
  }
  return next
}

export function removeFromLayouts(layouts: DevelopEliteResponsiveGridLayouts, id: string): DevelopEliteResponsiveGridLayouts {
  const next: DevelopEliteResponsiveGridLayouts = {}
  for (const bp of BPS) next[bp] = (layouts[bp] ?? []).filter(item => item.i !== id)
  return next
}

/** Add / edit / duplicate / delete builder elements; all changes go through the layout undo stack. */
export function useDashboardBuilder({ gridLayouts, nudgeLayout, commitLayoutPatch, onSelect }: Args) {
  const commitTimer = useRef<number | null>(null)
  const layoutsRef = useRef(gridLayouts)
  layoutsRef.current = gridLayouts

  useEffect(
    () => () => {
      if (commitTimer.current != null) window.clearTimeout(commitTimer.current)
    },
    [],
  )

  const flush = useCallback(() => {
    if (commitTimer.current == null) return
    window.clearTimeout(commitTimer.current)
    commitTimer.current = null
    commitLayoutPatch()
  }, [commitLayoutPatch])

  const addElement = useCallback(
    (type: BuilderElementType, drop?: { x: number; y: number; w: number; h: number; cols: number }) => {
      flush()
      const el = createBuilderElement(type)
      commitLayoutPatch(prev => ({
        builderElements: { ...(prev.builderElements ?? {}), [el.id]: el },
        gridLayouts: placeBuilderElement(layoutsRef.current, el.id, type, drop),
      }))
      onSelect(el.id)
      return el.id
    },
    [commitLayoutPatch, flush, onSelect],
  )

  /** Live edit (instant on screen); saved + undoable after a short pause in typing. */
  const updateElement = useCallback(
    (id: string, patch: Partial<BuilderElementConfig>) => {
      nudgeLayout(prev => {
        const cur = prev.builderElements?.[id]
        if (!cur) return {}
        return { builderElements: { ...prev.builderElements, [id]: { ...cur, ...patch, id, type: cur.type } } }
      })
      if (commitTimer.current != null) window.clearTimeout(commitTimer.current)
      commitTimer.current = window.setTimeout(() => {
        commitTimer.current = null
        commitLayoutPatch()
      }, 450)
    },
    [commitLayoutPatch, nudgeLayout],
  )

  const duplicateElement = useCallback(
    (id: string): boolean => {
      if (!isBuilderElementId(id)) return false
      flush()
      const copyId = newBuilderElementId()
      commitLayoutPatch(prev => {
        const src = prev.builderElements?.[id]
        if (!src) return {}
        const copy: BuilderElementConfig = { ...structuredClone(src), id: copyId, title: `${src.title} (copy)` }
        const lg = layoutsRef.current.lg?.find(it => it.i === id)
        return {
          builderElements: { ...prev.builderElements, [copyId]: copy },
          gridLayouts: placeBuilderElement(layoutsRef.current, copyId, src.type, undefined, lg),
        }
      })
      onSelect(copyId)
      return true
    },
    [commitLayoutPatch, flush, onSelect],
  )

  const deleteElement = useCallback(
    (id: string): boolean => {
      if (!isBuilderElementId(id)) return false
      flush()
      commitLayoutPatch(prev => {
        const rest = { ...(prev.builderElements ?? {}) }
        delete rest[id]
        // Selections/targets pointing at the removed element are dropped.
        for (const [key, el] of Object.entries(rest)) {
          if (Array.isArray(el.actionTargets) && el.actionTargets.includes(id)) {
            rest[key] = { ...el, actionTargets: el.actionTargets.filter(t => t !== id) }
          }
        }
        return { builderElements: rest, gridLayouts: removeFromLayouts(layoutsRef.current, id) }
      })
      onSelect(null)
      return true
    },
    [commitLayoutPatch, flush, onSelect],
  )

  const restoreBuiltIn = useCallback(
    (widgetId: string) => {
      flush()
      commitLayoutPatch(prev => ({ gridHiddenWidgets: (prev.gridHiddenWidgets ?? []).filter(id => id !== widgetId) }))
      onSelect(widgetId)
    },
    [commitLayoutPatch, flush, onSelect],
  )

  return { addElement, updateElement, duplicateElement, deleteElement, restoreBuiltIn, flush }
}
