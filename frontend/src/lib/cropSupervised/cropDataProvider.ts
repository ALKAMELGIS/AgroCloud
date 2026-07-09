export type CropDataProviderId =
  | 'satellite'
  | 'satellite-sentinel2'
  | 'satellite-landsat'
  | 'satellite-hls'
  | 'raster'
  | 'user-raster'
  | 'drone-imagery'
  | 'lidar-data'

export type CropDataProviderDef = {
  id: CropDataProviderId
  label: string
  group: 'satellite' | 'upload'
  description: string
  requiresUpload: boolean
}

/** All providers supported inside the Crop AI panel (no external redirect). */
export const CROP_PANEL_PROVIDER_IDS: CropDataProviderId[] = [
  'satellite-sentinel2',
  'satellite-landsat',
  'satellite-hls',
  'drone-imagery',
  'lidar-data',
  'user-raster',
]

export const CROP_DATA_PROVIDERS: CropDataProviderDef[] = [
  {
    id: 'satellite-sentinel2',
    label: 'Satellite · Sentinel-2',
    group: 'satellite',
    description: 'Sentinel-2 L2A multi-spectral time series via Sentinel Hub.',
    requiresUpload: false,
  },
  {
    id: 'satellite-landsat',
    label: 'Satellite · Landsat',
    group: 'satellite',
    description: 'Landsat surface reflectance collections.',
    requiresUpload: false,
  },
  {
    id: 'satellite-hls',
    label: 'Satellite · HLS',
    group: 'satellite',
    description: 'Harmonized Landsat Sentinel (HLS) fused imagery.',
    requiresUpload: false,
  },
  {
    id: 'drone-imagery',
    label: 'Drone Imagery',
    group: 'upload',
    description: 'UAV orthomosaic — GeoTIFF, PNG, JPEG (RGB / multispectral / thermal).',
    requiresUpload: true,
  },
  {
    id: 'lidar-data',
    label: 'LiDAR Data',
    group: 'upload',
    description: 'LAS / LAZ point clouds or GeoTIFF DEM/DSM for canopy structure.',
    requiresUpload: true,
  },
  {
    id: 'user-raster',
    label: 'User Raster',
    group: 'upload',
    description: 'GeoTIFF, COG, PNG, or JPEG uploaded by the user.',
    requiresUpload: true,
  },
]

const BY_ID = new Map(CROP_DATA_PROVIDERS.map(p => [p.id, p]))

/** Normalize legacy persisted provider ids. */
export function normalizeCropDataProvider(id: CropDataProviderId): CropDataProviderId {
  if (id === 'satellite') return 'satellite-sentinel2'
  if (id === 'raster') return 'user-raster'
  return id
}

export function cropProviderDef(id: CropDataProviderId): CropDataProviderDef {
  const normalized = normalizeCropDataProvider(id)
  return BY_ID.get(normalized) ?? CROP_DATA_PROVIDERS[0]!
}

export function isCropPanelProvider(id: CropDataProviderId): boolean {
  return CROP_PANEL_PROVIDER_IDS.includes(normalizeCropDataProvider(id))
}

export function cropProviderLabel(id: CropDataProviderId): string {
  return cropProviderDef(id).label
}

export function cropProviderRequiresUpload(id: CropDataProviderId): boolean {
  return cropProviderDef(id).requiresUpload
}

export const DEFAULT_CROP_DATA_PROVIDER: CropDataProviderId = 'satellite-sentinel2'

export function assertCropPanelProvider(id: CropDataProviderId | undefined): void {
  if (!id || !isCropPanelProvider(id)) {
    const label = id ? cropProviderLabel(id) : 'Unknown'
    throw new Error(`Crop Classification does not support data provider "${label}".`)
  }
}

export function normalizeApiDataProvider(id: CropDataProviderId): 'satellite' | 'raster' {
  const p = normalizeCropDataProvider(id)
  if (p === 'drone-imagery' || p === 'user-raster' || p === 'lidar-data') return 'raster'
  return 'satellite'
}

export type CropDataProviderRedirect = {
  kind: 'section' | 'route'
  target: string
  hint: string
  actionLabel: string
}

/** @deprecated Always null — providers are handled in-panel. */
export function getCropProviderRedirect(_id: CropDataProviderId): CropDataProviderRedirect | null {
  return null
}
