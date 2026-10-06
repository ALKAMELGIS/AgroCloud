import { createContext, useContext } from 'react'
import type { RemoteSensingLayerSelectGroup } from '@/modules/remote-sensing/indices/agroCompositeIndices'

export type DevelopEliteMapLayerLiveContextValue = {
  clipSource: unknown
  wmsDate: string
  onWmsDateChange: (iso: string) => void
  onResetImageryDateAuto: () => void
  imageryDateAutoFollow: boolean
  isFetchingSentinelScenes: boolean
  layerGroups: RemoteSensingLayerSelectGroup[]
  layerValue: string
  onLayerChange: (layerId: string) => void
  isLoadingLayers: boolean
  layerLiveActive: boolean
  hasDrawnAoiClip: boolean
  onToggleLayerLive: () => void
  activateLayerLive: () => void
  layerLiveTitle: string
  layerLiveStatus: string
  setLayerLiveStatus: (message: string) => void
  cloudCoverage: number
  onCloudCoverageChange: (value: number) => void
}

export const DevelopEliteMapLayerLiveContext =
  createContext<DevelopEliteMapLayerLiveContextValue | null>(null)

export function useDevelopEliteMapLayerLiveOptional(): DevelopEliteMapLayerLiveContextValue | null {
  return useContext(DevelopEliteMapLayerLiveContext)
}

export function useDevelopEliteMapLayerLive(): DevelopEliteMapLayerLiveContextValue {
  const ctx = useContext(DevelopEliteMapLayerLiveContext)
  if (!ctx) {
    throw new Error('useDevelopEliteMapLayerLive must be used within DevelopEliteMapLayerLiveProvider')
  }
  return ctx
}
