/**
 * Map ArcGIS Feature Layer `drawingInfo` (as returned by `.../layer/{id}?f=pjson`)
 * to Mapbox GL JS paint props for GeoJSON fill/line layers (subset of renderers).
 */
import { sanitizeMapboxPaint, MAPBOX_SAFE_FALLBACK_COLOR } from './mapboxPaintSanitize';

/** Prevent huge renderers from blowing the JS stack or freezing Mapbox expression compilation. */
const ARCGIS_MAX_UNIQUE_VALUE_INFOS = 220;
const ARCGIS_MAX_CLASS_BREAK_INFOS = 160;
const ARCGIS_DRAWING_INFO_MAX_JSON_CHARS = 380_000;

/** Normalize ArcGIS unique-value keys for Mapbox `match` (string compare). */
export function normalizeUniqueValueKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

/** All string keys that may appear on features for one unique-value class (code, label, trimmed label). */
export function collectUniqueValueMatchKeys(value: string, label?: string): string[] {
  const keys = new Set<string>();
  const add = (raw: unknown) => {
    const key = normalizeUniqueValueKey(raw);
    if (!key) return;
    keys.add(key);
    const lower = key.toLowerCase();
    if (lower !== key) keys.add(lower);
  };
  add(value);
  if (label) {
    add(label);
    add(label.trim());
    add(label.trim().toLowerCase());
  }
  const num = Number(value);
  if (Number.isFinite(num) && Number.isInteger(num)) add(String(num));
  return [...keys];
}

export type ArcgisUniqueValueLegendItem = {
  value: string;
  label: string;
  fillColor: string;
  outlineColor: string;
  outlineWidth: number;
  hollow: boolean;
};

/** Legend rows for Symbology Studio — one entry per unique-value / subtype class. */
export function buildArcgisUniqueValueLegendItems(
  drawingInfo: unknown,
  layerOpacity = 1,
): ArcgisUniqueValueLegendItem[] {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer;
  if (!ren || String(ren.type || '') !== 'uniqueValue') return [];
  const infos = flattenArcgisUniqueValueInfos(ren);
  return infos.map(uvi => {
    const sym = uvi?.symbol;
    const hollow = esriPolygonFillIsHollow(sym);
    const fill = hollow ? 'rgba(0,0,0,0)' : symbolFillColor(sym) ?? 'rgba(0,0,0,0)';
    const ol = symbolOutlineStyle(sym);
    return {
      value: normalizeUniqueValueKey(uvi?.value),
      label: String(uvi?.label ?? uvi?.value ?? '').trim() || normalizeUniqueValueKey(uvi?.value),
      fillColor: hollow ? 'transparent' : fill,
      outlineColor: ol.color ? esriColorToCss(sym?.outline?.color) ?? ol.color : MAPBOX_SAFE_FALLBACK_COLOR,
      outlineWidth: ol.width,
      hollow,
    };
  });
}

/**
 * Flatten `uniqueValueInfos` or newer `uniqueValueGroups` into a single list
 * understood by Mapbox paint conversion and Symbology Studio previews.
 */
export function flattenArcgisUniqueValueInfos(renderer: any): any[] {
  if (!renderer || typeof renderer !== 'object') return [];
  const direct = Array.isArray(renderer.uniqueValueInfos) ? renderer.uniqueValueInfos : [];
  if (direct.length) return direct;
  const groups = Array.isArray(renderer.uniqueValueGroups) ? renderer.uniqueValueGroups : [];
  const delim =
    typeof renderer.fieldDelimiter === 'string' && renderer.fieldDelimiter.length
      ? renderer.fieldDelimiter
      : ',';
  const out: any[] = [];
  for (const group of groups) {
    const classes = Array.isArray(group?.classes) ? group.classes : [];
    for (const cls of classes) {
      const valueSets = Array.isArray(cls?.values) ? cls.values : [];
      for (const valueSet of valueSets) {
        const parts = Array.isArray(valueSet) ? valueSet : [valueSet];
        const value = parts.map(p => normalizeUniqueValueKey(p)).filter(Boolean).join(delim);
        if (!value) continue;
        out.push({
          value,
          label: cls?.label ?? cls?.description ?? value,
          symbol: cls?.symbol,
        });
      }
    }
  }
  return out;
}

function normalizeArcgisRendererForMapbox(renderer: any): any {
  if (!renderer || typeof renderer !== 'object') return renderer;
  if (String(renderer.type || '') !== 'uniqueValue') return renderer;
  const flat = flattenArcgisUniqueValueInfos(renderer);
  if (!flat.length) return renderer;
  return { ...renderer, uniqueValueInfos: flat };
}

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
    di.renderer = normalizeArcgisRendererForMapbox(ren);
    if (Array.isArray(di.renderer.uniqueValueInfos) && di.renderer.uniqueValueInfos.length > ARCGIS_MAX_UNIQUE_VALUE_INFOS) {
      di.renderer.uniqueValueInfos = di.renderer.uniqueValueInfos.slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    }
    if (Array.isArray(di.renderer.classBreakInfos) && di.renderer.classBreakInfos.length > ARCGIS_MAX_CLASS_BREAK_INFOS) {
      di.renderer.classBreakInfos = di.renderer.classBreakInfos.slice(0, ARCGIS_MAX_CLASS_BREAK_INFOS);
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

function esriColorToRgbCss(c: unknown): string | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  return `rgb(${r},${g},${b})`;
}

function esriColorAlpha(c: unknown): number {
  if (!Array.isArray(c) || c.length < 3) return 1;
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) return 1;
  return Math.max(0, Math.min(1, a <= 1 ? a : a / 255));
}

/** Full rgba string — for legend/CSS previews only. Mapbox paint uses rgb + separate opacity. */
function esriColorToCss(c: unknown): string | null {
  const rgb = esriColorToRgbCss(c);
  if (!rgb) return null;
  const a = esriColorAlpha(c);
  if (a >= 0.999) return rgb;
  const m = rgb.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  if (!m) return rgb;
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

function symbolFillRgb(symbol: any): string | null {
  if (!symbol) return null;
  if (Array.isArray(symbol.color)) return esriColorToRgbCss(symbol.color);
  return null;
}

function symbolFillOpacity(symbol: any): number {
  if (!symbol?.color) return 0.42;
  return esriColorAlpha(symbol.color);
}

function symbolFillColor(symbol: any): string | null {
  if (!symbol) return null;
  if (Array.isArray(symbol.color)) return esriColorToCss(symbol.color);
  return null;
}

function symbolOutlineStyle(symbol: any): { color: string | null; width: number; opacity: number } {
  const o = symbol?.outline;
  if (!o) return { color: null, width: 1, opacity: 1 };
  const color = Array.isArray(o.color) ? esriColorToRgbCss(o.color) : null;
  const w = typeof o.width === 'number' && Number.isFinite(o.width) ? Math.max(0.5, o.width) : 1;
  const opacity = Array.isArray(o.color) ? esriColorAlpha(o.color) : 1;
  return { color, width: w, opacity };
}

function defaultFillOpacity(symbol: any): number {
  return symbolFillOpacity(symbol);
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

/** Field-name variants — renderer field names may differ from aliases or casing in features. */
function propertyKeyVariants(field: string): string[] {
  const f = field.trim();
  if (!f) return [];
  const underscored = f.replace(/\s+/g, '_');
  const noSpace = f.replace(/\s+/g, '');
  return Array.from(
    new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()]),
  ).filter(Boolean);
}

/** Coalesce GeoJSON attribute keys — renderer field names may differ from aliases or casing in features. */
function propertyGetExpression(field: string): any {
  const variants = propertyKeyVariants(field);
  if (!variants.length) return ['literal', ''];
  if (variants.length === 1) return ['get', variants[0]!];
  const inner: any[] = ['coalesce'];
  for (const v of variants) inner.push(['get', v]);
  inner.push(['literal', '']);
  return inner;
}

/**
 * Feature-has-field check across name variants. Mapbox `has` takes the property NAME —
 * passing a `get` expression makes Mapbox string-assert the property VALUE, which throws
 * at render time for numeric values (crashes fill-outline-color: no spec default → null →
 * `toPremultipliedRenderColor` TypeError).
 */
function propertyHasExpression(field: string): any {
  const variants = propertyKeyVariants(field);
  if (!variants.length) return false;
  if (variants.length === 1) return ['has', variants[0]!];
  const anyExpr: any[] = ['any'];
  for (const v of variants) anyExpr.push(['has', v]);
  return anyExpr;
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
  if (parts.length === 1) {
    const field = parts[0]!;
    const raw = propertyGetExpression(field);
    // Numeric coded values (e.g. Structure_Type = 1000) plus string domain labels (e.g. "Greenhouse").
    return [
      'case',
      ['all', propertyHasExpression(field), ['!=', ['to-number', raw, -999999], -999999]],
      ['to-string', ['to-number', raw, -999999]],
      ['to-string', raw],
    ];
  }
  const concat: any[] = ['concat'];
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) concat.push(delim);
    concat.push(['to-string', propertyGetExpression(parts[i]!)]);
  }
  return concat;
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

function finalizeArcgisFillPaint(paint: ArcgisMapboxFillPaint): ArcgisMapboxFillPaint {
  return sanitizeMapboxPaint(paint, MAPBOX_SAFE_FALLBACK_COLOR) as ArcgisMapboxFillPaint;
}

function finalizeArcgisLinePaint(paint: ArcgisMapboxLinePaint): ArcgisMapboxLinePaint {
  return sanitizeMapboxPaint(paint, MAPBOX_SAFE_FALLBACK_COLOR) as ArcgisMapboxLinePaint;
}

function finalizeArcgisCirclePaint(paint: CirclePaintProps): CirclePaintProps {
  return sanitizeMapboxPaint(paint, MAPBOX_SAFE_FALLBACK_COLOR);
}

const ARCGIS_UNMATCHED_OUTLINE_FALLBACK = 'rgba(148, 163, 184, 0.85)';

/** Returns null if renderer is unsupported or missing — caller should fall back to solid layer color. */
function pushUniqueValueLineKeys(
  colorExpr: any[],
  widthExpr: any[],
  value: string,
  label: string | undefined,
  lineColor: string,
  lineWidth: number,
): void {
  const keys = new Set<string>();
  for (const key of collectUniqueValueMatchKeys(value, label)) {
    if (keys.has(key)) continue;
    keys.add(key);
    colorExpr.push(key, lineColor);
    widthExpr.push(key, lineWidth);
  }
}

function pushUniqueValueMatchKeys(
  colorExpr: any[],
  opExpr: any[],
  outlineExpr: any[] | null,
  value: string,
  label: string | undefined,
  fc: string,
  fo: number,
  oc: string | null,
): void {
  const keys = new Set<string>();
  for (const key of collectUniqueValueMatchKeys(value, label)) {
    if (keys.has(key)) continue;
    keys.add(key);
    colorExpr.push(key, fc);
    opExpr.push(key, fo);
    if (outlineExpr && oc) outlineExpr.push(key, oc);
  }
}

export function arcgisDrawingInfoToFillPaint(drawingInfo: any): ArcgisMapboxFillPaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const col = symbolFillRgb(ren.symbol);
    if (!col) return null;
    if (esriPolygonFillIsHollow(ren.symbol)) {
      return finalizeArcgisFillPaint({ 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 });
    }
    return finalizeArcgisFillPaint({ 'fill-color': col, 'fill-opacity': symbolFillOpacity(ren.symbol) });
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const infos = flattenArcgisUniqueValueInfos(ren).slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    const defSym = ren.defaultSymbol ?? infos[infos.length - 1]?.symbol;
    const defCol = esriPolygonFillIsHollow(defSym)
      ? 'rgba(0,0,0,0)'
      : symbolFillRgb(defSym) || 'rgba(0,0,0,0)';
    const defOp = esriPolygonFillIsHollow(defSym) ? 0 : symbolFillOpacity(defSym);
    const colorExpr: any[] = ['match', fieldExpr];
    const opExpr: any[] = ['match', fieldExpr];
    for (const uvi of infos) {
      const v = normalizeUniqueValueKey(uvi?.value);
      if (!v) continue;
      const hollow = esriPolygonFillIsHollow(uvi.symbol);
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillRgb(uvi.symbol) || defCol;
      const fo = hollow ? 0 : symbolFillOpacity(uvi.symbol);
      pushUniqueValueMatchKeys(colorExpr, opExpr, null, v, String(uvi?.label ?? ''), fc, fo, null);
    }
    colorExpr.push(defCol);
    opExpr.push(defOp);
    // Polygon outlines are drawn on the line layer (independent of fill-opacity).
    return finalizeArcgisFillPaint({ 'fill-color': colorExpr, 'fill-opacity': opExpr });
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
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillRgb(sym) ?? 'rgba(0,0,0,0)';
      const fo = hollow || fc === 'rgba(0,0,0,0)' ? 0 : symbolFillOpacity(sym);
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, fc);
      opExpr.push(cond, fo);
    }
    const defSym = ren.defaultSymbol;
    const defHollow = esriPolygonFillIsHollow(defSym);
    const defFill = defHollow ? 'rgba(0,0,0,0)' : symbolFillRgb(defSym) ?? 'rgba(0,0,0,0)';
    colorExpr.push(defFill);
    opExpr.push(defHollow || defFill === 'rgba(0,0,0,0)' ? 0 : symbolFillOpacity(defSym));
    return finalizeArcgisFillPaint({ 'fill-color': colorExpr, 'fill-opacity': opExpr });
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
    return finalizeArcgisLinePaint({ 'line-color': lineCol, 'line-width': outline.width, 'line-opacity': 0.9 });
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const infos = flattenArcgisUniqueValueInfos(ren).slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    const defSym = ren.defaultSymbol ?? infos[infos.length - 1]?.symbol;
    const defOutline = symbolOutlineStyle(defSym);
    const defCol = defOutline.color || symbolFillRgb(defSym) || fallbackLineColor;
    const defW = defOutline.width;
    const colorExpr: any[] = ['match', fieldExpr];
    const widthExpr: any[] = ['match', fieldExpr];
    for (const uvi of infos) {
      const v = normalizeUniqueValueKey(uvi?.value);
      if (!v) continue;
      const ol = symbolOutlineStyle(uvi.symbol);
      const lc = ol.color || symbolFillRgb(uvi.symbol) || defCol;
      const lw = ol.width;
      pushUniqueValueLineKeys(colorExpr, widthExpr, v, String(uvi?.label ?? ''), lc, lw);
    }
    colorExpr.push(defCol);
    widthExpr.push(defW);
    return finalizeArcgisLinePaint({
      'line-color': colorExpr,
      'line-width': widthExpr,
      'line-opacity': 1,
    });
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
    return finalizeArcgisLinePaint({ 'line-color': colorExpr, 'line-width': widthExpr, 'line-opacity': 0.95 });
  }

  return null;
}

type CirclePaintProps = Record<string, unknown>;

function smsSymbolToCircleProps(symbol: any): CirclePaintProps | null {
  if (!symbol || symbol.type !== 'esriSMS') return pmsSymbolToCircleProps(symbol);
  const fillCol = symbolFillColor(symbol) || 'rgba(59,130,246,0.85)';
  const outline = symbolOutlineStyle(symbol);
  const size = typeof symbol?.size === 'number' && Number.isFinite(symbol.size) ? Math.max(2, symbol.size) : 8;
  const radius = Math.max(2, Math.min(24, size / 2));
  const fillOp = defaultFillOpacity(symbol);
  return {
    'circle-radius': radius,
    'circle-color': fillCol,
    'circle-opacity': fillOp,
    'circle-stroke-color': outline.color || 'rgba(30,41,59,0.9)',
    'circle-stroke-width': outline.width,
    'circle-stroke-opacity': 0.95,
  };
}

/** Approximate picture markers as circles until sprite icons are registered. */
function pmsSymbolToCircleProps(symbol: any): CirclePaintProps | null {
  if (!symbol || symbol.type !== 'esriPMS') return null;
  const w = Number.isFinite(symbol.width) ? symbol.width : Number.isFinite(symbol.size) ? symbol.size : 16;
  const h = Number.isFinite(symbol.height) ? symbol.height : Number.isFinite(symbol.size) ? symbol.size : 16;
  const radius = Math.max(4, Math.min(22, Math.max(w, h) / 2));
  return {
    'circle-radius': radius,
    'circle-color': 'rgba(59,130,246,0.88)',
    'circle-opacity': 0.92,
    'circle-stroke-color': 'rgba(30,41,59,0.85)',
    'circle-stroke-width': 1,
    'circle-stroke-opacity': 0.95,
  };
}

function defaultCirclePropsFromRenderer(ren: any, infos: any[]): CirclePaintProps {
  const defSym = ren?.defaultSymbol;
  const fromDef = smsSymbolToCircleProps(defSym);
  if (fromDef) return fromDef;
  for (const uvi of infos) {
    const p = smsSymbolToCircleProps(uvi?.symbol);
    if (p) return p;
  }
  return smsSymbolToCircleProps({
    type: 'esriSMS',
    size: 8,
    color: [59, 130, 246, 220],
    outline: { color: [30, 41, 59, 230], width: 1 },
  })!;
}

function buildCircleMatchPaint(
  fieldExpr: any,
  infos: any[],
  prop: 'circle-color' | 'circle-opacity' | 'circle-radius' | 'circle-stroke-color' | 'circle-stroke-width',
  defSym: any,
  defProps?: CirclePaintProps | null,
): any[] | string | number {
  const defResolved = defProps ?? smsSymbolToCircleProps(defSym);
  const defVal = defResolved?.[prop];
  const expr: any[] = ['match', fieldExpr];
  const keysUsed = new Set<string>();
  for (const uvi of infos) {
    const v = normalizeUniqueValueKey(uvi?.value);
    if (!v) continue;
    const props = smsSymbolToCircleProps(uvi?.symbol);
    if (!props || props[prop] === undefined) continue;
    for (const key of collectUniqueValueMatchKeys(v, String(uvi?.label ?? ''))) {
      if (keysUsed.has(key)) continue;
      keysUsed.add(key);
      expr.push(key, props[prop]);
    }
  }
  expr.push(defVal ?? (prop.includes('width') || prop.includes('radius') ? 4 : prop.includes('opacity') ? 0.85 : 'rgba(59,130,246,0.85)'));
  return expr;
}

/** Map ArcGIS point renderers to Mapbox `circle` paint (esriSMS; picture markers need icon layer). */
export function arcgisDrawingInfoToCirclePaint(drawingInfo: any): CirclePaintProps | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const props =
      smsSymbolToCircleProps(ren.symbol) ??
      smsSymbolToCircleProps({ type: 'esriSMS', size: 8, color: [59, 130, 246, 220] });
    return props ? finalizeArcgisCirclePaint(props) : null;
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const infos = flattenArcgisUniqueValueInfos(ren).slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    const defSym = ren.defaultSymbol;
    const defProps = defaultCirclePropsFromRenderer(ren, infos);
    return finalizeArcgisCirclePaint({
      'circle-radius': buildCircleMatchPaint(fieldExpr, infos, 'circle-radius', defSym, defProps),
      'circle-color': buildCircleMatchPaint(fieldExpr, infos, 'circle-color', defSym, defProps),
      'circle-opacity': buildCircleMatchPaint(fieldExpr, infos, 'circle-opacity', defSym, defProps),
      'circle-stroke-color': buildCircleMatchPaint(fieldExpr, infos, 'circle-stroke-color', defSym, defProps),
      'circle-stroke-width': buildCircleMatchPaint(fieldExpr, infos, 'circle-stroke-width', defSym, defProps),
      'circle-stroke-opacity': 0.95,
    });
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
    const radiusExpr: any[] = ['case'];
    const colorExpr: any[] = ['case'];
    const opExpr: any[] = ['case'];
    const strokeExpr: any[] = ['case'];
    const strokeWExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const props = smsSymbolToCircleProps(br?.symbol);
      if (!props) continue;
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      radiusExpr.push(cond, props['circle-radius']);
      colorExpr.push(cond, props['circle-color']);
      opExpr.push(cond, props['circle-opacity']);
      strokeExpr.push(cond, props['circle-stroke-color']);
      strokeWExpr.push(cond, props['circle-stroke-width']);
    }
    const defProps = smsSymbolToCircleProps(ren.defaultSymbol) ?? smsSymbolToCircleProps({ type: 'esriSMS', size: 8, color: [59, 130, 246, 200] });
    radiusExpr.push(defProps?.['circle-radius'] ?? 4);
    colorExpr.push(defProps?.['circle-color'] ?? 'rgba(59,130,246,0.85)');
    opExpr.push(defProps?.['circle-opacity'] ?? 0.85);
    strokeExpr.push(defProps?.['circle-stroke-color'] ?? 'rgba(30,41,59,0.9)');
    strokeWExpr.push(defProps?.['circle-stroke-width'] ?? 1);
    return finalizeArcgisCirclePaint({
      'circle-radius': radiusExpr,
      'circle-color': colorExpr,
      'circle-opacity': opExpr,
      'circle-stroke-color': strokeExpr,
      'circle-stroke-width': strokeWExpr,
      'circle-stroke-opacity': 0.95,
    });
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

/** Resolve cached or embedded ArcGIS `drawingInfo` for map paint / Symbology Studio. */
export function resolveLayerArcgisDrawingInfo(layer: {
  arcgisDrawingInfo?: unknown;
  arcgisDrawingInfoService?: unknown;
  arcgisLayerDefinition?: { drawingInfo?: unknown } | null;
  symbology?: { useArcGisOnline?: boolean };
  useArcGisSymbology?: boolean;
}): Record<string, unknown> | null {
  const wantsOnline =
    layer.symbology?.useArcGisOnline === true ||
    (layer.symbology?.useArcGisOnline !== false && layer.useArcGisSymbology === true);
  if (wantsOnline) {
    if (layer.arcgisDrawingInfoService) {
      const service = sanitizeArcgisDrawingInfoForClient(layer.arcgisDrawingInfoService);
      if (service) return service;
    }
    return null;
  }
  if (layer.arcgisDrawingInfo) {
    const direct = sanitizeArcgisDrawingInfoForClient(layer.arcgisDrawingInfo);
    if (direct) return direct;
  }
  if (layer.arcgisDrawingInfoService) {
    const service = sanitizeArcgisDrawingInfoForClient(layer.arcgisDrawingInfoService);
    if (service) return service;
  }
  const embedded = (layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null)?.drawingInfo;
  if (embedded) {
    return sanitizeArcgisDrawingInfoForClient(embedded);
  }
  return null;
}

/** Compact signature for canvas repaint when renderer symbology changes. */
export function arcgisDrawingInfoPaintSig(drawingInfo: unknown): string {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer;
  if (!ren || typeof ren !== 'object') return '';
  const t = String(ren.type || '');
  const field = pickRendererPrimaryField(ren);
  const n = t === 'uniqueValue' ? flattenArcgisUniqueValueInfos(ren).length : 0;
  return `${t}:${field}:${n}`;
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
