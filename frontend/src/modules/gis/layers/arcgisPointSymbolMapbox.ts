/**
 * Mapbox `symbol` layer helpers for ArcGIS picture marker (esriPMS) point symbology.
 */
import {
  arcgisUniqueValueKeyExpression,
  collectUniqueValueMatchKeys,
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
} from './arcgisDrawingInfoMapbox';
import { parseEsriPointSymbol } from './arcgisPointSymbol';

export type ArcgisPointIconEntry = {
  valueKey: string;
  label?: string;
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

function pointIconEntryFromSymbol(
  symbol: unknown,
  imageId: string,
  valueKey: string,
  label?: string,
): ArcgisPointIconEntry | null {
  const preview = parseEsriPointSymbol(symbol, 1);
  if (preview?.kind !== 'picture' || !preview.imageUrl) return null;
  const w = preview.imageWidth ?? 24;
  const h = preview.imageHeight ?? 24;
  return {
    valueKey,
    label,
    imageId,
    imageUrl: preview.imageUrl,
    width: w,
    height: h,
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
    const entry = pointIconEntryFromSymbol(ren.symbol, `${layerSafeId}-arcgis-pms-def`, 'default');
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
      const label = String(uvi?.label ?? '').trim();
      const entry = pointIconEntryFromSymbol(
        uvi?.symbol,
        `${layerSafeId}-arcgis-pms-${i}`,
        valueKey,
        label || undefined,
      );
      if (entry) entries.push(entry);
    }
    const defEntry = pointIconEntryFromSymbol(
      ren.defaultSymbol,
      `${layerSafeId}-arcgis-pms-def`,
      'default',
    );
    if (!entries.length && !defEntry) return null;
    const defaultImageId = defEntry?.imageId ?? entries[0]!.imageId;
    if (defEntry && !entries.some(e => e.imageId === defEntry.imageId)) entries.push(defEntry);
    const maxW = Math.max(...entries.map(e => e.width), 24);
    return {
      fieldExpr: arcgisUniqueValueKeyExpression(ren),
      defaultImageId,
      entries,
      iconSize: Math.max(0.35, Math.min(1.6, maxW / 24)),
    };
  }

  return null;
}

export function buildArcgisPointIconImageMatch(spec: ArcgisPointIconLayerSpec): any[] {
  const expr: any[] = ['match', spec.fieldExpr];
  const keysUsed = new Set<string>();
  for (const entry of spec.entries) {
    if (entry.valueKey === 'default') continue;
    for (const key of collectUniqueValueMatchKeys(entry.valueKey, entry.label)) {
      if (!key || keysUsed.has(key)) continue;
      keysUsed.add(key);
      expr.push(key, entry.imageId);
    }
  }
  expr.push(spec.defaultImageId);
  return expr;
}

export type ArcgisPointIconImageMap = {
  hasImage?: (id: string) => boolean;
  addImage?: (id: string, image: HTMLImageElement | ImageBitmap, options?: { pixelRatio?: number }) => void;
  loadImage?: (
    url: string,
    callback: (err: Error | null | undefined, image?: HTMLImageElement | ImageBitmap) => void,
  ) => void;
};

/** Register picture-marker images on a Mapbox / MapLibre map. Returns true when all icons are already loaded. */
export function ensureArcgisPointIconImages(
  map: ArcgisPointIconImageMap,
  spec: ArcgisPointIconLayerSpec,
  onReady?: () => void,
): boolean {
  const entries = spec.entries;
  if (!entries.length) return false;
  let pending = 0;
  for (const entry of entries) {
    try {
      if (typeof map.hasImage === 'function' && map.hasImage(entry.imageId)) continue;
    } catch {
      /* ignore */
    }
    pending += 1;
    const done = () => {
      pending -= 1;
      if (pending <= 0) onReady?.();
    };
    if (entry.imageUrl.startsWith('data:') && typeof document !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        try {
          if (typeof map.hasImage === 'function' && map.hasImage(entry.imageId)) {
            done();
            return;
          }
          map.addImage?.(entry.imageId, img, { pixelRatio: 2 });
        } catch {
          /* ignore */
        }
        done();
      };
      img.onerror = () => done();
      img.src = entry.imageUrl;
      continue;
    }
    if (typeof map.loadImage === 'function') {
      map.loadImage(entry.imageUrl, (err, image) => {
        if (err || !image) {
          done();
          return;
        }
        try {
          if (typeof map.hasImage === 'function' && map.hasImage(entry.imageId)) {
            done();
            return;
          }
          map.addImage?.(entry.imageId, image);
        } catch {
          /* ignore */
        }
        done();
      });
    } else {
      done();
    }
  }
  return pending === 0;
}
