import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay';
import {
  buildGeoAiLayerPopupAllAttributeRows,
  buildGeoAiLayerPopupAttributeRows,
  type GeoAiPopupAttrRow,
  type LayerQueryMatch,
} from './geoExplorerLayerContext';
import { defaultSiLayerPopupConfig, normalizeSiLayerPopupConfig, type SiLayerPopupConfig } from './siLayerPopupConfig';

export type SiPopupInspectSection = { id: string; title: string; rows: GeoAiPopupAttrRow[] };

export type SiPopupInspectPayload = {
  presentation: 'compact' | 'tabbed' | 'relationship';
  viewMode: SiLayerPopupConfig['viewMode'];
  sections: SiPopupInspectSection[];
  flatRows: { label: string; value: string }[];
  relationRows: GeoAiPopupAttrRow[];
  mediaRows: GeoAiPopupAttrRow[];
};

const REL_RX = /(RELATION|PARENT|CHILD|FK_|_FK|LOOKUP|JOIN)/i;
const MEDIA_RX = /(PHOTO|IMAGE|THUMB|ATTACH|MEDIA|URL|HTTP|\.PNG|\.JPG|\.JPEG|\.PDF|\.ZIP)/i;

function rowBucket(row: GeoAiPopupAttrRow): 'relation' | 'media' | 'attr' {
  if (REL_RX.test(row.key) || REL_RX.test(row.label)) return 'relation'
  if (MEDIA_RX.test(row.key) || MEDIA_RX.test(row.value)) return 'media'
  return 'attr'
}

function inferPresentation(
  rows: GeoAiPopupAttrRow[],
  cfg: SiLayerPopupConfig,
): 'compact' | 'tabbed' | 'relationship' {
  if (cfg.densityMode !== 'auto') return cfg.densityMode === 'relationship' ? 'relationship' : cfg.densityMode
  const rel = rows.filter(r => rowBucket(r) === 'relation').length
  const attrs = rows.filter(r => rowBucket(r) === 'attr').length
  if (cfg.showRelated && rel >= 3) return 'relationship'
  if (attrs > 18) return 'tabbed'
  return 'compact'
}

function orderRows(rows: GeoAiPopupAttrRow[], fieldOrder: string[]): GeoAiPopupAttrRow[] {
  if (!fieldOrder.length) return rows
  const ix = new Map(fieldOrder.map((k, i) => [k, i]))
  return [...rows].sort((a, b) => {
    const ia = ix.has(a.key) ? (ix.get(a.key) as number) : 9999
    const ib = ix.has(b.key) ? (ix.get(b.key) as number) : 9999
    if (ia !== ib) return ia - ib
    return a.key.localeCompare(b.key)
  })
}

function applyHidden(rows: GeoAiPopupAttrRow[], hidden: Set<string>): GeoAiPopupAttrRow[] {
  return rows.filter(r => !hidden.has(r.key))
}

function buildSections(rows: GeoAiPopupAttrRow[], groups: SiLayerPopupConfig['groups']): SiPopupInspectSection[] {
  if (!groups.length) {
    return [{ id: 'all', title: 'Attributes', rows }]
  }
  const used = new Set<string>()
  const out: SiPopupInspectSection[] = []
  for (const g of groups) {
    const gr = g.fieldKeys.map(k => rows.find(r => r.key === k)).filter(Boolean) as GeoAiPopupAttrRow[]
    for (const r of gr) used.add(r.key)
    out.push({ id: g.id, title: g.title, rows: gr })
  }
  const rest = rows.filter(r => !used.has(r.key))
  if (rest.length) out.push({ id: 'other', title: 'Other', rows: rest })
  return out
}

export function buildSiPopupInspectPayload(args: {
  properties: Record<string, unknown> | null | undefined;
  arcgisLayerDefinition: ArcgisLayerDefLite | null;
  popupConfig?: SiLayerPopupConfig | null;
  queryContext?: string | null;
  inspectCoords?: { lng: number; lat: number };
}): SiPopupInspectPayload {
  const cfg = normalizeSiLayerPopupConfig(args.popupConfig ?? undefined)
  const hit: Pick<LayerQueryMatch, 'properties' | 'arcgisLayerDefinition'> = {
    properties: args.properties,
    arcgisLayerDefinition: args.arcgisLayerDefinition,
  }
  const all = buildGeoAiLayerPopupAllAttributeRows(hit, { maxRows: 420, inspectCoords: args.inspectCoords })
  const hidden = new Set(cfg.hiddenFieldKeys.map(String))
  let rows = applyHidden(all, hidden)
  rows = orderRows(rows, cfg.fieldOrder)

  const relationRows = cfg.showRelated ? rows.filter(r => rowBucket(r) === 'relation') : []
  const mediaRows = cfg.showMedia ? rows.filter(r => rowBucket(r) === 'media') : []
  const attachRows = cfg.showAttachments ? rows.filter(r => /ATTACH|ATTACHMENT/i.test(r.key + r.label)) : []
  const ex = new Set([...relationRows, ...mediaRows, ...attachRows].map(r => r.key))
  const coreRows = rows.filter(r => !ex.has(r.key))

  const sections = buildSections(coreRows, cfg.groups)
  const presentation = inferPresentation(rows, cfg)
  const flatRows = rows.map(r => ({ label: r.label, value: r.value }))

  return {
    presentation,
    viewMode: cfg.viewMode,
    sections,
    flatRows,
    relationRows,
    mediaRows: cfg.showMedia || cfg.showAttachments ? [...mediaRows, ...attachRows] : [],
  }
}

/** Merge smart query-based rows with full payload for legacy `rows` consumers. */
export function buildGeoAiInspectCardContent(args: {
  properties: Record<string, unknown> | null | undefined;
  arcgisLayerDefinition: ArcgisLayerDefLite | null;
  popupConfig?: SiLayerPopupConfig | null;
  queryContext?: string | null;
  inspectCoords?: { lng: number; lat: number };
}): {
  rows: { label: string; value: string }[];
  inspect: SiPopupInspectPayload;
} {
  const hit: Pick<LayerQueryMatch, 'properties' | 'arcgisLayerDefinition'> = {
    properties: args.properties,
    arcgisLayerDefinition: args.arcgisLayerDefinition,
  }
  const rows = buildGeoAiLayerPopupAttributeRows(hit, {
    maxRows: 28,
    queryContext: args.queryContext ?? null,
    inspectCoords: args.inspectCoords,
  })
  const inspect = buildSiPopupInspectPayload({
    properties: args.properties,
    arcgisLayerDefinition: args.arcgisLayerDefinition,
    popupConfig: args.popupConfig ?? defaultSiLayerPopupConfig(),
    queryContext: args.queryContext,
    inspectCoords: args.inspectCoords,
  })
  return { rows, inspect }
}
