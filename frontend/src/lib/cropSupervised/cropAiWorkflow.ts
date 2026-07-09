import type { CropClassificationJobStatus } from '../siPrithviCropPipeline'
import type { CropAnalysisModeId } from './cropAnalysisModes'
import { normalizeCropDataProvider, type CropDataProviderId } from './cropDataProvider'
import { providerRequiresUpload, providerUsesSatellitePipeline, type CropImageryDataset } from './cropImageryDataset'

export type CropAiWorkflowProfile = {
  id: string
  label: string
  summary: string
  stages: Array<{ status: CropClassificationJobStatus; label: string }>
  modelLabel: string
  requiresSeason: boolean
  requiresUpload: boolean
  requiresTrainingSamples: boolean
  primarySource: 'satellite' | 'uploaded-raster' | 'lidar'
}

export function resolveCropAiWorkflow(
  provider: CropDataProviderId,
  analysisMode: CropAnalysisModeId,
  dataset?: CropImageryDataset | null,
): CropAiWorkflowProfile {
  const p = normalizeCropDataProvider(provider)
  const needsUpload = providerRequiresUpload(p)
  const satellite = providerUsesSatellitePipeline(p)

  if (analysisMode === 'supervised') {
    if (needsUpload && dataset?.metadata.kind === 'point-cloud') {
      return {
        id: 'lidar-supervised',
        label: 'LiDAR + supervised labels',
        summary: 'Height model → canopy metrics → supervised classification from training polygons.',
        stages: [
          { status: 'fetching', label: 'Build canopy height model' },
          { status: 'preprocessing', label: 'Extract training signatures' },
          { status: 'inferring', label: 'Train classifier + map classes' },
          { status: 'done', label: 'Classification map' },
        ],
        modelLabel: 'Random Forest (canopy features)',
        requiresSeason: false,
        requiresUpload: true,
        requiresTrainingSamples: true,
        primarySource: 'lidar',
      }
    }
    if (needsUpload) {
      return {
        id: 'raster-supervised',
        label: 'High-res raster supervised',
        summary: 'Uploaded orthomosaic → spectral signatures → Random Forest classification.',
        stages: [
          { status: 'fetching', label: 'Load uploaded raster' },
          { status: 'preprocessing', label: 'Extract training signatures' },
          { status: 'inferring', label: 'Train RF + classify AOI' },
          { status: 'done', label: 'Classification + confidence' },
        ],
        modelLabel: 'Random Forest (spectral)',
        requiresSeason: false,
        requiresUpload: true,
        requiresTrainingSamples: true,
        primarySource: 'uploaded-raster',
      }
    }
    return {
      id: 'satellite-supervised',
      label: 'Satellite supervised',
      summary: 'Multi-date Sentinel/HLS → spectral features → Random Forest.',
      stages: [
        { status: 'fetching', label: 'Fetch multi-date imagery' },
        { status: 'preprocessing', label: 'Extract training signatures' },
        { status: 'inferring', label: 'Train RF + classify AOI' },
        { status: 'done', label: 'Classification + confidence' },
      ],
      modelLabel: 'Random Forest (Sentinel indices)',
      requiresSeason: true,
      requiresUpload: false,
      requiresTrainingSamples: true,
      primarySource: 'satellite',
    }
  }

  if (analysisMode === 'unsupervised') {
    if (needsUpload) {
      return {
        id: 'raster-unsupervised',
        label: 'Raster clustering',
        summary: 'High-resolution raster → k-means clustering → crop/land-cover classes.',
        stages: [
          { status: 'fetching', label: 'Load uploaded raster' },
          { status: 'preprocessing', label: 'Normalize bands + build feature stack' },
          { status: 'inferring', label: 'Cluster pixels into classes' },
          { status: 'done', label: 'Cluster map + legend' },
        ],
        modelLabel: 'K-means clustering',
        requiresSeason: false,
        requiresUpload: true,
        requiresTrainingSamples: false,
        primarySource: 'uploaded-raster',
      }
    }
    return {
      id: 'satellite-unsupervised',
      label: 'Satellite phenology clustering',
      summary: 'Sentinel/HLS time series → NDVI phenology → automatic crop classes.',
      stages: [
        { status: 'fetching', label: 'Fetch spectral time series' },
        { status: 'preprocessing', label: 'Build phenology signatures' },
        { status: 'inferring', label: 'Classify crops' },
        { status: 'done', label: 'Crop type map' },
      ],
      modelLabel: 'Phenology classifier',
      requiresSeason: true,
      requiresUpload: false,
      requiresTrainingSamples: false,
      primarySource: 'satellite',
    }
  }

  if (analysisMode === 'object-based') {
    if (needsUpload || !satellite) {
      return {
        id: 'raster-object-based',
        label: 'Object-based segmentation',
        summary: 'Segmentation → field objects → canopy metrics → crop pattern detection.',
        stages: [
          { status: 'fetching', label: 'Load imagery / height model' },
          { status: 'preprocessing', label: 'Segment objects + compute texture' },
          { status: 'inferring', label: 'Classify segments' },
          { status: 'done', label: 'Object map + statistics' },
        ],
        modelLabel: 'Segment + classify (OBIA)',
        requiresSeason: false,
        requiresUpload: needsUpload,
        requiresTrainingSamples: false,
        primarySource: needsUpload ? (p === 'lidar-data' ? 'lidar' : 'uploaded-raster') : 'uploaded-raster',
      }
    }
    return {
      id: 'satellite-object-based',
      label: 'Satellite object analysis',
      summary: 'Sentinel mosaic → segment parcels → crop pattern metrics.',
      stages: [
        { status: 'fetching', label: 'Fetch high-res mosaic' },
        { status: 'preprocessing', label: 'Segment field objects' },
        { status: 'inferring', label: 'Detect crop patterns' },
        { status: 'done', label: 'Object classification map' },
      ],
      modelLabel: 'OBIA + phenology',
      requiresSeason: true,
      requiresUpload: false,
      requiresTrainingSamples: false,
      primarySource: 'satellite',
    }
  }

  // ai-deep-learning (default Prithvi path)
  if (needsUpload) {
    return {
      id: 'raster-prithvi',
      label: 'Drone / raster AI inference',
      summary: 'Orthomosaic preprocessing → Prithvi-style deep learning → classified map.',
      stages: [
        { status: 'fetching', label: 'Load high-res raster' },
        { status: 'preprocessing', label: 'Tile + normalize bands' },
        { status: 'inferring', label: 'Deep learning inference' },
        { status: 'done', label: 'Crop classification map' },
      ],
      modelLabel: 'Prithvi (high-res chip)',
      requiresSeason: false,
      requiresUpload: true,
      requiresTrainingSamples: false,
      primarySource: 'uploaded-raster',
    }
  }

  const collectionLabel =
    p === 'satellite-landsat'
      ? 'Landsat'
      : p === 'satellite-hls'
        ? 'HLS'
        : 'Sentinel-2'

  return {
    id: 'satellite-prithvi',
    label: `${collectionLabel} → Prithvi`,
    summary: `${collectionLabel} time series → preprocessing → Prithvi foundation model inference.`,
    stages: [
      { status: 'fetching', label: `Fetch ${collectionLabel} scenes` },
      { status: 'preprocessing', label: 'Build multi-temporal stack' },
      { status: 'inferring', label: 'Prithvi inference' },
      { status: 'done', label: 'Crop type map' },
    ],
    modelLabel: 'Prithvi Foundation Model',
    requiresSeason: true,
    requiresUpload: false,
    requiresTrainingSamples: false,
    primarySource: 'satellite',
  }
}
