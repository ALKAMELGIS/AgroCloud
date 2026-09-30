import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import { contourElevationMapboxColorExpression } from '../spatial-analysis/hydro-watershed/hydroEngine'
import { placeSiCutFillLayersInsideAoi } from '@/modules/remote-sensing/imagery/siMapAnalysisLayerOrder'
import { buildCutFillAoiRaster } from './cutFillAoiRaster'
import { buildCutFillProfile, buildCutFillProfileChart, cutFillProfileLine } from './cutFillProfile'
import { buildCutFillClassPolygons } from './cutFillClassPolygons'
import { encodeRgbaPng } from './cutFillGeoTiffPreview'
import { CUT_FILL_MAP_SWATCH, buildCutFillClassMasks } from './cutFillRasterPreview'
import type { CutFillCellType, CutFillSummary } from './cutFillTypes'
import { CutFillProfileChart } from './CutFillProfileChart'
import { SiMapDockAwareMarker } from '../map/SiMapDockAwareMarker'
import type { CutFillLayerVisibility, UseCutFillAnalysisReturn } from './useCutFillAnalysis'
import './CutFillMapLegend.css'

type Props = {
  cutFill: UseCutFillAnalysisReturn
}

type ClassKey = 'cut' | 'fill' | 'noChange'

const CLASS_ROWS: Array<{
  key: ClassKey
  type: CutFillCellType
  label: string
  hint: string
  swatch: string
}> = [
  { key: 'cut', type: 'CUT', label: 'CUT', hint: 'Excavation / material removal', swatch: CUT_FILL_MAP_SWATCH.CUT },
  { key: 'fill', type: 'FILL', label: 'FILL', hint: 'Fill / material addition', swatch: CUT_FILL_MAP_SWATCH.FILL },
  {
    key: 'noChange',
    type: 'NO_CHANGE',
    label: 'NO CHANGE',
    hint: 'Within vertical tolerance',
    swatch: CUT_FILL_MAP_SWATCH.NO_CHANGE,
  },
]

function classVisible(layers: CutFillLayerVisibility, key: ClassKey): boolean {
  return layers[key] !== false
}

function ha(m2: number): string {
  return (m2 / 10_000).toFixed(2)
}

function fmtM(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

function fmtVol(m3: number): string {
  return Number.isFinite(m3) ? Math.round(m3).toLocaleString('en-US') : '—'
}

const LEGEND_GEOM_LS = 'si-cutfill-legend-geom-v3'
const LEGEND_DEFAULT_W = 274
const LEGEND_MIN_W = 220
const LEGEND_MAX_W = 720
const LEGEND_MIN_H = 150
const VIEWPORT_PAD = 8

/** Viewport-fixed card geometry; `h: null` sizes the card to its content. */
type LegendGeom = { x: number; y: number; w: number; h: number | null }

function readLegendGeom(): LegendGeom | null {
  try {
    const raw = localStorage.getItem(LEGEND_GEOM_LS)
    if (!raw) return null
    const g = JSON.parse(raw) as Partial<LegendGeom>
    if (![g.x, g.y, g.w].every(v => typeof v === 'number' && Number.isFinite(v))) return null
    const h = typeof g.h === 'number' && Number.isFinite(g.h) ? g.h : null
    return { x: g.x as number, y: g.y as number, w: g.w as number, h }
  } catch {
    return null
  }
}

function writeLegendGeom(g: LegendGeom | null): void {
  try {
    if (g) localStorage.setItem(LEGEND_GEOM_LS, JSON.stringify(g))
    else localStorage.removeItem(LEGEND_GEOM_LS)
  } catch {
    /* ignore */
  }
}

type LegendBounds = { left: number; top: number; right: number; bottom: number }

/** Map area clipped to the viewport, so the card never slides under the sticky app header. */
function legendBounds(container: HTMLElement | null): LegendBounds {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const r = container?.getBoundingClientRect()
  const b =
    r && r.width > 0 && r.height > 0
      ? { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(vw, r.right), bottom: Math.min(vh, r.bottom) }
      : { left: 0, top: 0, right: vw, bottom: vh }
  return {
    left: b.left + VIEWPORT_PAD,
    top: b.top + VIEWPORT_PAD,
    right: b.right - VIEWPORT_PAD,
    bottom: b.bottom - VIEWPORT_PAD,
  }
}

function clampLegendGeom(g: LegendGeom, renderedH: number, b: LegendBounds): LegendGeom {
  const availW = Math.max(LEGEND_MIN_W, b.right - b.left)
  const availH = Math.max(LEGEND_MIN_H, b.bottom - b.top)
  const w = Math.max(LEGEND_MIN_W, Math.min(LEGEND_MAX_W, availW, g.w))
  const h = g.h == null ? null : Math.max(LEGEND_MIN_H, Math.min(availH, g.h))
  const effH = Math.min(h ?? renderedH, availH)
  const x = Math.max(b.left, Math.min(b.right - w, g.x))
  const y = Math.max(b.top, Math.min(b.bottom - effH, g.y))
  return { x, y, w, h }
}

/** Default layout: content-height card docked to the map's bottom-left corner. */
function defaultLegendGeom(b: LegendBounds, renderedH: number): LegendGeom {
  return clampLegendGeom({ x: b.left, y: b.bottom - renderedH, w: LEGEND_DEFAULT_W, h: null }, renderedH, b)
}

function CutFillEarthworkSummary({ summary }: { summary: CutFillSummary }) {
  const net = summary.netVolumeM3
  const total = summary.cutVolumeM3 + summary.fillVolumeM3
  const cutShare = total > 0 ? (summary.cutVolumeM3 / total) * 100 : 50
  const balance = !Number.isFinite(net) || Math.abs(net) < 0.5 ? 'balanced' : net < 0 ? 'import' : 'surplus'
  const balanceLabel = balance === 'import' ? 'Import' : balance === 'surplus' ? 'Surplus' : 'Balanced'
  const balanceHint =
    balance === 'import'
      ? 'Fill exceeds cut — material must be imported'
      : balance === 'surplus'
        ? 'Cut exceeds fill — surplus material to haul away'
        : 'Cut and fill are balanced'

  return (
    <section className="si-cutfill-legend__kpis" aria-label="Earthwork summary">
      <div className="si-cutfill-legend__section-title">Earthwork</div>
      <div className="si-cutfill-legend__kpi-grid">
        <div className="si-cutfill-legend__kpi is-cut">
          <span className="si-cutfill-legend__kpi-label">Cut volume</span>
          <span className="si-cutfill-legend__kpi-value">
            {fmtVol(summary.cutVolumeM3)}
            <small>m³</small>
          </span>
        </div>
        <div className="si-cutfill-legend__kpi is-fill">
          <span className="si-cutfill-legend__kpi-label">Fill volume</span>
          <span className="si-cutfill-legend__kpi-value">
            {fmtVol(summary.fillVolumeM3)}
            <small>m³</small>
          </span>
        </div>
      </div>
      <div className={`si-cutfill-legend__net is-${balance}`} title={balanceHint}>
        <div className="si-cutfill-legend__net-head">
          <span className="si-cutfill-legend__kpi-label">Net volume</span>
          <span className="si-cutfill-legend__net-badge">{balanceLabel}</span>
        </div>
        <span className="si-cutfill-legend__kpi-value">
          {net > 0 ? '+' : ''}
          {fmtVol(net)}
          <small>m³</small>
        </span>
        <div className="si-cutfill-legend__balance" aria-hidden>
          <span className="is-cut" style={{ width: `${cutShare}%` }} />
          <span className="is-fill" style={{ width: `${100 - cutShare}%` }} />
        </div>
      </div>
      <div className="si-cutfill-legend__kpi-grid">
        <div className="si-cutfill-legend__kpi is-cut">
          <span className="si-cutfill-legend__kpi-label">
            <i className="fa-solid fa-arrow-down" aria-hidden /> Max cut depth
          </span>
          <span className="si-cutfill-legend__kpi-value">
            {fmtM(summary.maxCutM)}
            <small>m</small>
          </span>
        </div>
        <div className="si-cutfill-legend__kpi is-fill">
          <span className="si-cutfill-legend__kpi-label">
            <i className="fa-solid fa-arrow-up" aria-hidden /> Max fill depth
          </span>
          <span className="si-cutfill-legend__kpi-value">
            {fmtM(summary.maxFillM)}
            <small>m</small>
          </span>
        </div>
      </div>
    </section>
  )
}

function CutFillLegend({ cutFill }: Props) {
  const maps = useMap()
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [geom, setGeom] = useState<LegendGeom | null>(readLegendGeom)
  const geomRef = useRef(geom)
  geomRef.current = geom
  /** Until the user drags/resizes, the card follows the map's bottom-left corner. */
  const userPlacedRef = useRef(geom != null)
  const [interaction, setInteraction] = useState<'drag' | 'resize' | null>(null)
  const summary = cutFill.result?.summary
  const profileChart = useMemo(() => {
    const r = cutFill.result
    if (!r) return null
    const profile = buildCutFillProfile(r.dem, r.existingElev, r.designElev, r.difference)
    return profile ? buildCutFillProfileChart(profile) : null
  }, [cutFill.result])

  useEffect(() => {
    let frames = 0
    let raf = 0
    const attach = () => {
      const map = maps.current?.getMap?.()
      const el = map?.getContainer?.() ?? null
      if (el) {
        setContainer(el)
        return
      }
      if (frames < 30) {
        frames += 1
        raf = window.requestAnimationFrame(attach)
      }
    }
    attach()
    return () => window.cancelAnimationFrame(raf)
  }, [maps])

  const visible = !!container && !!summary

  const relayout = useCallback(() => {
    const b = legendBounds(container)
    const renderedH = rootRef.current?.offsetHeight ?? 0
    const g = geomRef.current
    setGeom(userPlacedRef.current && g ? clampLegendGeom(g, renderedH, b) : defaultLegendGeom(b, renderedH))
  }, [container])

  useLayoutEffect(() => {
    if (visible) relayout()
  }, [visible, relayout, profileChart])

  useEffect(() => {
    if (!visible) return
    window.addEventListener('resize', relayout)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null
    if (ro && container) ro.observe(container)
    if (ro && rootRef.current) ro.observe(rootRef.current)
    return () => {
      window.removeEventListener('resize', relayout)
      ro?.disconnect()
    }
  }, [visible, container, relayout])

  const startPointerSession = useCallback(
    (e: ReactPointerEvent<HTMLElement>, kind: 'drag' | 'resize') => {
      const start = geomRef.current
      const el = rootRef.current
      if (e.button !== 0 || !start || !el) return
      e.preventDefault()
      e.stopPropagation()
      const sx = e.clientX
      const sy = e.clientY
      const startH = start.h ?? el.offsetHeight
      const b = legendBounds(container)
      userPlacedRef.current = true
      setInteraction(kind)
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        const next =
          kind === 'drag'
            ? { ...start, x: start.x + dx, y: start.y + dy }
            : { ...start, w: start.w + dx, h: startH + dy }
        setGeom(clampLegendGeom(next, el.offsetHeight, b))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setInteraction(null)
        if (geomRef.current) writeLegendGeom(geomRef.current)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [container],
  )

  const onHeadPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button, a, input, select')) return
      startPointerSession(e, 'drag')
    },
    [startPointerSession],
  )

  const resetLayout = useCallback(() => {
    userPlacedRef.current = false
    writeLegendGeom(null)
    setGeom(g => (g ? { ...g, h: null } : g))
    window.requestAnimationFrame(relayout)
  }, [relayout])

  if (!visible || !summary) return null

  const areaFor = (type: CutFillCellType) => {
    if (type === 'CUT') return summary.cutAreaM2
    if (type === 'FILL') return summary.fillAreaM2
    return summary.noChangeAreaM2
  }

  const bounds = legendBounds(container)

  return createPortal(
    <div
      ref={rootRef}
      className={
        'si-cutfill-legend' +
        (interaction === 'drag' ? ' is-dragging' : '') +
        (interaction === 'resize' ? ' is-resizing' : '')
      }
      data-map-overlay-isolate=""
      role="dialog"
      aria-label="Cut and fill legend"
      style={{
        left: geom?.x ?? 0,
        top: geom?.y ?? 0,
        width: geom?.w ?? LEGEND_DEFAULT_W,
        height: geom?.h ?? undefined,
        maxHeight: Math.max(LEGEND_MIN_H, bounds.bottom - bounds.top),
        visibility: geom ? 'visible' : 'hidden',
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <header
        className="si-cutfill-legend__head"
        onPointerDown={onHeadPointerDown}
        onDoubleClick={resetLayout}
        title="Drag to move · double-click to restore default"
      >
        <span className="si-cutfill-legend__grip" aria-hidden>
          <i className="fa-solid fa-grip-vertical" />
        </span>
        <span className="si-cutfill-legend__title">Cut & Fill</span>
      </header>
      <div className="si-cutfill-legend__body">
        <ul className="si-cutfill-legend__list">
          {CLASS_ROWS.map(row => {
            const on = classVisible(cutFill.layers, row.key)
            return (
              <li key={row.key}>
                <button
                  type="button"
                  className={`si-cutfill-legend__row${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => cutFill.toggleLayer(row.key)}
                >
                  <span className="si-cutfill-legend__swatch" style={{ background: row.swatch, opacity: on ? 1 : 0.35 }} />
                  <span className="si-cutfill-legend__copy">
                    <strong>{row.label}</strong>
                    <span>{row.hint}</span>
                  </span>
                  <span className="si-cutfill-legend__ha">{ha(areaFor(row.type))} ha</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="si-cutfill-legend__hint">ΔZ = Design − Existing. Click a zone for elevations, type, area, and volume.</p>
        {profileChart ? <CutFillProfileChart chart={profileChart} /> : null}
        <CutFillEarthworkSummary summary={summary} />
      </div>
      <button
        type="button"
        className="si-cutfill-legend__resize"
        aria-label="Resize legend (double-click to restore default position and size)"
        title="Drag to resize · double-click to restore default"
        onPointerDown={e => startPointerSession(e, 'resize')}
        onDoubleClick={resetLayout}
      >
        <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
      </button>
    </div>,
    document.body,
  )
}

function CutFillHitPopup({ cutFill }: Props) {
  const hit = cutFill.mapHit
  if (!hit) return null
  const swatch = CLASS_ROWS.find(row => row.type === hit.type)?.swatch ?? '#e2e8f0'
  return (
    <SiMapDockAwareMarker
      longitude={hit.lng}
      latitude={hit.lat}
      anchor="bottom"
      className="si-cutfill-hit-marker"
      popupWidth={240}
    >
      <div
        className="si-cutfill-hit"
        data-map-overlay-isolate=""
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <header className="si-cutfill-hit__head">
          <strong style={{ color: swatch }}>{hit.type === 'NO_CHANGE' ? 'NO CHANGE' : hit.type}</strong>
          <button type="button" className="si-cutfill-hit__close" aria-label="Close" onClick={() => cutFill.setMapHit(null)}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
        <dl className="si-cutfill-hit__grid">
          <div>
            <dt>ΔZ</dt>
            <dd>{fmtM(hit.designZ - hit.existingZ)} m</dd>
          </div>
          <div>
            <dt>Existing Z</dt>
            <dd>{fmtM(hit.existingZ)} m</dd>
          </div>
          <div>
            <dt>Design Z</dt>
            <dd>{fmtM(hit.designZ)} m</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{fmtM(hit.areaM2, 1)} m²</dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>{fmtM(hit.volumeM3, 1)} m³</dd>
          </div>
        </dl>
      </div>
    </SiMapDockAwareMarker>
  )
}

export function CutFillMapLayers({ cutFill }: Props) {
  const maps = useMap()
  const r = cutFill.result
  const showClass = !!(
    cutFill.layers.classification ||
    classVisible(cutFill.layers, 'cut') ||
    classVisible(cutFill.layers, 'fill') ||
    classVisible(cutFill.layers, 'noChange')
  )
  const aoiRaster = useMemo(() => {
    if (!showClass || !r?.difference || !cutFill.aoiGeometry) return null
    return buildCutFillAoiRaster(r.dem, r.difference, cutFill.aoiGeometry, r.classification, {
      cut: classVisible(cutFill.layers, 'cut'),
      fill: classVisible(cutFill.layers, 'fill'),
      noChange: classVisible(cutFill.layers, 'noChange'),
    })
  }, [showClass, r, cutFill.aoiGeometry, cutFill.layers])
  const classPolygons = useMemo(() => {
    if (!showClass || !r?.classification || !r.difference) return null
    return buildCutFillClassPolygons(r.dem, r.classification, r.difference, {
      cut: classVisible(cutFill.layers, 'cut'),
      fill: classVisible(cutFill.layers, 'fill'),
      noChange: classVisible(cutFill.layers, 'noChange'),
    })
  }, [r, showClass, cutFill.layers])

  const aoiImageOverlay = useMemo(() => {
    if (!showClass || !aoiRaster) return null
    const png = encodeRgbaPng(aoiRaster.width, aoiRaster.height, aoiRaster.rgba)
    const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    return { url, coordinates: aoiRaster.coordinates }
  }, [showClass, aoiRaster])

  useEffect(() => {
    return () => {
      if (aoiImageOverlay?.url) URL.revokeObjectURL(aoiImageOverlay.url)
    }
  }, [aoiImageOverlay])

  useEffect(() => {
    if (!cutFill.enabled || !r) return
    let frames = 0
    let raf = 0
    const place = () => {
      const map = maps.current?.getMap?.()
      if (!map?.isStyleLoaded?.() || !map.getStyle?.()) return
      const hasCutFill = (map.getStyle()?.layers ?? []).some(layer =>
        String(layer.id || '').startsWith('cutfill-'),
      )
      if (!hasCutFill) return
      placeSiCutFillLayersInsideAoi(map)
      map.triggerRepaint?.()
    }
    let bound: { off?: (type: string, fn: () => void) => void } | null = null
    const tick = () => {
      place()
      const map = maps.current?.getMap?.()
      if (map && !bound) {
        bound = map
        map.on?.('idle', place)
      }
      if (frames < 24) {
        frames += 1
        raf = window.requestAnimationFrame(tick)
      }
    }
    tick()
    return () => {
      window.cancelAnimationFrame(raf)
      bound?.off?.('idle', place)
    }
  }, [maps, cutFill.enabled, cutFill.layers, cutFill.layerOpacity, r, classPolygons, aoiRaster, aoiImageOverlay])

  const masks = useMemo(() => {
    if (aoiRaster || classPolygons || !r?.classification || !r.difference) return null
    return buildCutFillClassMasks(r.dem, r.classification, r.difference)
  }, [aoiRaster, r, classPolygons])

  if (!cutFill.enabled || !r) return null
  const op = cutFill.layerOpacity

  const layers: JSX.Element[] = []

  if (cutFill.layers.existing && r.existingPreview) {
    layers.push(
      <Source key="cf-existing" id="cutfill-existing-src" type="image" url={r.existingPreview.dataUrl} coordinates={r.existingPreview.coordinates as any}>
        <Layer id="cutfill-existing-raster" type="raster" paint={{ 'raster-opacity': r.existingPreview.opacity * op, 'raster-fade-duration': 0 }} />
      </Source>,
    )
  }
  if (cutFill.layers.design && r.designPreview) {
    layers.push(
      <Source key="cf-design" id="cutfill-design-src" type="image" url={r.designPreview.dataUrl} coordinates={r.designPreview.coordinates as any}>
        <Layer id="cutfill-design-raster" type="raster" paint={{ 'raster-opacity': r.designPreview.opacity * op, 'raster-fade-duration': 0 }} />
      </Source>,
    )
  }
  if (cutFill.layers.difference && r.diffLayer) {
    layers.push(
      <Source key="cf-diff" id="cutfill-diff-src" type="image" url={r.diffLayer.dataUrl} coordinates={r.diffLayer.coordinates as any}>
        <Layer
          id="cutfill-diff-raster"
          type="raster"
          paint={{
            'raster-opacity': r.diffLayer.opacity * op,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          }}
        />
      </Source>,
    )
  }

  const classPaint = (opacity: number) =>
    ({
      'raster-opacity': Math.max(0.9, opacity) * op,
      'raster-fade-duration': 0,
      'raster-resampling': 'nearest',
    }) as const

  if (masks && classVisible(cutFill.layers, 'noChange')) {
    layers.push(
      <Source key="cf-nochange" id="cutfill-nochange-src" type="image" url={masks.noChange.dataUrl} coordinates={masks.noChange.coordinates as any}>
        <Layer id="cutfill-nochange-raster" type="raster" paint={classPaint(masks.noChange.opacity)} />
      </Source>,
    )
  }
  if (masks && classVisible(cutFill.layers, 'fill')) {
    layers.push(
      <Source key="cf-fill" id="cutfill-fill-src" type="image" url={masks.fill.dataUrl} coordinates={masks.fill.coordinates as any}>
        <Layer id="cutfill-fill-raster" type="raster" paint={classPaint(masks.fill.opacity)} />
      </Source>,
    )
  }
  if (masks && classVisible(cutFill.layers, 'cut')) {
    layers.push(
      <Source key="cf-cut" id="cutfill-cut-src" type="image" url={masks.cut.dataUrl} coordinates={masks.cut.coordinates as any}>
        <Layer id="cutfill-cut-raster" type="raster" paint={classPaint(masks.cut.opacity)} />
      </Source>,
    )
  }
  if (classPolygons?.features.length) {
    layers.push(
      <Source key="cf-class-poly" id="cutfill-class-src" type="geojson" data={classPolygons as any}>
        <Layer
          id="cutfill-class-fill"
          type="fill"
          paint={{
            'fill-color': [
              'match',
              ['get', 'cls'],
              1,
              CUT_FILL_MAP_SWATCH.CUT,
              2,
              CUT_FILL_MAP_SWATCH.FILL,
              CUT_FILL_MAP_SWATCH.NO_CHANGE,
            ] as any,
            'fill-opacity': op,
            'fill-antialias': false,
          }}
        />
      </Source>,
    )
  }
  if (aoiImageOverlay) {
    layers.push(
      <Source
        key="cf-aoi-dz"
        id="cutfill-aoi-dz-src"
        type="image"
        url={aoiImageOverlay.url}
        coordinates={aoiImageOverlay.coordinates as any}
      >
        <Layer
          id="cutfill-aoi-dz-raster"
          type="raster"
          paint={{
            'raster-opacity': op,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          }}
        />
      </Source>,
    )
  } else if (!aoiRaster && showClass && r.classLayer) {
    layers.push(
      <Source key="cf-class" id="cutfill-class-src" type="image" url={r.classLayer.dataUrl} coordinates={r.classLayer.coordinates as any}>
        <Layer
          id="cutfill-class-raster"
          type="raster"
          paint={{
            'raster-opacity': Math.max(0.92, r.classLayer.opacity) * op,
            'raster-fade-duration': 0,
            'raster-resampling': 'nearest',
          }}
        />
      </Source>,
    )
  }
  const renderContours = (key: string, id: string, fc: GeoJSON.FeatureCollection | undefined, color: string) => {
    if (!fc?.features?.length) return null
    let elevMin = Infinity
    let elevMax = -Infinity
    for (const f of fc.features) {
      const e = Number(f.properties?.elev)
      if (!Number.isFinite(e)) continue
      elevMin = Math.min(elevMin, e)
      elevMax = Math.max(elevMax, e)
    }
    if (!Number.isFinite(elevMin)) {
      elevMin = 0
      elevMax = 100
    }
    return (
      <Source key={key} id={`${id}-src`} type="geojson" data={fc as any}>
        <Layer
          id={`${id}-line`}
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': color === 'design' ? '#38bdf8' : (contourElevationMapboxColorExpression(elevMin, elevMax) as any),
            'line-opacity': 0.85 * op,
            'line-width': ['case', ['==', ['get', 'index'], 1], 2, 1] as any,
          }}
        />
      </Source>
    )
  }

  if (cutFill.layers.existingContours) {
    const el = renderContours('cf-ex-cont', 'cutfill-ex-cont', r.existingContours, 'existing')
    if (el) layers.push(el)
  }
  if (cutFill.layers.designContours) {
    const el = renderContours('cf-ds-cont', 'cutfill-ds-cont', r.designContours, 'design')
    if (el) layers.push(el)
  }

  if (cutFill.mapHit) {
    const swatch = CLASS_ROWS.find(row => row.type === cutFill.mapHit?.type)?.swatch ?? '#f8fafc'
    layers.push(
      <Source
        key="cf-hit"
        id="cutfill-hit-src"
        type="geojson"
        data={{
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { type: cutFill.mapHit.type },
              geometry: { type: 'Polygon', coordinates: [cutFill.mapHit.ring] },
            },
          ],
        } as any}
      >
        <Layer id="cutfill-hit-fill" type="fill" paint={{ 'fill-color': swatch, 'fill-opacity': 0.35 }} />
        <Layer id="cutfill-hit-line" type="line" paint={{ 'line-color': '#f8fafc', 'line-width': 2 }} />
      </Source>,
    )
  }

  const profileLine = buildCutFillProfile(r.dem, r.existingElev, r.designElev, r.difference)
  const profileFeature = profileLine ? cutFillProfileLine(profileLine) : null
  if (profileFeature) {
    layers.push(
      <Source key="cf-profile" id="cutfill-profile-src" type="geojson" data={{ type: 'FeatureCollection', features: [profileFeature] } as any}>
        <Layer id="cutfill-profile-casing" type="line" paint={{ 'line-color': '#0f172a', 'line-width': 3, 'line-opacity': 0.85 }} />
        <Layer
          id="cutfill-profile-line"
          type="line"
          paint={{ 'line-color': '#f8fafc', 'line-width': 1.4, 'line-dasharray': [2, 1.2] }}
        />
      </Source>,
    )
  }

  if (cutFill.highlightFeature) {
    layers.push(
      <Source key="cf-hl" id="cutfill-highlight-src" type="geojson" data={{ type: 'FeatureCollection', features: [cutFill.highlightFeature] } as any}>
        <Layer id="cutfill-highlight-circle" type="circle" paint={{ 'circle-radius': 10, 'circle-color': '#22d3ee', 'circle-opacity': 0.35, 'circle-stroke-width': 2, 'circle-stroke-color': '#0ea5e9' }} />
      </Source>,
    )
  }

  return (
    <>
      {layers}
      <CutFillLegend cutFill={cutFill} />
      <CutFillHitPopup cutFill={cutFill} />
    </>
  )
}
