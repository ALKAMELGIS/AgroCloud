import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  developEliteLayoutCssProperties,
  normalizeDevelopEliteLayout,
  type DevelopEliteLayoutConfig,
} from './developEliteLayoutConfig'
import type { DevelopEliteDashboardConfig } from './developEliteDashboardConfig'
import { DEFAULT_DEVELOP_ELITE_LAYOUT, repairDevelopEliteLayout } from './developEliteLayoutConfig'

type LayoutPatch =
  | Partial<DevelopEliteLayoutConfig>
  | ((prev: DevelopEliteLayoutConfig) => Partial<DevelopEliteLayoutConfig>)

const LAYOUT_UNDO_MAX = 40

function cloneDevelopEliteLayout(layout: DevelopEliteLayoutConfig): DevelopEliteLayoutConfig {
  return normalizeDevelopEliteLayout(structuredClone(layout))
}

export function notifyDevelopEliteLayoutChanged(): void {
  window.dispatchEvent(new Event('develop-elite-layout-changed'))
}

export function notifyDevelopEliteGridDrag(active: boolean): void {
  window.dispatchEvent(new CustomEvent('develop-elite-grid-drag', { detail: { active } }))
}

export function useDevelopEliteLiveLayout(
  configLayout: DevelopEliteLayoutConfig,
  patchConfig: (patch: Partial<DevelopEliteDashboardConfig>) => void,
) {
  const [layout, setLayout] = useState(() => normalizeDevelopEliteLayout(configLayout))
  const lastCommittedRef = useRef(cloneDevelopEliteLayout(normalizeDevelopEliteLayout(configLayout)))
  const undoStackRef = useRef<DevelopEliteLayoutConfig[]>([])

  useEffect(() => {
    const normalized = normalizeDevelopEliteLayout(configLayout)
    setLayout(normalized)
    lastCommittedRef.current = cloneDevelopEliteLayout(normalized)
    undoStackRef.current = []
  }, [configLayout])

  const layoutStyle = useMemo(() => developEliteLayoutCssProperties(layout), [layout])

  const nudgeLayout = useCallback((patch: LayoutPatch) => {
    setLayout(prev => {
      const delta = typeof patch === 'function' ? patch(prev) : patch
      return normalizeDevelopEliteLayout({ ...prev, ...delta })
    })
  }, [])

  const persistLayout = useCallback(() => {
    setLayout(current => {
      const next = normalizeDevelopEliteLayout(current)
      undoStackRef.current.push(cloneDevelopEliteLayout(lastCommittedRef.current))
      if (undoStackRef.current.length > LAYOUT_UNDO_MAX) undoStackRef.current.shift()
      lastCommittedRef.current = cloneDevelopEliteLayout(next)
      patchConfig({ layout: next })
      notifyDevelopEliteLayoutChanged()
      return next
    })
  }, [patchConfig])

  const undoLayout = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return false
    const prev = stack.pop()!
    lastCommittedRef.current = cloneDevelopEliteLayout(prev)
    const normalized = cloneDevelopEliteLayout(prev)
    setLayout(normalized)
    patchConfig({ layout: normalized })
    notifyDevelopEliteLayoutChanged()
    return true
  }, [patchConfig])

  const resetLayout = useCallback(() => {
    const next = repairDevelopEliteLayout(DEFAULT_DEVELOP_ELITE_LAYOUT)
    lastCommittedRef.current = cloneDevelopEliteLayout(next)
    undoStackRef.current = []
    setLayout(next)
    patchConfig({ layout: next })
    notifyDevelopEliteLayoutChanged()
  }, [patchConfig])

  return { layout, layoutStyle, nudgeLayout, persistLayout, resetLayout, undoLayout }
}
