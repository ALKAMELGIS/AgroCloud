export type CropDataProviderId =
  | 'satellite'
  | 'raster'
  | 'drone-imagery'
  | 'lidar-data'

export type CropDataProviderRedirect = {
  kind: 'section' | 'route'
  target: string
  hint: string
  actionLabel: string
}

export type CropDataProviderDef = {
  id: CropDataProviderId
  label: string
  supportedInCropPanel: boolean
  redirect?: CropDataProviderRedirect
}

export const CROP_PANEL_PROVIDER_IDS: CropDataProviderId[] = ['satellite', 'raster']

export const CROP_DATA_PROVIDERS: CropDataProviderDef[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    supportedInCropPanel: true,
  },
  {
    id: 'raster',
    label: 'Raster (PNG, GeoTIFF)',
    supportedInCropPanel: true,
  },
  {
    id: 'drone-imagery',
    label: 'Drone Imagery',
    supportedInCropPanel: false,
    redirect: {
      kind: 'section',
      target: 'remote-sensing',
      hint: 'Drone crop workflows use the Remote Sensing toolbox and file upload — not this panel.',
      actionLabel: 'Open Remote Sensing',
    },
  },
  {
    id: 'lidar-data',
    label: 'LiDAR Data',
    supportedInCropPanel: false,
    redirect: {
      kind: 'route',
      target: '/master/gis-content',
      hint: 'LiDAR and point-cloud layers are managed in GIS Content (3D / point cloud).',
      actionLabel: 'Open GIS Content',
    },
  },
]

const BY_ID = new Map(CROP_DATA_PROVIDERS.map(p => [p.id, p]))

export function cropProviderDef(id: CropDataProviderId): CropDataProviderDef {
  return BY_ID.get(id) ?? CROP_DATA_PROVIDERS[0]!
}

export function isCropPanelProvider(id: CropDataProviderId): boolean {
  return cropProviderDef(id).supportedInCropPanel
}

export function cropProviderLabel(id: CropDataProviderId): string {
  return cropProviderDef(id).label
}

export function getCropProviderRedirect(id: CropDataProviderId): CropDataProviderRedirect | null {
  return cropProviderDef(id).redirect ?? null
}

export const DEFAULT_CROP_DATA_PROVIDER: CropDataProviderId = 'satellite'

export function assertCropPanelProvider(id: CropDataProviderId | undefined): void {
  if (!id || !isCropPanelProvider(id)) {
    const label = id ? cropProviderLabel(id) : 'Unknown'
    throw new Error(
      `Crop Classification in this panel supports Satellite or Raster (PNG, GeoTIFF) only. "${label}" must use its dedicated module.`,
    )
  }
}
