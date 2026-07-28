/** Satellite imagery provider catalogue for the Remote Sensing toolbox. */

export type RemoteSensingProviderId =
  | 'sentinel-hub'
  | 'aster'
  | 'space42'
  | 'airbus'
  | 'maxar'
  | 'planet'
  | 'blacksky'
  | 'satellogic'
  | 'esa-sentinel'
  | 'nasa-landsat'
  | 'umbra'
  | 'mbrsc'
  | 'jaea'
  | 'oneatlas'

/** OGC WMS host family used for Layer Live / AOI map tiles. */
export type RemoteSensingMapBackend = 'sentinel-hub' | 'cdse'

export type RemoteSensingCollectionDef = {
  id: string
  label: string
}

export type RemoteSensingProviderDef = {
  id: RemoteSensingProviderId
  label: string
  /**
   * When true, provider has a first-class live map backend (no vendor-API gap for Layer Live).
   * Non-integrated vendors still stream open Sentinel/Landsat tiles so the map canvas responds.
   */
  integrated: boolean
  /** Which OGC WMS deployment serves map tiles for this provider. */
  mapBackend: RemoteSensingMapBackend
  collections: RemoteSensingCollectionDef[]
  hint?: string
}

export const REMOTE_SENSING_PROVIDER_CATALOG: RemoteSensingProviderDef[] = [
  {
    id: 'sentinel-hub',
    label: 'Sentinel Hub',
    integrated: true,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
      { id: 'sentinel-2-l1c', label: 'Sentinel-2 L1C' },
    ],
  },
  {
    id: 'aster',
    label: 'ASTER',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [{ id: 'aster-l1t', label: 'ASTER L1T (Planetary Computer)' }],
  },
  {
    id: 'space42',
    label: 'Space42',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'space42-optical', label: 'Optical mosaic' },
      { id: 'space42-sar', label: 'SAR' },
    ],
    hint: 'Live map uses open Sentinel-2 until Space42 API credentials are connected.',
  },
  {
    id: 'airbus',
    label: 'Airbus',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'pleiades-neo', label: 'Pleiades Neo' },
      { id: 'pleiades', label: 'Pleiades' },
      { id: 'spot-6-7', label: 'SPOT 6/7' },
    ],
    hint: 'Live map uses open Sentinel-2 until Airbus archive credentials are connected.',
  },
  {
    id: 'maxar',
    label: 'Maxar',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'worldview-3', label: 'WorldView-3' },
      { id: 'worldview-legion', label: 'WorldView Legion' },
    ],
    hint: 'Live map uses open Sentinel-2 until Maxar API credentials are connected.',
  },
  {
    id: 'planet',
    label: 'Planet',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'planetscope', label: 'PlanetScope (3–5 m)' },
      { id: 'skysat', label: 'SkySat (50 cm)' },
    ],
    hint: 'Live map uses open Sentinel-2 until Planet API credentials are connected.',
  },
  {
    id: 'blacksky',
    label: 'BlackSky',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'blacksky-spectra', label: 'Spectra' },
      { id: 'blacksky-global', label: 'Global monitoring' },
    ],
    hint: 'Live map uses open Sentinel-2 until BlackSky API credentials are connected.',
  },
  {
    id: 'satellogic',
    label: 'Satellogic',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'newsat', label: 'NewSat constellation' },
      { id: 'satellogic-markiv', label: 'Mark IV' },
    ],
    hint: 'Live map uses open Sentinel-2 until Satellogic API credentials are connected.',
  },
  {
    id: 'esa-sentinel',
    label: 'ESA Sentinel',
    integrated: true,
    mapBackend: 'cdse',
    collections: [
      { id: 'sentinel-1-grd', label: 'Sentinel-1 GRD' },
      { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
      { id: 'sentinel-3-olci', label: 'Sentinel-3 OLCI' },
    ],
    hint: 'Copernicus Sentinel via CDSE (sh.dataspace.copernicus.eu). Falls back to Sentinel Hub open data if CDSE WMS instance is not set.',
  },
  {
    id: 'nasa-landsat',
    label: 'NASA Landsat',
    integrated: true,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'landsat-8-9', label: 'Landsat 8/9 OLI/TIRS' },
      { id: 'hls', label: 'Harmonized Landsat Sentinel (HLS)' },
    ],
    hint: 'Landsat / HLS via Sentinel Hub featured collections.',
  },
  {
    id: 'umbra',
    label: 'Umbra',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [{ id: 'umbra-sar', label: 'Umbra SAR (X-band)' }],
    hint: 'Live map uses open Sentinel-2 until Umbra SAR credentials are connected.',
  },
  {
    id: 'mbrsc',
    label: 'MBRSC',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'khalifasat', label: 'KhalifaSat' },
      { id: 'dubaisat-2', label: 'DubaiSat-2' },
    ],
    hint: 'Live map uses open Sentinel-2 until MBRSC credentials are connected.',
  },
  {
    id: 'jaea',
    label: 'JAEA',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'alos-2', label: 'ALOS-2 PALSAR-2' },
      { id: 'alos-4', label: 'ALOS-4' },
    ],
    hint: 'Live map uses open Sentinel-2 until JAXA credentials are connected.',
  },
  {
    id: 'oneatlas',
    label: 'OneAtlas',
    integrated: false,
    mapBackend: 'sentinel-hub',
    collections: [
      { id: 'oneatlas-basemap', label: 'Basemap' },
      { id: 'oneatlas-live', label: 'Live layers' },
    ],
    hint: 'Live map uses open Sentinel-2 until OneAtlas credentials are connected.',
  },
]

const BY_ID = new Map(REMOTE_SENSING_PROVIDER_CATALOG.map(p => [p.id, p]))

export const DEFAULT_REMOTE_SENSING_PROVIDER: RemoteSensingProviderId = 'sentinel-hub'

export function remoteSensingProviderDef(id: string): RemoteSensingProviderDef {
  return BY_ID.get(id as RemoteSensingProviderId) ?? REMOTE_SENSING_PROVIDER_CATALOG[0]!
}

export function remoteSensingProviderOptions(): Array<{ id: string; label: string }> {
  return REMOTE_SENSING_PROVIDER_CATALOG.map(p => ({ id: p.id, label: p.label }))
}

export function remoteSensingCollectionsForProvider(providerId: string): RemoteSensingCollectionDef[] {
  return remoteSensingProviderDef(providerId).collections
}

export function isRemoteSensingProviderIntegrated(providerId: string): boolean {
  return remoteSensingProviderDef(providerId).integrated
}

export function resolveRemoteSensingMapBackend(providerId: string): RemoteSensingMapBackend {
  return remoteSensingProviderDef(providerId).mapBackend
}

export function defaultCollectionForProvider(providerId: string): string {
  const cols = remoteSensingCollectionsForProvider(providerId)
  return cols[0]?.id ?? 'sentinel-2-l2a'
}

/** Short status line for the toolbox / legend when provider drives the map. */
export function remoteSensingProviderMapStatus(providerId: string, collectionId?: string): string {
  const def = remoteSensingProviderDef(providerId)
  const col =
    def.collections.find(c => c.id === collectionId)?.label ??
    def.collections[0]?.label ??
    'Imagery'
  const backend =
    def.mapBackend === 'cdse' ? 'CDSE / ESA Dataspace' : 'Sentinel Hub'
  return `${def.label} · ${col} · ${backend}`
}

/**
 * Planetary Computer STAC collection ids used for AOI scene-date discovery.
 * Dates drive Imagery date auto-follow and nearest-scene fallback on the map.
 */
export function resolveEoStacCollectionsForProvider(
  providerId: string,
  collectionId?: string,
): { collections: string[]; lookbackDays: number; label: string } {
  const def = remoteSensingProviderDef(providerId)
  const col = (collectionId || def.collections[0]?.id || '').toLowerCase()

  if (/sentinel-1|grd|sar|umbra|alos|palsar|space42-sar/.test(col) || def.id === 'umbra' || def.id === 'jaea') {
    return { collections: ['sentinel-1-grd'], lookbackDays: 90, label: 'Sentinel-1 GRD' }
  }
  if (/sentinel-3|olci/.test(col)) {
    return {
      collections: ['sentinel-3-olci-lfr-l2-netcdf'],
      lookbackDays: 120,
      label: 'Sentinel-3 OLCI',
    }
  }
  if (/landsat|hls/.test(col) || def.id === 'nasa-landsat') {
    return { collections: ['landsat-c2-l2'], lookbackDays: 365, label: 'Landsat C2 L2' }
  }
  if (/aster/.test(col) || def.id === 'aster') {
    return {
      collections: ['aster-l1t'],
      lookbackDays: 730,
      label: 'ASTER L1T (Planetary Computer)',
    }
  }
  // Optical / VHR commercial vendors: use Sentinel-2 scene calendar until vendor STAC is wired.
  return { collections: ['sentinel-2-l2a'], lookbackDays: 120, label: 'Sentinel-2 L2A' }
}
