import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D } from './developEliteMapViewport'

export type DevelopEliteMapLibreContextValue = {
  mapRef: RefObject<MaplibreMap | null>
  mapReady: boolean
  viewMode3d: boolean
  setViewMode3d: (on: boolean) => void
  toggleViewMode3d: () => void
  registerMap: (map: MaplibreMap | null) => void
}

const DevelopEliteMapLibreContext = createContext<DevelopEliteMapLibreContextValue | null>(null)

export function DevelopEliteMapLibreProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<MaplibreMap | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [viewMode3d, setViewMode3dState] = useState(() => DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
  const setViewMode3d = useCallback((on: boolean) => {
    setViewMode3dState(on)
  }, [])

  const registerMap = useCallback((map: MaplibreMap | null) => {
    mapRef.current = map
    setMapReady(Boolean(map))
  }, [])

  const toggleViewMode3d = useCallback(() => {
    setViewMode3dState(prev => !prev)
  }, [])

  const value = useMemo(
    () => ({
      mapRef,
      mapReady,
      viewMode3d,
      setViewMode3d,
      toggleViewMode3d,
      registerMap,
    }),
    [mapReady, registerMap, setViewMode3d, toggleViewMode3d, viewMode3d],
  )

  return <DevelopEliteMapLibreContext.Provider value={value}>{children}</DevelopEliteMapLibreContext.Provider>
}

export function useDevelopEliteMapLibre(): DevelopEliteMapLibreContextValue {
  const ctx = useContext(DevelopEliteMapLibreContext)
  if (!ctx) throw new Error('useDevelopEliteMapLibre must be used within DevelopEliteMapLibreProvider')
  return ctx
}

export function useDevelopEliteMapLibreOptional(): DevelopEliteMapLibreContextValue | null {
  return useContext(DevelopEliteMapLibreContext)
}
