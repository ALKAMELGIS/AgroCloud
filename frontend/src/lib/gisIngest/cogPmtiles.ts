/**
 * Browser-side COG / PMTiles / XYZ helpers for the GIS Data Manager (R2).
 * Full streaming COG decode needs workers; here we validate URLs and build Mapbox-ready templates.
 */

export type TileServiceKind = 'xyz' | 'tms' | 'wmts' | 'pmtiles' | 'cog';

export function detectTileServiceKind(url: string): TileServiceKind {
  const u = url.toLowerCase();
  if (u.includes('.pmtiles') || u.includes('pmtiles://')) return 'pmtiles';
  if (/\.tif{1,2}(\?|$)/i.test(u) || u.includes('cog')) return 'cog';
  if (u.includes('wmts') || u.includes('tilematrixset')) return 'wmts';
  if (u.includes('{-y}') || u.includes('tms')) return 'tms';
  return 'xyz';
}

/** Normalize common XYZ templates for Mapbox raster sources. */
export function normalizeXyzTemplate(url: string): string {
  let t = url.trim();
  t = t.replace(/\{zoom\}/gi, '{z}');
  t = t.replace(/\{[-]?y\}/gi, m => (m.toLowerCase().includes('-') ? '{-y}' : '{y}'));
  return t;
}

export type CogProbeResult = {
  ok: boolean;
  message: string;
  acceptRanges?: boolean;
  contentType?: string;
};

/** HEAD-probe a URL to see if it is likely a Cloud Optimized GeoTIFF. */
export async function probeCogUrl(url: string, signal?: AbortSignal): Promise<CogProbeResult> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal, mode: 'cors' });
    const acceptRanges = (res.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');
    const contentType = res.headers.get('content-type') || undefined;
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} probing COG URL`, contentType, acceptRanges };
    }
    if (!acceptRanges) {
      return {
        ok: true,
        message: 'URL reachable but Accept-Ranges not advertised — COG streaming may fall back to full download.',
        contentType,
        acceptRanges: false,
      };
    }
    return { ok: true, message: 'COG endpoint looks range-request capable.', contentType, acceptRanges: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'COG probe failed' };
  }
}
