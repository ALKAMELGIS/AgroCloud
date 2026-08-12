/**
 * Declarative Mapbox overlays for imported GIS layers.
 * Imperative addSource/addLayer gets wiped by react-map-gl style diffs;
 * React Source/Layer children are re-applied with the style and stay visible.
 */
import { useEffect, useMemo } from 'react'
import { Source, Layer, useMap } from 'react-map-gl/mapbox'
import {
  siCustomLayersBuriedUnderBasemap,
  siRaiseCustomLayersAboveBasemap,
  type SiCustomLayerZOrderMap,
} from '../../../lib/siCustomLayerZOrder'
import {
  detectImportedGeometryKind,
  type SiCustomLayerBase,
  type SiLayerGeometryKind,
} from '../../../lib/siCustomLayerFactory'
import { rasterTilesSourceMaxNativeZoom } from '../../../lib/rasterTileZoom'
import {
  DEFAULT_SI_LAYER_LABEL_STYLE,
  normalizeSiLayerLabelStyle,
  resolveSiLabelMapboxFontStack,
  type SiLayerLabelStyle,
} from '../../../lib/siLayerLabelStyle'
import {
  arcgisDrawingInfoToCirclePaint,
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  resolveLayerArcgisDrawingInfo,
} from '../../../lib/arcgisDrawingInfoMapbox'
import type { SymbologyConfig } from './LayerManager'
import { buildSiCustomVectorStylePack, type SiStrokeStyle, type SiFillStyle } from '../siSymbolStyleStudio'
import { sanitizeMapboxPaint } from '../../../lib/mapboxPaintSanitize'

const POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]
const LINE_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
]
const POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]
const SI_ARCGIS_MAPBOX_NEUTRAL_LINE = '#94a3b8'
const SI_ARCGIS_MAPBOX_NEUTRAL_STROKE = '#0f172a'

export function siSafeCustomOverlayId(value: unknown): string {
  return String(value ?? 'layer')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80)
}

type OverlayLayer = SiCustomLayerBase & {
  visible?: boolean
  color?: string
  fillColor?: string
  weight?: number
  polygonFillAlpha?: number
  pointRadius?: number
  mapOpacity?: number
  strokeStyle?: SiStrokeStyle
  fillStyle?: SiFillStyle
  definitionQueryText?: string
  definitionFilter?: unknown[] | null
  labelFieldName?: string | null
  labelStyle?: Partial<SiLayerLabelStyle> | null
  symbology?: SymbologyConfig | null
}

/**
 * Point/circle markers only for true point layers.
 * Polygon / line / mixed imports often carry stray Point / MultiPoint (centroids,
 * label points, vertices) that were painting as blue/black dots on the map —
 * hide those unless the layer is primarily points.
 */
export function shouldPaintImportedLayerCircles(
  kind: SiLayerGeometryKind | undefined | null,
): boolean {
  return kind === 'point'
}

function resolveOverlayGeometryKind(layer: OverlayLayer): SiLayerGeometryKind {
  const meta = layer.importMetadata?.geometryType
  if (meta && meta !== 'unknown') return meta
  return detectImportedGeometryKind(layer.geojson, layer.arcgisLayerDefinition, layer.renderMode)
}

function wantsArcgisOnlineSymbology(layer: OverlayLayer): boolean {
  if (layer.symbology?.useArcGisOnline === true) return true
  if (layer.symbology?.useArcGisOnline === false) return false
  if (layer.useArcGisSymbology === true) return true
  if (layer.useArcGisSymbology === false) return false
  return layer.source === 'arcgis'
}

function scalePaintOpacity(paint: Record<string, unknown>, factor: number): Record<string, unknown> {
  if (!(factor < 0.999)) return paint
  const next = { ...paint }
  for (const key of Object.keys(next)) {
    if (!key.endsWith('-opacity')) continue
    const v = next[key]
    if (typeof v === 'number' && Number.isFinite(v)) next[key] = v * factor
  }
  return next
}

function zoomScaledLinePaint(linePaint: Record<string, unknown>, op: number): Record<string, unknown> {
  const width = linePaint['line-width']
  if (typeof width === 'number' && Number.isFinite(width)) {
    return {
      ...linePaint,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        2,
        Math.max(1, width * 0.4),
        12,
        width,
        18,
        width * 1.35,
      ],
      'line-opacity':
        typeof linePaint['line-opacity'] === 'number'
          ? (linePaint['line-opacity'] as number)
          : 0.98 * op,
    }
  }
  return {
    ...linePaint,
    'line-opacity':
      typeof linePaint['line-opacity'] === 'number'
        ? (linePaint['line-opacity'] as number)
        : 0.98 * op,
  }
}

/** Resolve Mapbox fill/line/circle paint for an imported custom layer (incl. symbology). */
export function resolveImportedLayerPaint(layer: OverlayLayer): {
  fill: Record<string, unknown>
  line: Record<string, unknown>
  circle: Record<string, unknown>
} {
  const op = typeof layer.mapOpacity === 'number' ? layer.mapOpacity : 1

  if (wantsArcgisOnlineSymbology(layer)) {
    const di = resolveLayerArcgisDrawingInfo(layer)
    if (di) {
      const geomKind = resolveOverlayGeometryKind(layer)
      let fill = arcgisDrawingInfoToFillPaint(di) as Record<string, unknown> | null
      let line = arcgisDrawingInfoToLinePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE) as Record<
        string,
        unknown
      > | null
      let circle =
        geomKind === 'point'
          ? (arcgisDrawingInfoToCirclePaint(di) as Record<string, unknown> | null)
          : null
      if (!fill) {
        fill = { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 }
      }
      if (!line) {
        line = {
          'line-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
          'line-width': 1.5,
          'line-opacity': 0.95,
        }
      }
      if (!circle) {
        circle = {
          'circle-radius': 4,
          'circle-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
          'circle-stroke-width': 1,
          'circle-stroke-color': SI_ARCGIS_MAPBOX_NEUTRAL_STROKE,
        }
      }
      return {
        fill: sanitizeMapboxPaint(scalePaintOpacity(fill, op)),
        line: sanitizeMapboxPaint(zoomScaledLinePaint(scalePaintOpacity(line, op), op)),
        circle: sanitizeMapboxPaint(scalePaintOpacity(circle, op)),
      }
    }
  }

  // Upload / API shapefiles: simple fill + outline (same look as before). Skip the
  // symbology studio pack unless the user picked a real data-driven style.
  const style = layer.symbology?.style
  const dataDriven =
    Boolean(layer.symbology?.field) &&
    (style === 'unique' ||
      style === 'color' ||
      style === 'color_size' ||
      style === 'dot_density' ||
      style === 'threshold_markers')
  if ((layer.source === 'upload' || layer.source === 'api') && !dataDriven) {
    const lineColor =
      typeof layer.color === 'string' && layer.color.trim() ? layer.color.trim() : '#000000'
    const fillColor =
      typeof layer.fillColor === 'string' && layer.fillColor.trim()
        ? layer.fillColor.trim()
        : lineColor
    const fillOpacity =
      (typeof layer.polygonFillAlpha === 'number' && Number.isFinite(layer.polygonFillAlpha)
        ? layer.polygonFillAlpha
        : 0) * op
    const lineWidth =
      typeof layer.weight === 'number' && Number.isFinite(layer.weight) && layer.weight > 0
        ? Math.max(1.75, layer.weight)
        : 2.5
    const radius =
      typeof layer.pointRadius === 'number' && Number.isFinite(layer.pointRadius)
        ? layer.pointRadius
        : 6
    return {
      fill: sanitizeMapboxPaint({
        'fill-color': fillColor,
        'fill-opacity': fillOpacity,
      }),
      line: sanitizeMapboxPaint(
        zoomScaledLinePaint(
          {
            'line-color': lineColor,
            'line-width': lineWidth,
            'line-opacity': Math.min(1, 0.98 * op),
          },
          op,
        ),
      ),
      circle: sanitizeMapboxPaint({
        'circle-radius': radius,
        'circle-color': fillColor,
        'circle-stroke-color': lineColor,
        'circle-stroke-width': 1.5,
        'circle-opacity': Math.min(1, 0.95 * op),
        'circle-stroke-opacity': Math.min(1, 0.95 * op),
      }),
    }
  }

  const pack = buildSiCustomVectorStylePack({
    geojson: layer.geojson,
    source: layer.source,
    symbology: layer.symbology ?? undefined,
    color: layer.color,
    fillColor: layer.fillColor,
    weight: layer.weight,
    strokeStyle: layer.strokeStyle,
    polygonFillAlpha: layer.polygonFillAlpha,
    pointRadius: layer.pointRadius,
    fillStyle: layer.fillStyle,
    canUseArcGisOnline:
      layer.source === 'arcgis' ||
      Boolean(layer.arcgisDrawingInfo) ||
      Boolean((layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null)?.drawingInfo),
  })

  return {
    fill: sanitizeMapboxPaint(scalePaintOpacity(pack.fillPaint, op)),
    line: sanitizeMapboxPaint(zoomScaledLinePaint(scalePaintOpacity(pack.linePaint, op), op)),
    circle: sanitizeMapboxPaint(scalePaintOpacity(pack.circlePaint, op)),
  }
}

type Props = {
  layers: OverlayLayer[]
  /** Layer ids whose polygon fill should be invisible (e.g. under live Sentinel WMS). */
  suppressFillOpacityLayerIds?: ReadonlySet<string> | string[]
}

/**
 * Renders imported custom layers as first-class react-map-gl children so they
 * survive basemap style updates and always draw above the satellite basemap.
 */
export function SiImportedCustomLayersOverlay({ layers, suppressFillOpacityLayerIds }: Props) {
  const mapRef = useMap()
  const suppress =
    suppressFillOpacityLayerIds instanceof Set
      ? suppressFillOpacityLayerIds
      : new Set(suppressFillOpacityLayerIds ?? [])

  const overlaySourceIds = useMemo(
    () =>
      layers
        .filter(layer => layer.visible !== false)
        .map(layer => siSafeCustomOverlayId(layer.id))
        .filter(Boolean),
    [layers],
  )
  const overlayRaiseSig = overlaySourceIds.join('|')

  useEffect(() => {
    const ids = overlayRaiseSig.split('|').filter(Boolean)
    const map = (mapRef?.current?.getMap?.() ??
      (mapRef as { getMap?: () => SiCustomLayerZOrderMap } | undefined)?.getMap?.()) as
      | SiCustomLayerZOrderMap
      | undefined
    if (!map || !ids.length) return
    let cancelled = false
    let raf = 0
    let attempts = 0
    const raise = () => {
      siRaiseCustomLayersAboveBasemap(map, ids)
    }
    const tick = () => {
      if (cancelled) return
      raise()
      attempts += 1
      if (attempts < 16) raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    const onStyle = () => {
      if (cancelled) return
      if (siCustomLayersBuriedUnderBasemap(map, ids)) raise()
    }
    try {
      ;(map as { on?: (ev: string, fn: () => void) => void }).on?.('idle', onStyle)
      ;(map as { on?: (ev: string, fn: () => void) => void }).on?.('styledata', onStyle)
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      try {
        ;(map as { off?: (ev: string, fn: () => void) => void }).off?.('idle', onStyle)
        ;(map as { off?: (ev: string, fn: () => void) => void }).off?.('styledata', onStyle)
      } catch {
        /* ignore */
      }
    }
  }, [mapRef, overlayRaiseSig])

  return (
    <>
      {layers.map(layer => {
        if (layer.visible === false) return null
        const sid = siSafeCustomOverlayId(layer.id)
        const paint = resolveImportedLayerPaint(layer)
        if (suppress.has(String(layer.id))) {
          // Live WMS owns the fill — keep the layer outline on the map.
          paint.fill = { ...paint.fill, 'fill-opacity': 0 }
          const lineWidth = paint.line['line-width']
          if (typeof lineWidth === 'number' && Number.isFinite(lineWidth)) {
            paint.line = { ...paint.line, 'line-width': Math.max(lineWidth, 2), 'line-opacity': 1 }
          } else {
            paint.line = { ...paint.line, 'line-opacity': 1 }
          }
        }
        const visibility = layer.visible === false ? 'none' : 'visible'
        const geometryKind = resolveOverlayGeometryKind(layer)
        const paintCircles = shouldPaintImportedLayerCircles(geometryKind)

        if (layer.arcgisRasterTiles?.tiles?.length) {
          const maxNativeZoom = rasterTilesSourceMaxNativeZoom(layer.arcgisRasterTiles)
          const op = typeof layer.mapOpacity === 'number' ? layer.mapOpacity : 1
          return (
            <Source
              key={`rax-${sid}`}
              id={sid}
              type="raster"
              tiles={layer.arcgisRasterTiles.tiles}
              tileSize={layer.arcgisRasterTiles.tileSize ?? 256}
              {...(typeof maxNativeZoom === 'number' ? { maxzoom: maxNativeZoom } : {})}
            >
              <Layer
                id={`${sid}-arcgis-raster`}
                type="raster"
                layout={{ visibility }}
                paint={{ 'raster-opacity': 0.92 * op, 'raster-fade-duration': 0 } as any}
              />
            </Source>
          )
        }

        if (layer.renderMode === 'raster' && layer.raster?.url && layer.raster.coordinates) {
          const op = typeof layer.mapOpacity === 'number' ? layer.mapOpacity : 1
          return (
            <Source
              key={`img-${sid}`}
              id={sid}
              type="image"
              url={layer.raster.url}
              coordinates={layer.raster.coordinates as any}
            >
              <Layer
                id={`${sid}-raster`}
                type="raster"
                layout={{ visibility }}
                paint={{ 'raster-opacity': 0.92 * op, 'raster-fade-duration': 0 } as any}
              />
            </Source>
          )
        }

        const geojson = layer.geojson
        if (!geojson || typeof geojson !== 'object') return null
        const features = Array.isArray((geojson as { features?: unknown[] }).features)
          ? (geojson as { features: unknown[] }).features
          : []
        if (!features.length && !(layer.viewportStreaming && layer.source === 'arcgis')) return null

        return (
          <Source key={`vec-${sid}`} id={sid} type="geojson" data={geojson as any}>
            <Layer
              id={`${sid}-fill`}
              type="fill"
              filter={POLY_FILTER}
              layout={{ visibility }}
              paint={paint.fill as any}
            />
            <Layer
              id={`${sid}-line`}
              type="line"
              filter={LINE_FILTER}
              layout={{ visibility }}
              paint={paint.line as any}
            />
            {paintCircles ? (
              <Layer
                id={`${sid}-circle`}
                type="circle"
                filter={POINT_FILTER}
                layout={{ visibility }}
                paint={paint.circle as any}
              />
            ) : null}
            {(() => {
              const labelField =
                typeof layer.labelFieldName === 'string' && layer.labelFieldName.trim()
                  ? layer.labelFieldName.trim()
                  : ''
              if (!labelField) return null
              const style = normalizeSiLayerLabelStyle({
                ...DEFAULT_SI_LAYER_LABEL_STYLE,
                ...(layer.labelStyle ?? {}),
                fieldName: labelField,
              })
              const op = typeof layer.mapOpacity === 'number' ? layer.mapOpacity : 1
              const defFilter = Array.isArray(layer.definitionFilter) ? layer.definitionFilter : null
              const hasText = [
                'all',
                ['has', labelField],
                ['!=', ['to-string', ['get', labelField]], ''],
                ['!=', ['to-string', ['get', labelField]], 'null'],
              ]
              const labelFilter = defFilter ? (['all', defFilter, hasText] as any) : (hasText as any)
              return (
                <Layer
                  id={`${sid}-label`}
                  type="symbol"
                  minzoom={style.minZoom}
                  maxzoom={style.maxZoom}
                  filter={labelFilter}
                  layout={{
                    visibility,
                    'text-field': ['to-string', ['get', labelField]],
                    'text-size': style.fontSize,
                    'text-font': resolveSiLabelMapboxFontStack(style),
                    'text-anchor': 'center',
                    'text-justify': 'center',
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                    'text-optional': false,
                    'text-padding': 1,
                    'text-max-width': 10,
                    'symbol-placement': 'point',
                    'symbol-z-order': 'viewport-y',
                  }}
                  paint={{
                    'text-color': style.textColor,
                    'text-halo-color': style.haloColor,
                    'text-halo-width': style.haloWidth,
                    'text-opacity': op,
                  }}
                />
              )
            })()}
          </Source>
        )
      })}
    </>
  )
}

export default SiImportedCustomLayersOverlay
