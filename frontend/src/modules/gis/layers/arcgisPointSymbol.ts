import {
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
} from './arcgisDrawingInfoMapbox';

export type ArcgisPointSymbolPreview = {
  kind: 'circle' | 'picture' | 'unknown';
  symbolType: string;
  label: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
  opacity: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  angle?: number;
  xoffset?: number;
  yoffset?: number;
};

function esriColorToHexAndOpacity(c: unknown, layerOpacity = 1): { hex: string; opacity: number } {
  if (!Array.isArray(c) || c.length < 3) return { hex: '#3b82f6', opacity: layerOpacity };
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) a = 255;
  const alpha = (a <= 1 ? a : a / 255) * layerOpacity;
  const hex = `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
  return { hex, opacity: Math.max(0, Math.min(1, alpha)) };
}

export function parseEsriSmsSymbol(symbol: any, layerOpacity = 1): ArcgisPointSymbolPreview | null {
  if (!symbol || symbol.type !== 'esriSMS') return null;
  const fill = esriColorToHexAndOpacity(symbol.color, layerOpacity);
  const outline = symbol.outline;
  const stroke = outline?.color
    ? esriColorToHexAndOpacity(outline.color, layerOpacity)
    : { hex: '#1e293b', opacity: layerOpacity };
  const size = Number.isFinite(symbol.size) ? Math.max(2, symbol.size) : 10;
  const radius = Math.max(3, Math.min(20, size / 2));
  const strokeWidth = Number.isFinite(outline?.width) ? Math.max(0.5, outline.width) : 1.5;
  return {
    kind: 'circle',
    symbolType: 'esriSMS',
    label: 'Simple Marker',
    fillColor: fill.hex,
    strokeColor: stroke.hex,
    strokeWidth,
    radius,
    opacity: fill.opacity,
    angle: Number.isFinite(symbol.angle) ? symbol.angle : undefined,
    xoffset: Number.isFinite(symbol.xoffset) ? symbol.xoffset : undefined,
    yoffset: Number.isFinite(symbol.yoffset) ? symbol.yoffset : undefined,
  };
}

export function parseEsriPmsSymbol(symbol: any, layerOpacity = 1): ArcgisPointSymbolPreview | null {
  if (!symbol || symbol.type !== 'esriPMS') return null;
  const w = Number.isFinite(symbol.width) ? symbol.width : Number.isFinite(symbol.size) ? symbol.size : 24;
  const h = Number.isFinite(symbol.height) ? symbol.height : Number.isFinite(symbol.size) ? symbol.size : 24;
  let imageUrl: string | undefined;
  if (typeof symbol.imageData === 'string' && symbol.imageData) {
    const ct = typeof symbol.contentType === 'string' && symbol.contentType ? symbol.contentType : 'image/png';
    imageUrl = `data:${ct};base64,${symbol.imageData}`;
  } else if (typeof symbol.url === 'string' && symbol.url) {
    imageUrl = symbol.url;
  }
  if (!imageUrl) return null;
  return {
    kind: 'picture',
    symbolType: 'esriPMS',
    label: 'Picture Marker',
    fillColor: '#ffffff',
    strokeColor: '#64748b',
    strokeWidth: 0,
    radius: Math.max(8, Math.min(28, Math.max(w, h) / 2)),
    opacity: layerOpacity,
    imageUrl,
    imageWidth: w,
    imageHeight: h,
    angle: Number.isFinite(symbol.angle) ? symbol.angle : undefined,
    xoffset: Number.isFinite(symbol.xoffset) ? symbol.xoffset : undefined,
    yoffset: Number.isFinite(symbol.yoffset) ? symbol.yoffset : undefined,
  };
}

export function parseEsriSfsSymbol(symbol: any, layerOpacity = 1): ArcgisPointSymbolPreview | null {
  if (!symbol || symbol.type !== 'esriSFS') return null;
  const fill = esriColorToHexAndOpacity(symbol.color, layerOpacity);
  const outline = symbol.outline;
  const stroke = outline?.color
    ? esriColorToHexAndOpacity(outline.color, layerOpacity)
    : { hex: '#64748b', opacity: layerOpacity };
  const hollow = fill.opacity < 0.04;
  const strokeWidth = Number.isFinite(outline?.width) ? Math.max(0.5, outline.width) : 1;
  return {
    kind: 'circle',
    symbolType: 'esriSFS',
    label: 'Polygon',
    fillColor: hollow ? 'transparent' : fill.hex,
    strokeColor: stroke.hex,
    strokeWidth,
    radius: 8,
    opacity: hollow ? stroke.opacity : fill.opacity,
  };
}

export function parseEsriPointSymbol(symbol: any, layerOpacity = 1): ArcgisPointSymbolPreview | null {
  if (!symbol || typeof symbol !== 'object') return null;
  const sfs = parseEsriSfsSymbol(symbol, layerOpacity);
  if (sfs) return sfs;
  const sms = parseEsriSmsSymbol(symbol, layerOpacity);
  if (sms) return sms;
  const pms = parseEsriPmsSymbol(symbol, layerOpacity);
  if (pms) return pms;
  const type = String(symbol.type || 'unknown');
  return {
    kind: 'unknown',
    symbolType: type,
    label: type,
    fillColor: '#94a3b8',
    strokeColor: '#475569',
    strokeWidth: 1,
    radius: 6,
    opacity: layerOpacity,
  };
}

/** Pick a representative symbol from an ArcGIS renderer for studio preview. */
export function extractRepresentativePointSymbol(renderer: any): any | null {
  if (!renderer || typeof renderer !== 'object') return null;
  const type = String(renderer.type || '');
  if (type === 'simple') return renderer.symbol ?? null;
  if (type === 'uniqueValue') {
    const infos = flattenArcgisUniqueValueInfos(renderer);
    if (infos[0]?.symbol) return infos[0].symbol;
    return renderer.defaultSymbol ?? null;
  }
  if (type === 'classBreaks') {
    const infos = Array.isArray(renderer.classBreakInfos) ? renderer.classBreakInfos : [];
    if (infos[0]?.symbol) return infos[0].symbol;
    return renderer.defaultSymbol ?? null;
  }
  return renderer.symbol ?? null;
}

export function arcgisPointSymbolPreviewFromDrawingInfo(
  drawingInfo: unknown,
  layerOpacity = 1,
): ArcgisPointSymbolPreview | null {
  try {
    const ren = (drawingInfo as any)?.renderer;
    const symbol = extractRepresentativePointSymbol(ren);
    if (!symbol) {
      console.warn('[si-point-symbol] No point symbol found in drawingInfo.renderer', ren?.type);
      return null;
    }
    const preview = parseEsriPointSymbol(symbol, layerOpacity);
    if (!preview) console.warn('[si-point-symbol] Unsupported point symbol type', symbol?.type);
    return preview;
  } catch (err) {
    console.error('[si-point-symbol] Failed to parse drawingInfo symbol', err);
    return null;
  }
}

export function uniqueValuePointSymbolPreviews(renderer: any, layerOpacity = 1, max = 64): ArcgisPointSymbolPreview[] {
  if (!renderer || renderer.type !== 'uniqueValue') return [];
  const infos = flattenArcgisUniqueValueInfos(renderer);
  const out: ArcgisPointSymbolPreview[] = [];
  for (const uvi of infos.slice(0, max)) {
    const p = parseEsriPointSymbol(uvi?.symbol, layerOpacity);
    if (p) {
      out.push({
        ...p,
        label: String(uvi?.label ?? normalizeUniqueValueKey(uvi?.value) ?? p.label),
      });
    }
  }
  const def = parseEsriPointSymbol(renderer.defaultSymbol, layerOpacity);
  if (def) out.push({ ...def, label: 'Default' });
  return out;
}
