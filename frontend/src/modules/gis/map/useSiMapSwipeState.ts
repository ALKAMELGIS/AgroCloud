import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  buildSiMapSwipeTileUrls,
  defaultSwipeBeforeDate,
  type SiMapSwipeMode,
} from './siMapSwipeTiles'
import type { SiMapSwipeCompareSides, SiMapSwipeLayerOption } from './SiMapSwipeControl'

export type UseSiMapSwipeStateArgs = {
  aoiClip: unknown
  hasAoi: boolean
  activeLayerId: string
  activeSceneDate: string
  cloudCoverage?: number
  layerOptions: readonly SiMapSwipeLayerOption[]
  open: boolean
  setOpen: (next: boolean) => void
  onBeforeTilesChange?: (tileUrls: string[]) => void
  onAfterTilesChange?: (tileUrls: string[]) => void
  onCompareSidesChange?: (sides: SiMapSwipeCompareSides | null) => void
}

export type SiMapSwipeChromeModel = {
  rootRef: RefObject<HTMLDivElement | null>
  open: boolean
  hasAoi: boolean
  setOpen: (next: boolean) => void
  mode: SiMapSwipeMode
  setMode: (mode: SiMapSwipeMode) => void
  split: number
  dragging: boolean
  beforeCfg: { layerId: string; sceneDate: string }
  afterCfg: { layerId: string; sceneDate: string }
  beforeTiles: string[]
  afterTiles: string[]
  layerSelectOptions: SiMapSwipeLayerOption[]
  showDateFields: boolean
  showLayerFields: boolean
  beforeLayer: string
  setBeforeLayer: (id: string) => void
  afterLayer: string
  setAfterLayer: (id: string) => void
  beforeDate: string
  setBeforeDate: (iso: string) => void
  afterDate: string
  setAfterDate: (iso: string) => void
  legendBeforeOpen: boolean
  setLegendBeforeOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  legendAfterOpen: boolean
  setLegendAfterOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  onHandlePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onHandlePointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onHandlePointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
  onSplitKey: (key: 'ArrowLeft' | 'ArrowRight') => void
}

export function useSiMapSwipeState({
  aoiClip,
  hasAoi,
  activeLayerId,
  activeSceneDate,
  cloudCoverage = 20,
  layerOptions,
  open,
  setOpen,
  onBeforeTilesChange,
  onAfterTilesChange,
  onCompareSidesChange,
}: UseSiMapSwipeStateArgs): SiMapSwipeChromeModel {
  const [mode, setMode] = useState<SiMapSwipeMode>('both')
  const [split, setSplit] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [legendBeforeOpen, setLegendBeforeOpen] = useState(false)
  const [legendAfterOpen, setLegendAfterOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const sceneIso = String(activeSceneDate || '').trim().slice(0, 10)
  const layerId = String(activeLayerId || '').trim() || 'NDVI'

  const [beforeDate, setBeforeDate] = useState(() => defaultSwipeBeforeDate(sceneIso) || sceneIso)
  const [afterDate, setAfterDate] = useState(() => sceneIso)
  const [beforeLayer, setBeforeLayer] = useState(layerId)
  const [afterLayer, setAfterLayer] = useState(layerId)

  useEffect(() => {
    if (open) return
    if (sceneIso) {
      setAfterDate(sceneIso)
      setBeforeDate(defaultSwipeBeforeDate(sceneIso) || sceneIso)
    }
    if (layerId) {
      setBeforeLayer(layerId)
      setAfterLayer(layerId)
    }
  }, [sceneIso, layerId, open])

  useEffect(() => {
    if (!hasAoi && open) setOpen(false)
  }, [hasAoi, open, setOpen])

  useEffect(() => {
    if (!open) {
      setLegendBeforeOpen(false)
      setLegendAfterOpen(false)
    }
  }, [open])

  const beforeCfg = useMemo(() => {
    if (mode === 'dates') return { layerId, sceneDate: beforeDate }
    if (mode === 'layers') return { layerId: beforeLayer, sceneDate: sceneIso }
    return { layerId: beforeLayer, sceneDate: beforeDate }
  }, [mode, layerId, beforeDate, beforeLayer, sceneIso])

  const afterCfg = useMemo(() => {
    if (mode === 'dates') return { layerId, sceneDate: afterDate }
    if (mode === 'layers') return { layerId: afterLayer, sceneDate: sceneIso }
    return { layerId: afterLayer, sceneDate: afterDate }
  }, [mode, layerId, afterDate, afterLayer, sceneIso])

  const beforeTiles = useMemo(
    () =>
      open && hasAoi
        ? buildSiMapSwipeTileUrls({
            clipSource: aoiClip,
            layerId: beforeCfg.layerId,
            sceneDate: beforeCfg.sceneDate,
            cloudCoverage,
          })
        : [],
    [open, hasAoi, aoiClip, beforeCfg.layerId, beforeCfg.sceneDate, cloudCoverage],
  )

  const afterTiles = useMemo(
    () =>
      open && hasAoi
        ? buildSiMapSwipeTileUrls({
            clipSource: aoiClip,
            layerId: afterCfg.layerId,
            sceneDate: afterCfg.sceneDate,
            cloudCoverage,
          })
        : [],
    [open, hasAoi, aoiClip, afterCfg.layerId, afterCfg.sceneDate, cloudCoverage],
  )

  useEffect(() => {
    onBeforeTilesChange?.(beforeTiles)
  }, [beforeTiles, onBeforeTilesChange])

  useEffect(() => {
    onAfterTilesChange?.(afterTiles)
  }, [afterTiles, onAfterTilesChange])

  useEffect(() => {
    if (!open || !hasAoi) {
      onCompareSidesChange?.(null)
      return
    }
    onCompareSidesChange?.({
      before: { layerId: beforeCfg.layerId, sceneDate: beforeCfg.sceneDate },
      after: { layerId: afterCfg.layerId, sceneDate: afterCfg.sceneDate },
    })
  }, [
    open,
    hasAoi,
    beforeCfg.layerId,
    beforeCfg.sceneDate,
    afterCfg.layerId,
    afterCfg.sceneDate,
    onCompareSidesChange,
  ])

  useEffect(() => {
    return () => {
      onBeforeTilesChange?.([])
      onAfterTilesChange?.([])
      onCompareSidesChange?.(null)
    }
  }, [onAfterTilesChange, onBeforeTilesChange, onCompareSidesChange])

  const setSplitFromClientX = useCallback((clientX: number) => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.max(5, Math.min(95, pct)))
  }, [])

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    setSplitFromClientX(e.clientX)
  }

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    e.preventDefault()
    setSplitFromClientX(e.clientX)
  }

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const layerSelectOptions = layerOptions.length ? [...layerOptions] : [{ id: layerId, label: layerId }]
  const showDateFields = mode === 'dates' || mode === 'both'
  const showLayerFields = mode === 'layers' || mode === 'both'

  const onSplitKey = (key: 'ArrowLeft' | 'ArrowRight') => {
    if (key === 'ArrowLeft') setSplit(s => Math.max(5, s - 2))
    if (key === 'ArrowRight') setSplit(s => Math.min(95, s + 2))
  }

  return {
    rootRef,
    open,
    hasAoi,
    setOpen,
    mode,
    setMode,
    split,
    dragging,
    beforeCfg,
    afterCfg,
    beforeTiles,
    afterTiles,
    layerSelectOptions,
    showDateFields,
    showLayerFields,
    beforeLayer,
    setBeforeLayer,
    afterLayer,
    setAfterLayer,
    beforeDate,
    setBeforeDate,
    afterDate,
    setAfterDate,
    legendBeforeOpen,
    setLegendBeforeOpen,
    legendAfterOpen,
    setLegendAfterOpen,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onSplitKey,
  }
}
