import { parseFile } from '../../utils/FileLoader'
import type { CropDataProviderId } from './cropDataProvider'
import { normalizeCropDataProvider } from './cropDataProvider'

export type CropImageryDatasetKind = 'raster' | 'point-cloud' | 'dem'

export type CropImageryDatasetMetadata = {
  fileName: string
  format: string
  kind: CropImageryDatasetKind
  widthPx?: number
  heightPx?: number
  bands?: number
  crs?: string | null
  pixelSizeM?: number | null
  acquisitionDate?: string | null
  bytes: number
  spectralType?: 'rgb' | 'multispectral' | 'thermal' | 'elevation' | 'unknown'
}

export type CropImageryDataset = {
  id: string
  provider: CropDataProviderId
  metadata: CropImageryDatasetMetadata
  /** Object URL for raster preview / chip inference. */
  previewUrl?: string
  /** GeoJSON footprint or image corners for map overlay. */
  footprint?: GeoJSON.FeatureCollection | null
  /** Raw file kept for LiDAR / future server upload. */
  sourceFile?: File
  uploadedAt: string
}

const LIDAR_EXTENSIONS = new Set(['las', 'laz'])
const RASTER_EXTENSIONS = new Set(['tif', 'tiff', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'cog'])

export function acceptExtensionsForProvider(provider: CropDataProviderId): string {
  const p = normalizeCropDataProvider(provider)
  if (p === 'lidar-data') return '.las,.laz,.tif,.tiff'
  if (p === 'drone-imagery') return '.tif,.tiff,.png,.jpg,.jpeg,.webp'
  return '.tif,.tiff,.png,.jpg,.jpeg,.webp,.cog'
}

function inferSpectralType(
  provider: CropDataProviderId,
  bands?: number,
): CropImageryDatasetMetadata['spectralType'] {
  const p = normalizeCropDataProvider(provider)
  if (p === 'lidar-data') return 'elevation'
  if (bands != null && bands >= 4) return 'multispectral'
  if (bands === 1) return 'elevation'
  if (p === 'drone-imagery') return bands === 3 ? 'rgb' : 'unknown'
  return 'unknown'
}

function footprintFromRasterCoords(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
): GeoJSON.FeatureCollection {
  const ring = [...coordinates.map(c => [c[0], c[1]] as [number, number]), [coordinates[0]![0], coordinates[0]![1]]]
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
  }
}

export async function parseCropImageryDataset(
  file: File,
  provider: CropDataProviderId,
  opts?: {
    imagePlacementBounds?: { west: number; south: number; east: number; north: number }
    onProgress?: (pct: number) => void
  },
): Promise<CropImageryDataset> {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const normalizedProvider = normalizeCropDataProvider(provider)

  if (LIDAR_EXTENSIONS.has(ext)) {
    const kind: CropImageryDatasetKind = 'point-cloud'
    return {
      id: `crop-ds-${Date.now()}`,
      provider: normalizedProvider,
      metadata: {
        fileName: file.name,
        format: ext === 'laz' ? 'LAZ' : 'LAS',
        kind,
        bytes: file.size,
        crs: null,
        pixelSizeM: null,
        spectralType: 'elevation',
      },
      sourceFile: file,
      uploadedAt: new Date().toISOString(),
    }
  }

  if (!RASTER_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type for ${normalizedProvider}: .${ext || 'unknown'}`)
  }

  const parsed = await parseFile(file, {
    onProgress: opts?.onProgress,
    imagePlacementBounds: opts?.imagePlacementBounds,
  })

  if (parsed.type !== 'raster') {
    throw new Error('Expected a raster image or GeoTIFF for this data source.')
  }

  const format =
    ext === 'tif' || ext === 'tiff' || ext === 'cog'
      ? 'GeoTIFF'
      : ext.toUpperCase()

  const pixelSizeM =
    parsed.widthPx && parsed.heightPx
      ? estimatePixelSizeFromExtent(parsed.coordinates, parsed.widthPx, parsed.heightPx)
      : null

  return {
    id: `crop-ds-${Date.now()}`,
    provider: normalizedProvider,
    metadata: {
      fileName: file.name,
      format,
      kind: normalizedProvider === 'lidar-data' ? 'dem' : 'raster',
      widthPx: parsed.widthPx,
      heightPx: parsed.heightPx,
      bands: parsed.bands,
      crs: parsed.crsHint ?? null,
      pixelSizeM,
      spectralType: inferSpectralType(normalizedProvider, parsed.bands),
      bytes: file.size,
    },
    previewUrl: parsed.previewObjectUrl,
    footprint: footprintFromRasterCoords(parsed.coordinates),
    sourceFile: file,
    uploadedAt: new Date().toISOString(),
  }
}

function estimatePixelSizeFromExtent(
  coords: [[number, number], [number, number], [number, number], [number, number]],
  widthPx: number,
  heightPx: number,
): number | null {
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const west = Math.min(...lngs)
  const east = Math.max(...lngs)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const midLat = (south + north) / 2
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180)
  const widthM = Math.abs(east - west) * mPerDegLng
  const heightM = Math.abs(north - south) * mPerDegLat
  const pxW = widthM / Math.max(widthPx, 1)
  const pxH = heightM / Math.max(heightPx, 1)
  const avg = (pxW + pxH) / 2
  return Number.isFinite(avg) && avg > 0 ? Math.round(avg * 100) / 100 : null
}

export function formatDatasetPixelSize(m?: number | null): string {
  if (m == null || !Number.isFinite(m)) return '—'
  if (m < 1) return `${Math.round(m * 100)} cm/px`
  return `${m.toFixed(2)} m/px`
}

export function providerRequiresUpload(provider: CropDataProviderId): boolean {
  const p = normalizeCropDataProvider(provider)
  return p === 'drone-imagery' || p === 'lidar-data' || p === 'user-raster'
}

export function providerUsesSatellitePipeline(provider: CropDataProviderId): boolean {
  const p = normalizeCropDataProvider(provider)
  return p.startsWith('satellite')
}
