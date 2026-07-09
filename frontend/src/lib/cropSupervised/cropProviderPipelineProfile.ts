import type { CropClassificationMode } from '../siPrithviCropPipeline'
import type { CropDataProviderId } from './cropDataProvider'
import { assertCropPanelProvider, normalizeCropDataProvider } from './cropDataProvider'

export type CropPipelineProfileId =
  | 'sentinel-wms-ndvi'
  | 'uploaded-raster-rf'
  | 'uploaded-raster-chip'
  | 'lidar-canopy'
  | 'obia-raster'

export type CropPipelineProfile = {
  id: CropPipelineProfileId
  source: 'sentinel-live' | 'uploaded-raster' | 'lidar'
  normalization: 'ndvi-phenology' | 'spectral-rf' | 'deep-learning' | 'clustering' | 'obia'
  timestepsDefault: number
  satelliteCollection?: 'sentinel-2' | 'landsat' | 'hls'
}

export function resolveCropPipelineProfile(
  provider: CropDataProviderId,
  mode: CropClassificationMode,
): CropPipelineProfile {
  assertCropPanelProvider(provider)
  const p = normalizeCropDataProvider(provider)

  if (p === 'drone-imagery' || p === 'user-raster') {
    return {
      id: mode === 'supervised-ground-truth' ? 'uploaded-raster-rf' : 'uploaded-raster-chip',
      source: 'uploaded-raster',
      normalization: mode === 'supervised-ground-truth' ? 'spectral-rf' : 'deep-learning',
      timestepsDefault: 1,
    }
  }

  if (p === 'lidar-data') {
    return {
      id: 'lidar-canopy',
      source: 'lidar',
      normalization: mode === 'supervised-ground-truth' ? 'spectral-rf' : 'obia',
      timestepsDefault: 1,
    }
  }

  const satelliteCollection =
    p === 'satellite-landsat' ? 'landsat' : p === 'satellite-hls' ? 'hls' : 'sentinel-2'

  if (mode === 'supervised-ground-truth') {
    return {
      id: 'sentinel-wms-ndvi',
      source: 'sentinel-live',
      normalization: 'spectral-rf',
      timestepsDefault: 5,
      satelliteCollection,
    }
  }
  return {
    id: 'sentinel-wms-ndvi',
    source: 'sentinel-live',
    normalization: 'ndvi-phenology',
    timestepsDefault: 3,
    satelliteCollection,
  }
}
