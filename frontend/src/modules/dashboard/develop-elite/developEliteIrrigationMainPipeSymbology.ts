import along from '@turf/along'
import bearing from '@turf/bearing'
import length from '@turf/length'
import { lineString } from '@turf/helpers'
import type { PathOptions } from 'leaflet'
import {
  arcgisFeatureToLeafletPathOptions,
  layerOpacityFromDrawingInfo,
  resolveArcgisRendererSymbol,
} from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import { parseEsriSlsSymbol } from '@/modules/gis/layers/arcgisPointSymbol'

export const IRRIGATION_MAIN_PIPE_REF_ZOOM = 17

/** Leaflet stroke weight from ArcGIS esriSLS width (14–16) with zoom-aware scaling. */
export function irrigationMainPipeLineWeight(esriWidth: number, zoom: number): number {
  const w = Number.isFinite(esriWidth) ? esriWidth : 14
  const refZoom = IRRIGATION_MAIN_PIPE_REF_ZOOM
  const scale = Math.pow(1.14, zoom - refZoom)
  const px = (w / 2) * scale
  return Math.max(2.5, Math.min(16, Math.round(px * 10) / 10))
}

export function irrigationMainPipeShowFlowArrows(zoom: number): boolean {
  return zoom >= 13
}

export function metersPerPixelAtZoom(zoom: number, latitudeDeg: number): number {
  const latRad = (latitudeDeg * Math.PI) / 180
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom)
}

/** Ground spacing between repeated flow arrows (~fixed screen distance). */
export function irrigationMainPipeArrowSpacingMeters(zoom: number, latitudeDeg: number): number {
  const mpp = metersPerPixelAtZoom(zoom, latitudeDeg)
  const targetPx = Math.max(32, Math.min(80, 24 + (zoom - 12) * 5))
  return mpp * targetPx
}

export function irrigationMainPipeArrowSizePx(lineWeight: number): number {
  return Math.max(7, Math.min(18, Math.round(lineWeight * 1.75)))
}

export type IrrigationMainPipeArrowPlacement = {
  lat: number
  lng: number
  bearingDeg: number
}

function readLineCoordinateSets(geometry: GeoJSON.Geometry | null | undefined): number[][][] {
  if (!geometry) return []
  if (geometry.type === 'LineString') {
    const c = geometry.coordinates
    return Array.isArray(c) && c.length >= 2 ? [c as number[][]] : []
  }
  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates as number[][][]).filter(line => line.length >= 2)
  }
  return []
}

const MAX_ARROWS_PER_LINE = 36

export function collectIrrigationMainPipeArrowPlacements(
  geometry: GeoJSON.Geometry | null | undefined,
  spacingMeters: number,
): IrrigationMainPipeArrowPlacement[] {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) return []
  const out: IrrigationMainPipeArrowPlacement[] = []
  for (const coords of readLineCoordinateSets(geometry)) {
    const line = lineString(coords as [number, number][])
    const totalM = length(line, { units: 'meters' })
    if (totalM < spacingMeters * 0.45) continue
    const step = Math.max(spacingMeters, totalM / MAX_ARROWS_PER_LINE)
    let placed = 0
    for (let d = step * 0.5; d < totalM - step * 0.15 && placed < MAX_ARROWS_PER_LINE; d += step) {
      const at = along(line, d, { units: 'meters' })
      const ahead = along(line, Math.min(totalM, d + Math.max(0.5, step * 0.08)), { units: 'meters' })
      const brg = bearing(at, ahead)
      const [lng, lat] = at.geometry.coordinates
      out.push({ lat, lng, bearingDeg: brg })
      placed += 1
    }
    const endAt = along(line, Math.max(0, totalM - step * 0.12), { units: 'meters' })
    const endAhead = along(line, totalM, { units: 'meters' })
    const endBrg = bearing(endAt, endAhead)
    const [endLng, endLat] = endAt.geometry.coordinates
    out.push({ lat: endLat, lng: endLng, bearingDeg: endBrg })
  }
  return out
}

export function irrigationMainPipePathOptions(
  drawingInfo: unknown,
  properties: GeoJSON.GeoJsonProperties | null | undefined,
  mapZoom: number,
  options?: { layerOpacity?: number; highlighted?: boolean },
): PathOptions {
  const layerOpacity = options?.layerOpacity ?? layerOpacityFromDrawingInfo(drawingInfo)
  const base = arcgisFeatureToLeafletPathOptions(drawingInfo, properties, { ...options, layerOpacity })
  const symbol = resolveArcgisRendererSymbol(drawingInfo, properties)
  const line = parseEsriSlsSymbol(symbol, layerOpacity)
  if (!line) return base
  const esriWidth = Number.isFinite((symbol as { width?: number })?.width)
    ? Number((symbol as { width?: number }).width)
    : 14
  return {
    ...base,
    weight: irrigationMainPipeLineWeight(esriWidth, mapZoom),
    lineCap: 'round',
    lineJoin: 'round',
  }
}

export function irrigationMainPipeArrowIconHtml(color: string, sizePx: number, bearingDeg: number): string {
  const s = Math.max(6, sizePx)
  return `<div class="develop-elite-irrigation-pipe-arrow" style="width:${s}px;height:${s}px;transform:rotate(${bearingDeg}deg);">
<svg viewBox="0 0 12 12" width="${s}" height="${s}" aria-hidden="true">
<polygon points="1,6 9,2 9,10" fill="${color}" stroke="none"/>
</svg></div>`
}
