import { useCallback, useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import type { Map as MapboxMap, StyleSpecification } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { setMapSwipeClip } from './siMapSwipeClip'
import { SiMapSwipeChrome } from './SiMapSwipeChrome'
import { useSiMapSwipeState } from './useSiMapSwipeState'
import './SiMapSwipeControl.css'

export type SiMapSwipeLayerOption = { id: string; label: string }

export type SiMapSwipeViewState = {
  longitude: number
  latitude: number
  zoom: number
  bearing?: number
  pitch?: number
}

export type SiMapSwipeCompareSides = {
  before: { layerId: string; sceneDate: string }
  after: { layerId: string; sceneDate: string }
}

type Props = {
  mapboxAccessToken: string
  /** Active MapGL style (basemap) — mirrored on the clipped After map. */
  mainMapStyle: StyleSpecification | string
  viewState: SiMapSwipeViewState
  /** Active AOI FeatureCollection — swipe stays off without it. */
  aoiClip: unknown
  hasAoi: boolean
  activeLayerId: string
  activeSceneDate: string
  cloudCoverage?: number
  layerOptions: readonly SiMapSwipeLayerOption[]
  /** Controlled open (map toolbox rail). When omitted, FAB owns open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Show floating Swipe FAB (default true). */
  showFab?: boolean
  /**
   * Before-side WMS tile URLs for React &lt;Source&gt; layers on the main SI MapGL
   * (basemap stays underneath). Cleared to [] when swipe closes.
   */
  onBeforeTilesChange?: (tileUrls: string[]) => void
  /** After-side WMS tile URLs, painted on the same main map and clipped at the divider. */
  onAfterTilesChange?: (tileUrls: string[]) => void
  /** Live Before/After layer·date for the Layer Live legend tabs. Null when swipe is closed. */
  onCompareSidesChange?: (sides: SiMapSwipeCompareSides | null) => void
  /** Optional AOI geometry for per-class areas inside the embedded Legend. */
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
  /** Live camera from the main SI map (updated on every move, not only moveend). */
  getLiveViewState?: () => SiMapSwipeViewState
  /** Native Mapbox map instance for the main SI MapGL — used to mirror pan/zoom to After. */
  getMainMap?: () => MapboxMap | null | undefined
}

/** Transparent Mapbox style — AOI WMS only; main SI basemap shows through. */
export const SI_MAP_SWIPE_TRANSPARENT_STYLE: StyleSpecification = {
  version: 8,
  name: 'si-map-swipe-transparent',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': 'rgba(0,0,0,0)',
        'background-opacity': 0,
      },
    },
  ],
}

/** Raster tile stack for the main SI MapGL (Before side). */
export function SiMapSwipeRasterLayers(props: { idPrefix: string; tileUrls: readonly string[] }) {
  const { idPrefix, tileUrls } = props
  if (!tileUrls.length) return null
  return (
    <>
      {tileUrls.map((url, i) => (
        <Source
          key={`${idPrefix}-src-${i}-${url.slice(0, 48)}`}
          id={`${idPrefix}-src-${i}`}
          type="raster"
          tiles={[url]}
          tileSize={256}
          maxzoom={18}
        >
          <Layer
            id={`${idPrefix}-lyr-${i}`}
            type="raster"
            paint={{
            'raster-opacity': 1,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          }}
          />
        </Source>
      ))}
    </>
  )
}

/**
 * MapSwipe chrome for Satellite Intelligence.
 * Before and After rasters both paint on the main MapGL. The After stack is
 * clipped at the divider on that same canvas, so 2D and 3D share one camera.
 */
export function SiMapSwipeControl({
  aoiClip,
  hasAoi,
  activeLayerId,
  activeSceneDate,
  cloudCoverage = 20,
  layerOptions,
  open: openControlled,
  onOpenChange,
  showFab = true,
  onBeforeTilesChange,
  onAfterTilesChange,
  onCompareSidesChange,
  aoiGeometry = null,
  getMainMap,
}: Props) {
  const [openUncontrolled, setOpenUncontrolled] = useState(false)
  const open = openControlled ?? openUncontrolled
  const setOpen = useCallback(
    (next: boolean) => {
      if (openControlled === undefined) setOpenUncontrolled(next)
      onOpenChange?.(next)
    },
    [openControlled, onOpenChange],
  )

  const swipe = useSiMapSwipeState({
    aoiClip,
    hasAoi,
    activeLayerId,
    activeSceneDate,
    cloudCoverage,
    layerOptions,
    open,
    setOpen,
    onBeforeTilesChange,
    onAfterTilesChange,
    onCompareSidesChange,
  })

  useEffect(() => {
    if (!open || !hasAoi) {
      setMapSwipeClip(getMainMap?.() ?? null, null)
      return
    }
    let frames = 0
    let raf = 0
    let cancelled = false
    const attach = () => {
      if (cancelled) return
      const map = getMainMap?.()
      if (!map) {
        if (frames < 40) {
          frames += 1
          raf = window.requestAnimationFrame(attach)
        }
        return
      }
      setMapSwipeClip(map, swipe.split)
    }
    attach()
    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [open, hasAoi, swipe.split, getMainMap])

  useEffect(() => {
    return () => {
      setMapSwipeClip(getMainMap?.() ?? null, null)
    }
  }, [getMainMap])

  const fabTitle = !hasAoi
    ? 'MapSwipe needs an AOI (draw or enable Layers AOI)'
    : open
      ? 'Close MapSwipe'
      : 'Open MapSwipe'

  return (
    <>
      {showFab ? (
        <button
          type="button"
          className={`si-map-swipe-fab${open ? ' is-on' : ''}${!hasAoi ? ' is-disabled' : ''}`}
          aria-label={fabTitle}
          title={fabTitle}
          aria-pressed={open}
          disabled={!hasAoi}
          data-map-overlay-isolate=""
          onClick={() => {
            if (!hasAoi) return
            setOpen(!open)
          }}
        >
          <span className="si-map-swipe-fab__icon" aria-hidden>
            ⇄
          </span>
          <span className="si-map-swipe-fab__label">Swipe</span>
        </button>
      ) : null}

      <SiMapSwipeChrome {...swipe} aoiGeometry={aoiGeometry} />
    </>
  )
}

export default SiMapSwipeControl
