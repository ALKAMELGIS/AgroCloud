import type { CropClassificationMode } from '../siPrithviCropPipeline'
import type { CropDataProviderId } from './cropDataProvider'
import { assertCropPanelProvider } from './cropDataProvider'

export type CropPipelineProfileId = 'sentinel-wms-ndvi'

export type CropPipelineProfile = {
  id: CropPipelineProfileId
  source: 'sentinel-live' | 'uploaded-raster'
  normalization: 'ndvi-phenology' | 'spectral-rf'
  timestepsDefault: number
}

export function resolveCropPipelineProfile(
  provider: CropDataProviderId,
  mode: CropClassificationMode,
): CropPipelineProfile {
  assertCropPanelProvider(provider)
  const source = provider === 'raster' ? 'uploaded-raster' : 'sentinel-live'
  if (mode === 'supervised-ground-truth') {
    return {
      id: 'sentinel-wms-ndvi',
      source,
      normalization: 'spectral-rf',
      timestepsDefault: 5,
    }
  }
  return {
    id: 'sentinel-wms-ndvi',
    source,
    normalization: 'ndvi-phenology',
    timestepsDefault: 3,
  }
}
