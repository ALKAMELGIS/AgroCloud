import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { ImageOverlay, Map as LeafletMap, TileLayer } from 'leaflet'
import { SiMapSwipeChrome } from '@/modules/gis/map/SiMapSwipeChrome'
import { useSiMapSwipeState } from '@/modules/gis/map/useSiMapSwipeState'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import { SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM } from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import { createSentinelHubBboxTileLayer } from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import {
  developEliteCommittedAoiGeometry,
} from './developEliteImageryTimeSeriesAoi'
import {
  developEliteLayerLiveHasDrawnAoiClip,
  developEliteLayerLiveSelectOptions,
} from './developEliteMapLayerLiveCore'
import { useDevelopEliteMapLayerLive } from './DevelopEliteMapLayerLive'
import { resolveDevelopEliteLayerLiveAoiImageUrl } from './developEliteMapLayerLiveAoiImage'
import { useDevelopEliteMapInsight } from './DevelopEliteMapInsightTools'
import {
  developEliteSwipeBeforeClipPath,
  developEliteSwipeClipPath,
} from './developEliteMapInsight'

const SWIPE_BEFORE_PANE = 'develop-elite-swipe-before'
const SWIPE_AFTER_PANE = 'develop-elite-swipe-after'
const SWIPE_BEFORE_Z = 560
const SWIPE_AFTER_Z = 565

type MountedSwipeEntry =
  | { kind: 'image'; layer: ImageOverlay; signature: string }
  | { kind: 'tiles'; layer: TileLayer; signature: string }

function leafletBoundsFromLngLatBox(box: [number, number, number, number]): L.LatLngBounds {
  const [w, s, e, n] = box
  return L.latLngBounds([s, w], [n, e])
}

function clearMounted(map: LeafletMap, mounted: MountedSwipeEntry[]) {
  for (const entry of mounted) {
    map.removeLayer(entry.layer)
  }
}

function ensureSwipePane(map: LeafletMap, name: string, zIndex: number): HTMLElement {
  if (!map.getPane(name)) {
    map.createPane(name)
  }
  const pane = map.getPane(name)!
  pane.style.zIndex = String(zIndex)
  pane.style.pointerEvents = 'none'
  return pane
}

function mountSwipeTiles(
  map: LeafletMap,
  paneName: string,
  tileUrls: string[],
  clipSource: unknown,
  mounted: MountedSwipeEntry[],
): MountedSwipeEntry[] {
  clearMounted(map, mounted)
  if (!tileUrls.length) return []

  const signature = tileUrls.join('|')
  const bounds = resolveSiSentinelAoiWmsBoundsLngLat(clipSource)
  const next: MountedSwipeEntry[] = []

  if (bounds) {
    const imageUrl = resolveDevelopEliteLayerLiveAoiImageUrl(tileUrls[0]!, bounds)
    const overlay = L.imageOverlay(imageUrl, leafletBoundsFromLngLatBox(bounds), {
      pane: paneName,
      opacity: 0.92,
      interactive: false,
      className: 'develop-elite-map-swipe-aoi-image',
    })
    overlay.addTo(map)
    next.push({ kind: 'image', layer: overlay, signature: `img:${imageUrl}` })
  }

  const lat = map.getCenter().lat
  tileUrls.slice(bounds ? 1 : 0).forEach((url, offset) => {
    const layer = createSentinelHubBboxTileLayer(url, {
      pane: paneName,
      opacity: 0.92,
      stableDuringInteraction: false,
      minZoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
      latitudeDeg: lat,
      crossOrigin: null,
    })
    layer.addTo(map)
    next.push({ kind: 'tiles', layer, signature: `tile:${offset}:${url.slice(0, 48)}` })
  })

  if (!next.length && tileUrls[0]) {
    const layer = createSentinelHubBboxTileLayer(tileUrls[0], {
      pane: paneName,
      opacity: 0.92,
      stableDuringInteraction: false,
      minZoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
      latitudeDeg: lat,
      crossOrigin: null,
    })
    layer.addTo(map)
    next.push({ kind: 'tiles', layer, signature: `tile:0:${tileUrls[0].slice(0, 48)}` })
  }

  return next
}

export function DevelopEliteMapSwipeEngine() {
  const map = useMap()
  const insight = useDevelopEliteMapInsight()
  const draw = useDevelopEliteMapDraw()
  const layerLive = useDevelopEliteMapLayerLive()
  const host = map.getContainer()

  const open = insight?.tool === 'swipe'
  const setOpen = useCallback(
    (next: boolean) => {
      if (!insight) return
      if (!next && insight.tool === 'swipe') insight.toggleTool('swipe')
    },
    [insight],
  )

  const clipSource = draw?.clipGeoJson ?? null
  const hasAoi = developEliteLayerLiveHasDrawnAoiClip(clipSource)
  const layerOptions = useMemo(
    () => developEliteLayerLiveSelectOptions(layerLive.layerGroups),
    [layerLive.layerGroups],
  )

  const aoiGeometry = useMemo(
    () => developEliteCommittedAoiGeometry(clipSource),
    [clipSource],
  )

  const swipe = useSiMapSwipeState({
    aoiClip: clipSource,
    hasAoi,
    activeLayerId: layerLive.layerValue,
    activeSceneDate: layerLive.wmsDate,
    cloudCoverage: layerLive.cloudCoverage,
    layerOptions,
    open,
    setOpen,
  })

  const beforeMountedRef = useRef<MountedSwipeEntry[]>([])
  const afterMountedRef = useRef<MountedSwipeEntry[]>([])

  const applyPaneClips = useCallback(() => {
    const width = map.getSize().x
    const ratio = swipe.split / 100
    const beforePane = map.getPane(SWIPE_BEFORE_PANE)
    const afterPane = map.getPane(SWIPE_AFTER_PANE)
    if (beforePane) beforePane.style.clipPath = developEliteSwipeBeforeClipPath(width, ratio)
    if (afterPane) afterPane.style.clipPath = developEliteSwipeClipPath(width, ratio)
  }, [map, swipe.split])

  useEffect(() => {
    if (!open || !hasAoi) {
      clearMounted(map, beforeMountedRef.current)
      clearMounted(map, afterMountedRef.current)
      beforeMountedRef.current = []
      afterMountedRef.current = []
      const beforePane = map.getPane(SWIPE_BEFORE_PANE)
      const afterPane = map.getPane(SWIPE_AFTER_PANE)
      if (beforePane) beforePane.style.clipPath = ''
      if (afterPane) afterPane.style.clipPath = ''
      return
    }

    ensureSwipePane(map, SWIPE_BEFORE_PANE, SWIPE_BEFORE_Z)
    ensureSwipePane(map, SWIPE_AFTER_PANE, SWIPE_AFTER_Z)

    beforeMountedRef.current = mountSwipeTiles(
      map,
      SWIPE_BEFORE_PANE,
      swipe.beforeTiles,
      clipSource,
      beforeMountedRef.current,
    )
    afterMountedRef.current = mountSwipeTiles(
      map,
      SWIPE_AFTER_PANE,
      swipe.afterTiles,
      clipSource,
      afterMountedRef.current,
    )

    applyPaneClips()

    const onViewChange = () => applyPaneClips()
    map.on('move zoom resize', onViewChange)
    return () => {
      map.off('move zoom resize', onViewChange)
      clearMounted(map, beforeMountedRef.current)
      clearMounted(map, afterMountedRef.current)
      beforeMountedRef.current = []
      afterMountedRef.current = []
      const beforePane = map.getPane(SWIPE_BEFORE_PANE)
      const afterPane = map.getPane(SWIPE_AFTER_PANE)
      if (beforePane) beforePane.style.clipPath = ''
      if (afterPane) afterPane.style.clipPath = ''
    }
  }, [
    applyPaneClips,
    clipSource,
    hasAoi,
    map,
    open,
    swipe.afterTiles,
    swipe.beforeTiles,
  ])

  useEffect(() => {
    if (!open || !hasAoi) return
    applyPaneClips()
  }, [applyPaneClips, hasAoi, open, swipe.split])

  useEffect(() => {
    if (open && !hasAoi && insight) insight.toggleTool('swipe')
  }, [hasAoi, insight, open])

  if (!insight || !host) return null

  const stopMapEvent = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  return createPortal(
    <div
      className="develop-elite-map__swipe-chrome-host"
      onPointerDown={stopMapEvent}
      onClick={stopMapEvent}
      onDoubleClick={stopMapEvent}
    >
      <SiMapSwipeChrome {...swipe} aoiGeometry={aoiGeometry} />
    </div>,
    host,
  )
}
