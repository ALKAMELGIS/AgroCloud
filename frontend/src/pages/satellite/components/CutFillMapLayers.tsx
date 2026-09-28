import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import { contourElevationMapboxColorExpression } from '../../../lib/hydroWatershed/hydroEngine'
import { placeSiCutFillLayersInsideAoi } from '../../../lib/siMapAnalysisLayerOrder'
import { buildCutFillAoiRaster } from '../../../lib/cutFill/cutFillAoiRaster'
import { buildCutFillProfile, buildCutFillProfileChart, cutFillProfileLine } from '../../../lib/cutFill/cutFillProfile'
import { buildCutFillClassPolygons } from '../../../lib/cutFill/cutFillClassPolygons'
import { encodeRgbaPng } from '../../../lib/cutFill/cutFillGeoTiffPreview'
import { CUT_FILL_MAP_SWATCH, buildCutFillClassMasks } from '../../../lib/cutFill/cutFillRasterPreview'
import type { CutFillCellType } from '../../../lib/cutFill/cutFillTypes'
import { CutFillProfileChart } from './CutFillProfileChart'
import { SiMapDockAwareMarker } from './SiMapDockAwareMarker'
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

function CutFillLegend({ cutFill }: Props) {
  const maps = useMap()
  const [container, setContainer] = useState<HTMLElement | null>(null)
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

  if (!container || !summary) return null

  const areaFor = (type: CutFillCellType) => {
    if (type === 'CUT') return summary.cutAreaM2
    if (type === 'FILL') return summary.fillAreaM2
    return summary.noChangeAreaM2
  }

  return createPortal(
    <div
      className="si-cutfill-legend"
      data-map-overlay-isolate=""
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="si-cutfill-legend__title">Cut & Fill</div>
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
    </div>,
    container,
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
