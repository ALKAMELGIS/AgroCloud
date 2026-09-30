import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import type { Map as MapboxMap, StyleSpecification } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { setMapSwipeClip } from './siMapSwipeClip'
import {
  buildSiMapSwipeTileUrls,
  defaultSwipeBeforeDate,
  type SiMapSwipeMode,
} from './siMapSwipeTiles'
import { LayerLiveLegendPanel } from '@/modules/remote-sensing/indices/LayerLiveLegendPanel'
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
      setMapSwipeClip(map, split)
    }
    attach()
    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [open, hasAoi, split, getMainMap])

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
      setMapSwipeClip(getMainMap?.() ?? null, null)
    }
  }, [onBeforeTilesChange, onAfterTilesChange, onCompareSidesChange, getMainMap])

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

  const fabTitle = !hasAoi
    ? 'MapSwipe needs an AOI (draw or enable Layers AOI)'
    : open
      ? 'Close MapSwipe'
      : 'Open MapSwipe'

  const layerSelectOptions = layerOptions.length
    ? layerOptions
    : [{ id: layerId, label: layerId }]

  const showDateFields = mode === 'dates' || mode === 'both'
  const showLayerFields = mode === 'layers' || mode === 'both'

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

      {open && hasAoi ? (
        <div
          className="si-map-swipe-overlay"
          ref={rootRef}
          role="dialog"
          aria-label="Map swipe compare"
        >
          <div className="si-map-swipe-overlay__maps">
            <div
              className={`si-map-swipe-overlay__handle${dragging ? ' is-dragging' : ''}`}
              style={{ left: `${split}%` }}
              role="slider"
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuenow={Math.round(split)}
              aria-label="Swipe position"
              tabIndex={0}
              data-map-overlay-isolate=""
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft') setSplit(s => Math.max(5, s - 2))
                if (e.key === 'ArrowRight') setSplit(s => Math.min(95, s + 2))
              }}
            >
              <span className="si-map-swipe-overlay__handle-line" aria-hidden />
              <span className="si-map-swipe-overlay__handle-knob" aria-hidden />
            </div>
          </div>

          {/* Per-side color keys — sit on Before (left) / After (right) of the swipe. */}
          <div
            className="si-map-swipe-overlay__legend-slot si-map-swipe-overlay__legend-slot--before"
            style={{ width: `${split}%` }}
            data-map-overlay-isolate=""
          >
            <button
              type="button"
              className={`si-map-swipe-overlay__legend-fab${legendBeforeOpen ? ' is-on' : ''}`}
              aria-pressed={legendBeforeOpen}
              aria-label={legendBeforeOpen ? 'Hide Before color key' : 'Show Before color key'}
              title={legendBeforeOpen ? 'Hide Before legend' : 'Before legend'}
              onClick={() => setLegendBeforeOpen(v => !v)}
            >
              <i className="fa-solid fa-palette" aria-hidden />
            </button>
            {legendBeforeOpen ? (
              <div className="si-map-swipe-overlay__legend-card" role="dialog" aria-label="Before color key">
                <div className="si-map-swipe-overlay__legend-card-head">
                  <span>
                    Before
                    <em>
                      {beforeCfg.layerId}
                      {beforeCfg.sceneDate ? ` · ${beforeCfg.sceneDate}` : ''}
                    </em>
                  </span>
                  <button
                    type="button"
                    aria-label="Close Before legend"
                    onClick={() => setLegendBeforeOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="si-map-swipe-overlay__legend-card-body">
                  <LayerLiveLegendPanel
                    key={`swipe-legend-before-${beforeCfg.layerId}-${beforeCfg.sceneDate}`}
                    layerOptions={layerSelectOptions}
                    activeLayerId={beforeCfg.layerId}
                    sceneDate={beforeCfg.sceneDate}
                    aoiGeometry={aoiGeometry}
                    activeOnly
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="si-map-swipe-overlay__legend-slot si-map-swipe-overlay__legend-slot--after"
            style={{ width: `${100 - split}%` }}
            data-map-overlay-isolate=""
          >
            <button
              type="button"
              className={`si-map-swipe-overlay__legend-fab${legendAfterOpen ? ' is-on' : ''}`}
              aria-pressed={legendAfterOpen}
              aria-label={legendAfterOpen ? 'Hide After color key' : 'Show After color key'}
              title={legendAfterOpen ? 'Hide After legend' : 'After legend'}
              onClick={() => setLegendAfterOpen(v => !v)}
            >
              <i className="fa-solid fa-palette" aria-hidden />
            </button>
            {legendAfterOpen ? (
              <div className="si-map-swipe-overlay__legend-card" role="dialog" aria-label="After color key">
                <div className="si-map-swipe-overlay__legend-card-head">
                  <span>
                    After
                    <em>
                      {afterCfg.layerId}
                      {afterCfg.sceneDate ? ` · ${afterCfg.sceneDate}` : ''}
                    </em>
                  </span>
                  <button
                    type="button"
                    aria-label="Close After legend"
                    onClick={() => setLegendAfterOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="si-map-swipe-overlay__legend-card-body">
                  <LayerLiveLegendPanel
                    key={`swipe-legend-after-${afterCfg.layerId}-${afterCfg.sceneDate}`}
                    layerOptions={layerSelectOptions}
                    activeLayerId={afterCfg.layerId}
                    sceneDate={afterCfg.sceneDate}
                    aoiGeometry={aoiGeometry}
                    activeOnly
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="si-map-swipe-panel" data-map-overlay-isolate="">
            <div className="si-map-swipe-panel__row">
              <div className="si-map-swipe-panel__seg" role="group" aria-label="Compare mode">
                <button
                  type="button"
                  className={mode === 'both' ? 'is-on' : undefined}
                  onClick={() => setMode('both')}
                >
                  Both
                </button>
                <button
                  type="button"
                  className={mode === 'dates' ? 'is-on' : undefined}
                  onClick={() => setMode('dates')}
                >
                  Dates
                </button>
                <button
                  type="button"
                  className={mode === 'layers' ? 'is-on' : undefined}
                  onClick={() => setMode('layers')}
                >
                  Layers
                </button>
              </div>
              <div className="si-map-swipe-panel__actions">
                <button
                  type="button"
                  className="si-map-swipe-panel__close"
                  aria-label="Close MapSwipe"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={`si-map-swipe-panel__grid${mode === 'both' ? ' is-both' : ''}`}>
              {showLayerFields ? (
                <>
                  <label>
                    <span>Before layer</span>
                    <select value={beforeLayer} onChange={e => setBeforeLayer(e.target.value)}>
                      {layerSelectOptions.map(o => (
                        <option key={`b-lyr-${o.id}`} value={o.id}>
                          {o.label || o.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>After layer</span>
                    <select value={afterLayer} onChange={e => setAfterLayer(e.target.value)}>
                      {layerSelectOptions.map(o => (
                        <option key={`a-lyr-${o.id}`} value={o.id}>
                          {o.label || o.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {showDateFields ? (
                <>
                  <label>
                    <span>Before date</span>
                    <input
                      type="date"
                      value={beforeDate}
                      onChange={e => setBeforeDate(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>After date</span>
                    <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} />
                  </label>
                </>
              ) : null}
            </div>

            {!beforeTiles.length || !afterTiles.length ? (
              <p className="si-map-swipe-panel__hint" role="status">
                Waiting for WMS tiles… check AOI, date, and layer.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SiMapSwipeControl
