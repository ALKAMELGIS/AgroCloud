/**
 * Map ArcGIS Feature Layer `drawingInfo` (as returned by `.../layer/{id}?f=pjson`)
 * to Mapbox GL JS paint props for GeoJSON fill/line layers (subset of renderers).
 */

/** Prevent huge renderers from blowing the JS stack or freezing Mapbox expression compilation. */
const ARCGIS_MAX_UNIQUE_VALUE_INFOS = 220;
const ARCGIS_MAX_CLASS_BREAK_INFOS = 160;
const ARCGIS_DRAWING_INFO_MAX_JSON_CHARS = 380_000;

/**
 * Clone and cap ArcGIS `drawingInfo` for browser storage and Mapbox paint conversion.
 * Returns `null` if the payload is invalid or still too large after capping (caller should drop symbology).
 */
export function sanitizeArcgisDrawingInfoForClient(drawingInfo: unknown): Record<string, unknown> | null {
  if (!drawingInfo || typeof drawingInfo !== 'object') return null;
  let di: any;
  try {
    di = JSON.parse(JSON.stringify(drawingInfo));
  } catch {
    return null;
  }
  const ren = di?.renderer;
  if (ren && typeof ren === 'object') {
    if (Array.isArray(ren.uniqueValueInfos) && ren.uniqueValueInfos.length > ARCGIS_MAX_UNIQUE_VALUE_INFOS) {
      ren.uniqueValueInfos = ren.uniqueValueInfos.slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    }
    if (Array.isArray(ren.classBreakInfos) && ren.classBreakInfos.length > ARCGIS_MAX_CLASS_BREAK_INFOS) {
      ren.classBreakInfos = ren.classBreakInfos.slice(0, ARCGIS_MAX_CLASS_BREAK_INFOS);
    }
  }
  try {
    const s = JSON.stringify(di);
    if (s.length > ARCGIS_DRAWING_INFO_MAX_JSON_CHARS) return null;
  } catch {
    return null;
  }
  return di as Record<string, unknown>;
}

function esriColorToCss(c: unknown): string | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) a = 255;
  const alpha = a <= 1 ? a : a / 255;
  const ao = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${ao})`;
}

function symbolFillColor(symbol: any): string | null {
  if (!symbol) return null;
  if (Array.isArray(symbol.color)) return esriColorToCss(symbol.color);
  return null;
}

function symbolOutlineStyle(symbol: any): { color: string | null; width: number } {
  const o = symbol?.outline;
  if (!o) return { color: null, width: 1 };
  const color = Array.isArray(o.color) ? esriColorToCss(o.color) : null;
  const w = typeof o.width === 'number' && Number.isFinite(o.width) ? Math.max(0.5, o.width) : 1;
  return { color, width: w };
}

function defaultFillOpacity(symbol: any): number {
  const c = symbol?.color;
  if (Array.isArray(c) && c.length >= 4) {
    const a = Number(c[3]);
    if (Number.isFinite(a)) return a <= 1 ? Math.max(0.05, Math.min(1, a)) : Math.max(0.05, Math.min(1, a / 255));
  }
  return 0.42;
}

/** ArcGIS polygon fill symbol with no interior (outline-only in map). */
function esriPolygonFillIsHollow(symbol: any): boolean {
  if (!symbol) return true;
  const st = symbol.style;
  if (st === 'esriSFSNull' || Number(st) === 1) return true;
  if (String(st).toLowerCase().includes('null')) return true;
  const c = symbol.color;
  if (Array.isArray(c) && c.length >= 4) {
    const a = Number(c[3]);
    const alpha = Number.isFinite(a) ? (a <= 1 ? a : a / 255) : 1;
    if (alpha < 0.04) return true;
  }
  return false;
}

/** Coalesce GeoJSON attribute keys — renderer field names may differ from aliases or casing in features. */
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

/** Unique / class-break field name(s) — REST uses `field1`, older services use `field`, or `fields[]`. */
export function pickRendererPrimaryField(ren: any): string {
  if (typeof ren?.field1 === 'string' && ren.field1.trim()) return ren.field1.trim();
  if (typeof ren?.field === 'string' && ren.field.trim()) return ren.field.trim();
  if (Array.isArray(ren?.fields)) {
    const f0 = ren.fields[0];
    if (typeof f0 === 'string' && f0.trim()) return f0.trim();
    if (f0 && typeof f0.name === 'string' && f0.name.trim()) return f0.name.trim();
  }
  return '';
}

/** Mapbox expression: string key used in `match` for unique value (supports field1|field2|… when present). */
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

function normalizeUniqueValueKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export type ArcgisMapboxFillPaint = {
  'fill-color': string | any[];
  'fill-opacity': number | any[];
  'fill-outline-color'?: string | any[];
}

export type ArcgisMapboxLinePaint = {
  'line-color': string | any[];
  'line-width': number | any[];
  'line-opacity'?: number | any[];
}

/** Returns null if renderer is unsupported or missing — caller should fall back to solid layer color. */
export function arcgisDrawingInfoToFillPaint(drawingInfo: any): ArcgisMapboxFillPaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const col = symbolFillColor(ren.symbol);
    if (!col) return null;
    if (esriPolygonFillIsHollow(ren.symbol)) {
      return { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 };
    }
    return { 'fill-color': col, 'fill-opacity': defaultFillOpacity(ren.symbol) };
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const defSym = ren.defaultSymbol;
    const defCol = esriPolygonFillIsHollow(defSym)
      ? 'rgba(0,0,0,0)'
      : symbolFillColor(defSym) || 'rgba(0,0,0,0)';
    const defOp = esriPolygonFillIsHollow(defSym) ? 0 : defaultFillOpacity(defSym);
    const colorExpr: any[] = ['match', fieldExpr];
    const opExpr: any[] = ['match', fieldExpr];
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(
      0,
      ARCGIS_MAX_UNIQUE_VALUE_INFOS,
    );
    for (const uvi of infos) {
      const v = normalizeUniqueValueKey(uvi?.value);
      if (!v) continue;
      const hollow = esriPolygonFillIsHollow(uvi.symbol);
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillColor(uvi.symbol) || defCol;
      const fo = hollow ? 0 : defaultFillOpacity(uvi.symbol);
      colorExpr.push(v, fc);
      opExpr.push(v, fo);
    }
    colorExpr.push(defCol);
    opExpr.push(defOp);
    const outlineExpr: any[] = ['match', fieldExpr];
    let hasOutline = false;
    for (const uvi of infos) {
      const v = normalizeUniqueValueKey(uvi?.value);
      if (!v) continue;
      const ol = symbolOutlineStyle(uvi.symbol);
      const oc = ol.color || 'rgba(0,0,0,0)';
      outlineExpr.push(v, oc);
      if (ol.color) hasOutline = true;
    }
    const defOl = symbolOutlineStyle(defSym);
    outlineExpr.push(defOl.color || 'rgba(0,0,0,0)');
    if (defOl.color) hasOutline = true;
    const out: ArcgisMapboxFillPaint = { 'fill-color': colorExpr, 'fill-opacity': opExpr };
    if (hasOutline) out['fill-outline-color'] = outlineExpr;
    return out;
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).slice(
      0,
      ARCGIS_MAX_CLASS_BREAK_INFOS,
    );
    if (!rawInfos.length) return null;
    const infos = [...rawInfos].filter((br: any) => Number.isFinite(Number(br?.maxValue))).sort((a: any, b: any) => {
      const ma = Number(a?.minValue);
      const mb = Number(b?.minValue);
      if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
      return Number(a?.maxValue) - Number(b?.maxValue);
    });
    if (!infos.length) return null;
    const numGet: any[] = ['to-number', propertyGetExpression(field), 0];
    const colorExpr: any[] = ['case'];
    const opExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const sym = br?.symbol;
      const hollow = esriPolygonFillIsHollow(sym);
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillColor(sym) ?? 'rgba(0,0,0,0)';
      const fo = hollow || fc === 'rgba(0,0,0,0)' ? 0 : defaultFillOpacity(sym);
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, fc);
      opExpr.push(cond, fo);
    }
    const defSym = ren.defaultSymbol;
    const defHollow = esriPolygonFillIsHollow(defSym);
    const defFill = defHollow ? 'rgba(0,0,0,0)' : symbolFillColor(defSym) ?? 'rgba(0,0,0,0)';
    colorExpr.push(defFill);
    opExpr.push(defHollow || defFill === 'rgba(0,0,0,0)' ? 0 : defaultFillOpacity(defSym));
    return { 'fill-color': colorExpr, 'fill-opacity': opExpr };
  }

  return null;
}

export function arcgisDrawingInfoToLinePaint(drawingInfo: any, fallbackLineColor: string): ArcgisMapboxLinePaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const outline = symbolOutlineStyle(ren.symbol);
    const fillCol = symbolFillColor(ren.symbol);
    const lineCol = outline.color || fillCol || fallbackLineColor;
    return { 'line-color': lineCol, 'line-width': outline.width, 'line-opacity': 0.9 };
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const defSym = ren.defaultSymbol;
    const defOutline = symbolOutlineStyle(defSym);
    const defCol = defOutline.color || symbolFillColor(defSym) || fallbackLineColor;
    const defW = defOutline.width;
    const colorExpr: any[] = ['match', fieldExpr];
    const widthExpr: any[] = ['match', fieldExpr];
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(
      0,
      ARCGIS_MAX_UNIQUE_VALUE_INFOS,
    );
    for (const uvi of infos) {
      const v = normalizeUniqueValueKey(uvi?.value);
      if (!v) continue;
      const ol = symbolOutlineStyle(uvi.symbol);
      const lc = ol.color || symbolFillColor(uvi.symbol) || defCol;
      const lw = ol.width;
      colorExpr.push(v, lc);
      widthExpr.push(v, lw);
    }
    colorExpr.push(defCol);
    widthExpr.push(defW);
    return { 'line-color': colorExpr, 'line-width': widthExpr, 'line-opacity': 0.95 };
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).slice(
      0,
      ARCGIS_MAX_CLASS_BREAK_INFOS,
    );
    const infos = [...rawInfos].filter((br: any) => Number.isFinite(Number(br?.maxValue))).sort((a: any, b: any) => {
      const ma = Number(a?.minValue);
      const mb = Number(b?.minValue);
      if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
      return Number(a?.maxValue) - Number(b?.maxValue);
    });
    if (!infos.length) return null;
    const numGet: any[] = ['to-number', propertyGetExpression(field), 0];
    const colorExpr: any[] = ['case'];
    const widthExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const sym = br?.symbol;
      const ol = symbolOutlineStyle(sym);
      const lc = ol.color || symbolFillColor(sym) || fallbackLineColor;
      const lw = ol.width;
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, lc);
      widthExpr.push(cond, lw);
    }
    const defO = symbolOutlineStyle(ren.defaultSymbol);
    colorExpr.push(defO.color || symbolFillColor(ren.defaultSymbol) || fallbackLineColor);
    widthExpr.push(defO.width);
    return { 'line-color': colorExpr, 'line-width': widthExpr, 'line-opacity': 0.95 };
  }

  return null;
}

/** Full layer/table JSON from `GET {layerUrl}?f=pjson` (fields, types, domains, drawingInfo, …). */
export async function fetchArcgisLayerPjson(sourceUrl: string, authToken?: string): Promise<any | null> {
  const u = sourceUrl.replace(/\/?$/, '');
  let url = `${u}?f=pjson`;
  if (authToken?.trim()) {
    const parsed = new URL(url);
    parsed.searchParams.set('token', authToken.trim());
    url = parsed.toString();
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/** Persist only schema needed for domain/subtype labels (Geo AI + GIS Content). */
export function slimArcgisLayerDefinitionForStorage(pjson: any) {
  if (!pjson || typeof pjson !== 'object') return undefined;
  const fields = Array.isArray(pjson.fields) ? pjson.fields : [];
  const types = Array.isArray(pjson.types) ? pjson.types : [];
  const typeIdField = typeof pjson.typeIdField === 'string' ? pjson.typeIdField : undefined;
  if (!fields.length && !types.length && !typeIdField) return undefined;
  return {
    fields,
    types,
    typeIdField,
    geometryType: pjson.geometryType,
    name: pjson.name,
  };
}

export async function fetchArcgisLayerDrawingInfo(sourceUrl: string, authToken?: string): Promise<any | null> {
  const json = await fetchArcgisLayerPjson(sourceUrl, authToken);
  return json?.drawingInfo && typeof json.drawingInfo === 'object' ? json.drawingInfo : null;
}
