import { createContext, useContext, type ReactNode } from 'react'
import type { GeoExplorerMapLink } from '../../../lib/geoExplorerGemini'
import type {
  GisSelectionHit,
  GisSelectionLayerSource,
  GisSelectionSetMode,
  GisSelectionTool,
} from '../../../lib/gisSelection/types'
import type { MapSelectionOverlapState } from '../../../lib/gisSelection/mapSelectionQuery'

export type GisSelectionContextValue = {
  active: boolean
  tool: GisSelectionTool
  setMode: GisSelectionSetMode
  hits: GisSelectionHit[]
  layers: GisSelectionLayerSource[]
  selectableLayerIds: Set<string>
  overlapState: MapSelectionOverlapState
  setActive: (active: boolean) => void
  setTool: (tool: GisSelectionTool) => void
  setSetMode: (mode: GisSelectionSetMode) => void
  setSelectableLayerIds: (ids: Set<string>) => void
  applyHits: (incoming: GisSelectionHit[], opts?: { fitBounds?: boolean; mode?: GisSelectionSetMode }) => void
  clearSelection: () => void
  syncMapHighlight: (links: GeoExplorerMapLink[]) => void
  zoomToSelection: () => void
  exportSelection: () => void
  selectAtMapPoint: (lng: number, lat: number, clickEv?: MouseEvent | null) => void
  setOverlapState: (state: MapSelectionOverlapState) => void
}

const GisSelectionContext = createContext<GisSelectionContextValue | null>(null)

export function GisSelectionProvider({
  value,
  children,
}: {
  value: GisSelectionContextValue
  children: ReactNode
}) {
  return <GisSelectionContext.Provider value={value}>{children}</GisSelectionContext.Provider>
}

export function useGisSelection(): GisSelectionContextValue {
  const ctx = useContext(GisSelectionContext)
  if (!ctx) {
    throw new Error('useGisSelection must be used within GisSelectionProvider')
  }
  return ctx
}

export function useGisSelectionOptional(): GisSelectionContextValue | null {
  return useContext(GisSelectionContext)
}
