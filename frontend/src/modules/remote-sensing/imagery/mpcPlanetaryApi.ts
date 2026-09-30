/**
 * Microsoft Planetary Computer helpers — calls analysis_engine `/mpc/*` routes.
 * Run backend: `cd analysis_engine && uvicorn app.main:app --reload --port 8000`
 * Set `VITE_ANALYSIS_ENGINE_URL` to override. In dev, defaults to same-origin `/analysis-api` (Vite proxy).
 */

export function getAnalysisEngineBaseUrl(): string {
  const raw = (import.meta.env.VITE_ANALYSIS_ENGINE_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `${window.location.origin}/analysis-api`;
  }
  return '';
}

export type MpcTemplateId =
  | 'ndvi_s2'
  | 'false_color_s2'
  | 'ndmi_s2'
  | 'ndvi_landsat'
  | 'false_color_landsat';

export async function mpcFetchTemplates(baseUrl: string) {
  const r = await fetch(`${baseUrl}/mpc/templates`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    catalog_url: string;
    stac_api: string;
    templates: Array<{ id: string; label: string; collections?: string[] }>;
    arcgis?: { documentation_urls?: string[] };
  }>;
}

export async function mpcProcess(
  baseUrl: string,
  body: {
    aoi: GeoJSON.Feature;
    collections: string[];
    datetime: string;
    template_id: MpcTemplateId;
    max_items?: number;
    max_cloud_cover?: number;
    catalog_url?: string;
    acs_zip_path?: string;
    clip_to_aoi?: boolean;
    tile_size?: number;
    resolution?: number;
  },
) {
  const r = await fetch(`${baseUrl}/mpc/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  try {
    return JSON.parse(text) as MpcProcessResult;
  } catch {
    throw new Error(text);
  }
}

export type MpcProcessResult = {
  ok: boolean;
  template_id: string;
  collections: string[];
  datetime: string;
  item_count: number;
  scene_datetimes?: string[];
  statistics?: { min: number; max: number; mean: number; std: number };
  rescale?: number[];
  label?: string;
  cog_id?: string;
  cog_download_path?: string;
  arcgis?: { note?: string; links?: string[] };
  detail?: string;
  processing?: {
    clip_to_aoi?: boolean;
    tile_size?: number;
    resolution?: number;
    mode?: string;
  };
};
