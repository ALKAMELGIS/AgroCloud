import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import type { BuilderSelectionFilter } from './builderStats'
import type { BuilderElementConfig } from './builderTypes'

/** A selection made in one element (selector value, chart bar, list item) that filters others. */
export type BuilderSelection = {
  sourceId: string
  field: string
  values: string[]
  targets: 'all' | string[]
}

type Ctx = {
  elements: Record<string, BuilderElementConfig>
  selections: Record<string, BuilderSelection>
  setSelection: (sourceId: string, selection: Omit<BuilderSelection, 'sourceId'> | null) => void
  clearSelections: () => void
}

const BuilderSelectionCtx = createContext<Ctx>({
  elements: {},
  selections: {},
  setSelection: () => undefined,
  clearSelections: () => undefined,
})

export function BuilderSelectionProvider({
  children,
  elements,
}: {
  children: ReactNode
  elements: Record<string, BuilderElementConfig>
}) {
  const [selections, setSelections] = useState<Record<string, BuilderSelection>>({})

  const setSelection = useCallback((sourceId: string, selection: Omit<BuilderSelection, 'sourceId'> | null) => {
    setSelections(prev => {
      const next = { ...prev }
      if (!selection || selection.values.length === 0) delete next[sourceId]
      else next[sourceId] = { ...selection, sourceId }
      return next
    })
  }, [])

  const clearSelections = useCallback(() => setSelections({}), [])

  const value = useMemo(
    () => ({ elements, selections, setSelection, clearSelections }),
    [clearSelections, elements, selections, setSelection],
  )
  return <BuilderSelectionCtx.Provider value={value}>{children}</BuilderSelectionCtx.Provider>
}

export function useBuilderSelections() {
  return useContext(BuilderSelectionCtx)
}

/**
 * Filters other elements have pushed onto `elementId` (its own selection never filters itself).
 * Targets and field are read from the source element's *current* settings, so editing its Actions
 * or category field applies to a selection that is already active; a removed source is ignored.
 */
export function builderFiltersFor(
  elementId: string,
  selections: Record<string, BuilderSelection>,
  elements?: Record<string, BuilderElementConfig>,
): BuilderSelectionFilter[] {
  const out: BuilderSelectionFilter[] = []
  for (const s of Object.values(selections)) {
    if (s.sourceId === elementId) continue
    const source = elements?.[s.sourceId]
    if (elements && (!source || source.categoryField !== s.field)) continue
    const targets = source ? source.actionTargets : s.targets
    if (targets === 'none') continue
    if (targets !== 'all' && !targets.includes(elementId)) continue
    out.push({ field: s.field, values: s.values })
  }
  return out
}
