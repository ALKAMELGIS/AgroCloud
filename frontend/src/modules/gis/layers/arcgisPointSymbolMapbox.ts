/**
 * Mapbox `symbol` layer helpers for ArcGIS picture marker (esriPMS) point symbology.
 */
import {
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  pickRendererPrimaryField,
} from './arcgisDrawingInfoMapbox';
import { parseEsriPmsSymbol } from './arcgisPointSymbol';

export type ArcgisPointIconEntry = {
  valueKey: string;
  imageId: string;
  imageUrl: string;
  width: number;
  height: number;
};

export type ArcgisPointIconLayerSpec = {
  fieldExpr: any;
  defaultImageId: string;
  entries: ArcgisPointIconEntry[];
  iconSize: number;
};

function propertyGetExpression(field: string): any {
  const f = field.trim();
  if (!f) return ['literal', ''];
  const underscored = f.replace(/\s+/g, '_');
  const noSpace = f.replace(/\s+/g, '');
  const variants = Array.from(
    new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()]),
  ).filter(Boolean);
  if (variants.length === 1) return ['get', variants[0]!];
  const inner: any[] = ['coalesce'];
  for (const v of variants) inner.push(['get', v]);
  inner.push(['literal', '']);
  return inner;
}

function uniqueValueKeyExpression(ren: any): any {
  const f1 = typeof ren.field1 === 'string' ? ren.field1.trim() : '';
  const f2 = typeof ren.field2 === 'string' ? ren.field2.trim() : '';
  const f3 = typeof ren.field3 === 'string' ? ren.field3.trim() : '';
  const delim = typeof ren.fieldDelimiter === 'string' && ren.fieldDelimiter.length ? ren.fieldDelimiter : '|';
  const parts = [f1, f2, f3].filter(Boolean);
  if (parts.length === 0) {
    const fb = pickRendererPrimaryField(ren);
    return fb ? ['to-string', propertyGetExpression(fb)] : ['to-string', ['literal', '']];
  }
  if (parts.length === 1) return ['to-string', propertyGetExpression(parts[0]!)];
  const concat: any[] = ['concat'];
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) concat.push(delim);
    concat.push(['to-string', propertyGetExpression(parts[i]!)]);
  }
  return concat;
}

function pmsEntryFromSymbol(symbol: any, imageId: string, valueKey: string): ArcgisPointIconEntry | null {
  const preview = parseEsriPmsSymbol(symbol, 1);
  if (!preview?.imageUrl) return null;
  return {
    valueKey,
    imageId,
    imageUrl: preview.imageUrl,
    width: preview.imageWidth ?? 24,
    height: preview.imageHeight ?? 24,
  };
}

/** Build icon-image match spec when renderer uses picture markers. */
export function buildArcgisPointIconLayerSpec(
  drawingInfo: any,
  layerSafeId: string,
): ArcgisPointIconLayerSpec | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const entry = pmsEntryFromSymbol(ren.symbol, `${layerSafeId}-arcgis-pms-def`, 'default');
    if (!entry) return null;
    return {
      fieldExpr: ['to-string', ['literal', 'default']],
      defaultImageId: entry.imageId,
      entries: [entry],
      iconSize: Math.max(0.35, Math.min(1.6, entry.width / 24)),
    };
  }

  if (t === 'uniqueValue') {
    const infos = flattenArcgisUniqueValueInfos(ren);
    const entries: ArcgisPointIconEntry[] = [];
    for (let i = 0; i < infos.length; i += 1) {
      const uvi = infos[i];
      const valueKey = normalizeUniqueValueKey(uvi?.value);
      if (!valueKey) continue;
      const entry = pmsEntryFromSymbol(uvi?.symbol, `${layerSafeId}-arcgis-pms-${i}`, valueKey);
      if (entry) entries.push(entry);
    }
    const defEntry = pmsEntryFromSymbol(ren.defaultSymbol, `${layerSafeId}-arcgis-pms-def`, 'default');
    if (!entries.length && !defEntry) return null;
    const defaultImageId = defEntry?.imageId ?? entries[0]!.imageId;
    if (defEntry && !entries.some(e => e.imageId === defEntry.imageId)) entries.push(defEntry);
    const maxW = Math.max(...entries.map(e => e.width), 24);
    return {
      fieldExpr: uniqueValueKeyExpression(ren),
      defaultImageId,
      entries,
      iconSize: Math.max(0.35, Math.min(1.6, maxW / 24)),
    };
  }

  return null;
}

export function buildArcgisPointIconImageMatch(spec: ArcgisPointIconLayerSpec): any[] {
  const expr: any[] = ['match', spec.fieldExpr];
  for (const entry of spec.entries) {
    if (entry.valueKey === 'default') continue;
    expr.push(entry.valueKey, entry.imageId);
  }
  expr.push(spec.defaultImageId);
  return expr;
}
