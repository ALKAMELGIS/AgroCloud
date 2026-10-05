import type { PathOptions } from 'leaflet'
import {
  buildArcgisUniqueValueLegendItems,
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  type ArcgisUniqueValueLegendItem,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import {
  arcgisFeatureToLeafletPathOptions,
  layerOpacityFromDrawingInfo,
} from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import { parseEsriPointSymbol, type ArcgisPointSymbolPreview } from '@/modules/gis/layers/arcgisPointSymbol'
import { AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG } from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'

export type DevelopEliteMapLegendRow = {
  id: string
  label: string
  fillColor: string
  outlineColor: string
  outlineWidth: number
  hollow: boolean
  group: 'structures' | 'trees' | 'irrigation-valves' | 'irrigation-main-pipe' | 'agri-location' | 'overlay'
  /** Point / picture markers from ArcGIS (Tree, AgroLocation). */
  symbolStyle?: 'polygon' | 'point'
  pointPreview?: ArcgisPointSymbolPreview
}

/** Default Agro_Structures symbology when service drawingInfo is partial. */
const STRUCTURE_TYPE_FALLBACK: Record<
  number,
  Pick<DevelopEliteMapLegendRow, 'fillColor' | 'outlineColor' | 'outlineWidth' | 'hollow'>
> = {
  1000: { fillColor: 'rgb(76, 230, 0)', outlineColor: 'rgb(110, 110, 110)', outlineWidth: 1, hollow: false },
  1001: { fillColor: 'rgb(168, 168, 0)', outlineColor: 'rgb(110, 110, 110)', outlineWidth: 1, hollow: false },
  1002: { fillColor: 'rgb(255, 255, 255)', outlineColor: 'rgb(255, 255, 115)', outlineWidth: 1, hollow: false },
  1003: { fillColor: 'rgb(204, 204, 204)', outlineColor: 'rgb(204, 204, 204)', outlineWidth: 1, hollow: false },
  1004: { fillColor: 'rgb(209, 255, 115)', outlineColor: 'rgb(0, 0, 0)', outlineWidth: 1, hollow: false },
  1005: { fillColor: 'transparent', outlineColor: 'rgb(169, 0, 230)', outlineWidth: 2, hollow: true },
  1006: { fillColor: 'transparent', outlineColor: 'rgb(0, 0, 0)', outlineWidth: 2, hollow: true },
  1007: { fillColor: 'transparent', outlineColor: 'rgb(76, 230, 0)', outlineWidth: 2, hollow: true },
}

const OVERLAY_LEGEND_ROWS: DevelopEliteMapLegendRow[] = [
  {
    id: 'overlay-world-countries',
    label: 'Portfolio countries',
    fillColor: 'transparent',
    outlineColor: '#4ce600',
    outlineWidth: 2,
    hollow: true,
    group: 'overlay',
  },
  {
    id: 'overlay-selected-field',
    label: 'Selected field',
    fillColor: 'rgba(76, 230, 0, 0.35)',
    outlineColor: '#39ff14',
    outlineWidth: 2,
    hollow: false,
    group: 'overlay',
  },
]

function legendItemToRow(item: ArcgisUniqueValueLegendItem, group: DevelopEliteMapLegendRow['group']): DevelopEliteMapLegendRow {
  return {
    id: `${group}-${item.value}-${item.label}`,
    label: item.label,
    fillColor: item.fillColor,
    outlineColor: item.outlineColor,
    outlineWidth: item.outlineWidth,
    hollow: item.hollow,
    group,
    symbolStyle: 'polygon',
  }
}

function isArcgisPointMarkerSymbol(symbol: unknown): boolean {
  if (!symbol || typeof symbol !== 'object') return false
  const t = String((symbol as { type?: string }).type || '')
  return t === 'esriSMS' || t === 'esriPMS'
}

/** Unique-value classes for point layers — preserves picture markers and simple markers. */
export function buildDevelopElitePointLayerLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
  group: 'trees' | 'irrigation-valves' | 'agri-location',
): DevelopEliteMapLegendRow[] {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren || String(ren.type || '') !== 'uniqueValue') return []
  const layerOpacity = layerOpacityFromDrawingInfo(drawingInfo)
  const infos = flattenArcgisUniqueValueInfos(ren)
  const rows: DevelopEliteMapLegendRow[] = []

  for (const uvi of infos) {
    const value = normalizeUniqueValueKey(uvi?.value)
    const label = String(uvi?.label ?? uvi?.value ?? '').trim() || value
    const sym = uvi?.symbol
    if (isArcgisPointMarkerSymbol(sym)) {
      const pointPreview = parseEsriPointSymbol(sym, layerOpacity)
      if (pointPreview) {
        rows.push({
          id: `${group}-${value}-${label}`,
          label,
          fillColor: pointPreview.fillColor,
          outlineColor: pointPreview.strokeColor,
          outlineWidth: pointPreview.strokeWidth,
          hollow: false,
          group,
          symbolStyle: 'point',
          pointPreview,
        })
        continue
      }
    }
    const polyItems = buildArcgisUniqueValueLegendItems(
      { renderer: { type: 'uniqueValue', uniqueValueInfos: [uvi] } },
      layerOpacity,
    )
    if (polyItems[0]) {
      rows.push(legendItemToRow(polyItems[0], group))
    }
  }

  return rows
}

function resolveApiItemByCode(
  byValue: Map<string, ArcgisUniqueValueLegendItem>,
  code: number,
  label: string,
): ArcgisUniqueValueLegendItem | undefined {
  const key = String(code)
  if (byValue.has(key)) return byValue.get(key)
  for (const item of byValue.values()) {
    if (item.label.toLowerCase() === label.toLowerCase()) return item
  }
  return undefined
}

/** All Structure_Type classes in Elite order, merged with live ArcGIS drawingInfo. */
export function buildDevelopEliteStructuresLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
): DevelopEliteMapLegendRow[] {
  const fromApi = buildArcgisUniqueValueLegendItems(drawingInfo)
  const byValue = new Map(fromApi.map(item => [item.value, item]))
  const usedValues = new Set<string>()
  const rows: DevelopEliteMapLegendRow[] = []

  for (const { code, label } of AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG) {
    const hit = resolveApiItemByCode(byValue, code, label)
    const fallback = STRUCTURE_TYPE_FALLBACK[code]
    if (hit) {
      usedValues.add(hit.value)
      rows.push(legendItemToRow(hit, 'structures'))
      continue
    }
    if (!fallback) continue
    rows.push({
      id: `structures-${code}`,
      label,
      fillColor: fallback.fillColor,
      outlineColor: fallback.outlineColor,
      outlineWidth: fallback.outlineWidth,
      hollow: fallback.hollow,
      group: 'structures',
    })
  }

  for (const item of fromApi) {
    if (usedValues.has(item.value)) continue
    rows.push(legendItemToRow(item, 'structures'))
  }

  return rows
}

export function buildDevelopEliteTreeLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
): DevelopEliteMapLegendRow[] {
  const pointRows = buildDevelopElitePointLayerLegendItems(drawingInfo, 'trees')
  if (pointRows.length) return pointRows
  const fromApi = buildArcgisUniqueValueLegendItems(drawingInfo)
  return fromApi.map(item => legendItemToRow(item, 'trees'))
}

export function buildDevelopEliteAgriLocationLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
): DevelopEliteMapLegendRow[] {
  const pointRows = buildDevelopElitePointLayerLegendItems(drawingInfo, 'agri-location')
  if (pointRows.length) return pointRows
  const fromApi = buildArcgisUniqueValueLegendItems(drawingInfo)
  return fromApi.map(item => legendItemToRow(item, 'agri-location'))
}

export function buildDevelopEliteIrrigationValvesLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
): DevelopEliteMapLegendRow[] {
  const pointRows = buildDevelopElitePointLayerLegendItems(drawingInfo, 'irrigation-valves')
  if (pointRows.length) return pointRows
  const fromApi = buildArcgisUniqueValueLegendItems(drawingInfo)
  return fromApi.map(item => legendItemToRow(item, 'irrigation-valves'))
}

export function buildDevelopEliteIrrigationMainPipeLegendItems(
  drawingInfo: Record<string, unknown> | null | undefined,
): DevelopEliteMapLegendRow[] {
  const fromApi = buildArcgisUniqueValueLegendItems(drawingInfo)
  return fromApi.map(item => legendItemToRow(item, 'irrigation-main-pipe'))
}

function readStructureTypeCode(props: Record<string, unknown>): number | null {
  const raw =
    props.Structure_Type ??
    props.STRUCTURE_TYPE ??
    props.structure_type ??
    props.StructureType
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Visible Agro_Structures symbology (ArcGIS drawingInfo + Structure_Type fallback). */
export function developEliteStructureLeafletStyle(
  drawingInfo: Record<string, unknown> | null | undefined,
  properties: Record<string, unknown>,
  options?: { layerOpacity?: number; highlighted?: boolean },
): PathOptions {
  const layerOpacity = options?.layerOpacity ?? layerOpacityFromDrawingInfo(drawingInfo)
  const base = arcgisFeatureToLeafletPathOptions(drawingInfo, properties, {
    layerOpacity,
    highlighted: options?.highlighted,
  })
  if (options?.highlighted) return base

  const code = readStructureTypeCode(properties)
  const fallback = code != null ? STRUCTURE_TYPE_FALLBACK[code] : undefined
  if (fallback) {
    const fromFallback: PathOptions = {
      color: fallback.outlineColor,
      weight: Math.max(fallback.outlineWidth, 2),
      fillColor: fallback.hollow ? fallback.outlineColor : fallback.fillColor,
      fillOpacity: fallback.hollow ? 0 : 0.38,
      opacity: 1,
    }
    const looksGeneric =
      base.color === '#64748b' ||
      base.fillColor === '#94a3b8' ||
      ((base.fillOpacity ?? 0) < 0.02 && (base.weight ?? 0) < 1)
    if (looksGeneric) return fromFallback
  }

  const fillOp = base.fillOpacity ?? 0
  const weight = base.weight ?? 1
  if (fillOp < 0.05) {
    return {
      ...base,
      color: base.color && base.color !== 'transparent' ? base.color : '#4ce600',
      weight: Math.max(weight, 2),
      opacity: 1,
    }
  }
  return base
}

export function buildDevelopEliteMapLegendSections(
  drawingInfo: Record<string, unknown> | null | undefined,
  treesDrawingInfo?: Record<string, unknown> | null,
  agriLocationDrawingInfo?: Record<string, unknown> | null,
  irrigationValvesDrawingInfo?: Record<string, unknown> | null,
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null,
): {
  structures: DevelopEliteMapLegendRow[]
  trees: DevelopEliteMapLegendRow[]
  irrigationValves: DevelopEliteMapLegendRow[]
  irrigationMainPipe: DevelopEliteMapLegendRow[]
  agriLocation: DevelopEliteMapLegendRow[]
  overlays: DevelopEliteMapLegendRow[]
} {
  return {
    structures: buildDevelopEliteStructuresLegendItems(drawingInfo),
    trees: buildDevelopEliteTreeLegendItems(treesDrawingInfo ?? null),
    irrigationValves: buildDevelopEliteIrrigationValvesLegendItems(irrigationValvesDrawingInfo ?? null),
    irrigationMainPipe: buildDevelopEliteIrrigationMainPipeLegendItems(
      irrigationMainPipeDrawingInfo ?? null,
    ),
    agriLocation: buildDevelopEliteAgriLocationLegendItems(agriLocationDrawingInfo ?? null),
    overlays: OVERLAY_LEGEND_ROWS,
  }
}
