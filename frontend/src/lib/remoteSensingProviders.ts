/** Satellite imagery provider catalogue for the Remote Sensing toolbox. */

export type RemoteSensingProviderId =
  | 'sentinel-hub'
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

export type RemoteSensingCollectionDef = {
  id: string
  label: string
}

export type RemoteSensingProviderDef = {
  id: RemoteSensingProviderId
  label: string
  /** When true, WMS/index layers are served through the active Sentinel Hub pipeline. */
  integrated: boolean
  collections: RemoteSensingCollectionDef[]
  hint?: string
}

export const REMOTE_SENSING_PROVIDER_CATALOG: RemoteSensingProviderDef[] = [
  {
    id: 'sentinel-hub',
    label: 'Sentinel Hub',
    integrated: true,
    collections: [
      { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
      { id: 'sentinel-2-l1c', label: 'Sentinel-2 L1C' },
    ],
  },
  {
    id: 'space42',
    label: 'Space42',
    integrated: false,
    collections: [
      { id: 'space42-optical', label: 'Optical mosaic' },
      { id: 'space42-sar', label: 'SAR' },
    ],
    hint: 'Space42 catalogue — connect API credentials in system settings to stream tiles.',
  },
  {
    id: 'airbus',
    label: 'Airbus',
    integrated: false,
    collections: [
      { id: 'pleiades-neo', label: 'Pleiades Neo' },
      { id: 'pleiades', label: 'Pleiades' },
      { id: 'spot-6-7', label: 'SPOT 6/7' },
    ],
    hint: 'Airbus Defence & Space — Pleiades / SPOT archives.',
  },
  {
    id: 'maxar',
    label: 'Maxar',
    integrated: false,
    collections: [
      { id: 'worldview-3', label: 'WorldView-3' },
      { id: 'worldview-legion', label: 'WorldView Legion' },
    ],
    hint: 'Maxar high-resolution commercial imagery.',
  },
  {
    id: 'planet',
    label: 'Planet',
    integrated: false,
    collections: [
      { id: 'planetscope', label: 'PlanetScope (3–5 m)' },
      { id: 'skysat', label: 'SkySat (50 cm)' },
    ],
    hint: 'Planet daily global monitoring + tasking.',
  },
  {
    id: 'blacksky',
    label: 'BlackSky',
    integrated: false,
    collections: [
      { id: 'blacksky-spectra', label: 'Spectra' },
      { id: 'blacksky-global', label: 'Global monitoring' },
    ],
    hint: 'BlackSky high-revisit optical + RF intelligence.',
  },
  {
    id: 'satellogic',
    label: 'Satellogic',
    integrated: false,
    collections: [
      { id: 'newsat', label: 'NewSat constellation' },
      { id: 'satellogic-markiv', label: 'Mark IV' },
    ],
    hint: 'Satellogic sub-metre Earth observation constellation.',
  },
  {
    id: 'esa-sentinel',
    label: 'ESA Sentinel',
    integrated: false,
    collections: [
      { id: 'sentinel-1-grd', label: 'Sentinel-1 GRD' },
      { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
      { id: 'sentinel-3-olci', label: 'Sentinel-3 OLCI' },
    ],
    hint: 'Copernicus Sentinel missions via ESA / CDSE.',
  },
  {
    id: 'nasa-landsat',
    label: 'NASA Landsat',
    integrated: false,
    collections: [
      { id: 'landsat-8-9', label: 'Landsat 8/9 OLI/TIRS' },
      { id: 'hls', label: 'Harmonized Landsat Sentinel (HLS)' },
    ],
    hint: 'USGS / NASA Landsat Collection 2 + HLS.',
  },
  {
    id: 'umbra',
    label: 'Umbra',
    integrated: false,
    collections: [{ id: 'umbra-sar', label: 'Umbra SAR (X-band)' }],
    hint: 'Umbra synthetic aperture radar tasking.',
  },
  {
    id: 'mbrsc',
    label: 'MBRSC',
    integrated: false,
    collections: [
      { id: 'khalifasat', label: 'KhalifaSat' },
      { id: 'dubaisat-2', label: 'DubaiSat-2' },
    ],
    hint: 'Mohammed Bin Rashid Space Centre UAE imagery.',
  },
  {
    id: 'jaea',
    label: 'JAEA',
    integrated: false,
    collections: [
      { id: 'alos-2', label: 'ALOS-2 PALSAR-2' },
      { id: 'alos-4', label: 'ALOS-4' },
    ],
    hint: 'Japan Aerospace Exploration Agency Earth observation.',
  },
  {
    id: 'oneatlas',
    label: 'OneAtlas',
    integrated: false,
    collections: [
      { id: 'oneatlas-basemap', label: 'Basemap' },
      { id: 'oneatlas-live', label: 'Live layers' },
    ],
    hint: 'Airbus OneAtlas geospatial platform.',
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

export function defaultCollectionForProvider(providerId: string): string {
  const cols = remoteSensingCollectionsForProvider(providerId)
  return cols[0]?.id ?? 'sentinel-2-l2a'
}
