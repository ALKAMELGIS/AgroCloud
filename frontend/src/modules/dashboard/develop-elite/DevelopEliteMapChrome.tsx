import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

export type DevelopEliteMapPanelId = 'search' | 'layers' | 'satellite' | 'basemap'

type DevelopEliteMapChromeApi = {
  openMapPanel: (id: DevelopEliteMapPanelId) => void
  registerMapPanelOpener: (open: (id: DevelopEliteMapPanelId) => void) => void
}

const DevelopEliteMapChromeContext = createContext<DevelopEliteMapChromeApi | null>(null)

export function DevelopEliteMapChromeProvider({ children }: { children: ReactNode }) {
  const openerRef = useRef<((id: DevelopEliteMapPanelId) => void) | null>(null)

  const registerMapPanelOpener = useCallback((open: (id: DevelopEliteMapPanelId) => void) => {
    openerRef.current = open
  }, [])

  const openMapPanel = useCallback((id: DevelopEliteMapPanelId) => {
    openerRef.current?.(id)
  }, [])

  return (
    <DevelopEliteMapChromeContext.Provider value={{ openMapPanel, registerMapPanelOpener }}>
      {children}
    </DevelopEliteMapChromeContext.Provider>
  )
}

export function useDevelopEliteMapChrome(): DevelopEliteMapChromeApi | null {
  return useContext(DevelopEliteMapChromeContext)
}
