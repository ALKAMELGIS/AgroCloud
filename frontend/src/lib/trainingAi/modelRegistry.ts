/**
 * Training AI / Remote Sensing model registry.
 * Hugging Face IDs are only set when verified against huggingface.co.
 */

export type AnalysisImageryKind =
  | 'sentinel2'
  | 'sentinel1'
  | 'landsat'
  | 'drone_rgb'
  | 'drone_multispectral'
  | 'orthophoto'
  | 'geotiff'
  | 'hires_satellite'
  | 'rgb_capture'
  | 'basemap_esri'

/** Other display basemaps (Google / Mapbox / etc.) remain chrome-only unless listed as analysis options. */
export type DisplayBasemapKind = 'google' | 'esri' | 'mapbox' | 'satellite' | 'dark'

export type ModelTaskCategory =
  | 'field_detection'
  | 'field_segmentation'
  | 'crop_classification'
  | 'tree_detection'
  | 'tree_segmentation'
  | 'orchard_detection'
  | 'land_cover'
  | 'change_detection'
  | 'vegetation'
  | 'water'
  | 'soil'
  | 'drone'
  | 'sentinel2'
  | 'multispectral'
  | 'rgb'
  | 'foundation'
  | 'feature_extraction'

export type ModelCompatibilityStatus =
  | 'compatible'
  | 'partially_compatible'
  | 'requires_preprocessing'
  | 'requires_fine_tuning'
  | 'not_compatible'

export type TrainingModelEntry = {
  id: string
  name: string
  modelType: string
  task: string
  inputDataType: string
  requiredBands: string[]
  recommendedResolution: string
  /** Verified HF id, or null when none suitable */
  hfModelId: string | null
  hfUrl: string | null
  canRunWithoutTraining: boolean
  requiresFineTuning: boolean
  onnxAvailable: boolean
  recommendedAgriculture: boolean
  recommendedFields: boolean
  recommendedTrees: boolean
  recommendedDrone: boolean
  recommendedSentinel2: boolean
  confidenceLimitation: string
  categories: ModelTaskCategory[]
  /** Passed to /api/training/start when trainable on :8095 */
  trainEncoder?: string
  trainableOnAgroCloud: boolean
  /** Prefer for Infer engines already in-app */
  inferEngine?: 'segformer' | 'ftw' | 'delineate-fbis' | 'yolo-trees'
  gpuRequirement: 'cpu' | 'low' | 'medium' | 'high'
  source: 'agrocloud' | 'huggingface'
}

export type AnalysisImageryOption = {
  id: AnalysisImageryKind
  label: string
  isBasemap: boolean
  bandsHint: string[]
  modality: 'rgb' | 'multispectral' | 'sar'
}

/**
 * RGB source used to capture pixels for a registry imagery kind.
 * Everything except Sentinel-2 / Landsat mosaics is read from the live map canvas,
 * which always has pixels — so training capture cannot dead-end on a missing layer.
 */
export function captureSourceForAnalysisImagery(
  kind: AnalysisImageryKind,
): 'basemap' | 'sentinel2' | 'landsat' {
  if (kind === 'sentinel2') return 'sentinel2'
  if (kind === 'landsat') return 'landsat'
  return 'basemap'
}

export const ANALYSIS_IMAGERY_OPTIONS: AnalysisImageryOption[] = [
  {
    id: 'basemap_esri',
    label: 'Basemap Esri World Imagery',
    isBasemap: true,
    bandsHint: ['R', 'G', 'B'],
    modality: 'rgb',
  },
  {
    id: 'sentinel2',
    label: 'Sentinel-2 (analysis imagery)',
    isBasemap: false,
    bandsHint: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    modality: 'multispectral',
  },
  {
    id: 'landsat',
    label: 'Landsat (analysis imagery)',
    isBasemap: false,
    bandsHint: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'],
    modality: 'multispectral',
  },
  {
    id: 'sentinel1',
    label: 'Sentinel-1 (SAR)',
    isBasemap: false,
    bandsHint: ['VV', 'VH'],
    modality: 'sar',
  },
  {
    id: 'drone_rgb',
    label: 'Drone RGB',
    isBasemap: false,
    bandsHint: ['R', 'G', 'B'],
    modality: 'rgb',
  },
  {
    id: 'drone_multispectral',
    label: 'Drone Multispectral',
    isBasemap: false,
    bandsHint: ['R', 'G', 'B', 'RE', 'NIR'],
    modality: 'multispectral',
  },
  {
    id: 'orthophoto',
    label: 'Orthophoto RGB',
    isBasemap: false,
    bandsHint: ['R', 'G', 'B'],
    modality: 'rgb',
  },
  {
    id: 'geotiff',
    label: 'GeoTIFF (upload)',
    isBasemap: false,
    bandsHint: ['depends on file'],
    modality: 'rgb',
  },
  {
    id: 'hires_satellite',
    label: 'High-resolution satellite RGB',
    isBasemap: false,
    bandsHint: ['R', 'G', 'B'],
    modality: 'rgb',
  },
  {
    id: 'rgb_capture',
    label: 'Map RGB capture (analysis layer only)',
    isBasemap: false,
    bandsHint: ['R', 'G', 'B'],
    modality: 'rgb',
  },
]

export const DISPLAY_BASEMAP_NOTE =
  'Prefer analysis imagery (Sentinel / Landsat / drone / GeoTIFF) when available. Basemap Esri World Imagery is RGB map capture.'

export const MODEL_CATEGORY_FILTERS: Array<{ id: 'all' | ModelTaskCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'field_detection', label: 'Field Detection' },
  { id: 'field_segmentation', label: 'Field Segmentation' },
  { id: 'crop_classification', label: 'Crop Classification' },
  { id: 'tree_detection', label: 'Tree Detection' },
  { id: 'tree_segmentation', label: 'Tree Segmentation' },
  { id: 'orchard_detection', label: 'Orchard Detection' },
  { id: 'land_cover', label: 'Land Cover' },
  { id: 'change_detection', label: 'Change Detection' },
  { id: 'vegetation', label: 'Vegetation' },
  { id: 'water', label: 'Water' },
  { id: 'soil', label: 'Soil' },
  { id: 'drone', label: 'Drone' },
  { id: 'sentinel2', label: 'Sentinel-2' },
  { id: 'multispectral', label: 'Multispectral' },
  { id: 'rgb', label: 'RGB' },
  { id: 'foundation', label: 'Foundation' },
]

function hf(id: string): { hfModelId: string; hfUrl: string } {
  return { hfModelId: id, hfUrl: `https://huggingface.co/${id}` }
}

/** Existing AgroCloud + verified Hugging Face catalog. */
export const TRAINING_MODEL_REGISTRY: TrainingModelEntry[] = [
  // —— Existing AgroCloud trainable / local ——
  {
    id: 'agro-segformer-b0',
    name: 'SegFormer-B0 (light)',
    modelType: 'Semantic Segmentation',
    task: 'Fine-tune pixel classes from training samples',
    inputDataType: 'RGB (map capture / drone)',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.1–10 m RGB',
    ...hf('nvidia/segformer-b0-finetuned-ade-512-512'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: true,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation:
      'RGB encoder; Sentinel-2 multispectral needs band→RGB mapping. Train on :8095.',
    categories: ['field_segmentation', 'land_cover', 'vegetation', 'rgb', 'drone'],
    trainEncoder: 'nvidia/segformer-b0-finetuned-ade-512-512',
    trainableOnAgroCloud: true,
    inferEngine: 'segformer',
    gpuRequirement: 'low',
    source: 'agrocloud',
  },
  {
    id: 'agro-segformer-b2',
    name: 'SegFormer-B2 (fast)',
    modelType: 'Semantic Segmentation',
    task: 'Default Training AI fine-tune',
    inputDataType: 'RGB (map capture / drone)',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.1–10 m RGB',
    ...hf('nvidia/segformer-b2-finetuned-ade-512-512'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: true,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation:
      'Default AgroCloud trainer. Sentinel-2 stack is not native multispectral.',
    categories: ['field_segmentation', 'land_cover', 'vegetation', 'rgb', 'drone'],
    trainEncoder: 'nvidia/segformer-b2-finetuned-ade-512-512',
    trainableOnAgroCloud: true,
    inferEngine: 'segformer',
    gpuRequirement: 'medium',
    source: 'agrocloud',
  },
  {
    id: 'agro-segformer-b3',
    name: 'SegFormer-B3',
    modelType: 'Semantic Segmentation',
    task: 'Higher-capacity RGB fine-tune',
    inputDataType: 'RGB (map capture / drone)',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.1–10 m RGB',
    ...hf('nvidia/segformer-b3-finetuned-ade-512-512'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: true,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'Heavier than B2; needs more VRAM during train.',
    categories: ['field_segmentation', 'land_cover', 'rgb', 'drone'],
    trainEncoder: 'nvidia/segformer-b3-finetuned-ade-512-512',
    trainableOnAgroCloud: true,
    inferEngine: 'segformer',
    gpuRequirement: 'medium',
    source: 'agrocloud',
  },
  {
    id: 'agro-segformer-b5',
    name: 'SegFormer-B5',
    modelType: 'Semantic Segmentation',
    task: 'High-capacity ADE-style RGB segmentation',
    inputDataType: 'RGB',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.1–10 m RGB / 640 tile',
    ...hf('nvidia/segformer-b5-finetuned-ade-640-640'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'Large; GPU strongly recommended.',
    categories: ['field_segmentation', 'land_cover', 'rgb', 'drone'],
    trainEncoder: 'nvidia/segformer-b5-finetuned-ade-640-640',
    trainableOnAgroCloud: true,
    inferEngine: 'segformer',
    gpuRequirement: 'high',
    source: 'agrocloud',
  },
  {
    id: 'agro-delineate-fbis-v2',
    name: 'Delineate Anything',
    modelType: 'Instance Segmentation',
    task: 'Agricultural field parcel extraction',
    inputDataType: 'RGB (drone / map RGB / ortho)',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.1–5 m RGB',
    hfModelId: null,
    hfUrl: null,
    canRunWithoutTraining: true,
    requiresFineTuning: false,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation:
      'Pretrained parcel extractor on AgroCloud (:8096). TRAIN MODEL fine-tunes SegFormer-B2 on your samples; use Infer for the pretrained Delineate engine.',
    categories: ['field_detection', 'field_segmentation', 'drone', 'rgb'],
    trainEncoder: 'nvidia/segformer-b2-finetuned-ade-512-512',
    trainableOnAgroCloud: false,
    inferEngine: 'delineate-fbis',
    gpuRequirement: 'medium',
    source: 'agrocloud',
  },
  {
    id: 'agro-ftw-live',
    name: 'FTW Model',
    modelType: 'Field Boundary Segmentation',
    task: 'Sentinel-2 agricultural field boundaries',
    inputDataType: 'Sentinel-2 multispectral',
    requiredBands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
    recommendedResolution: '10 m',
    hfModelId: null,
    hfUrl: null,
    canRunWithoutTraining: true,
    requiresFineTuning: false,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation:
      'Pretrained FTW field boundaries on AgroCloud (:8092). TRAIN MODEL fine-tunes SegFormer-B2 on your samples; use Infer for the pretrained FTW engine.',
    categories: ['field_detection', 'field_segmentation', 'sentinel2', 'multispectral'],
    trainEncoder: 'nvidia/segformer-b2-finetuned-ade-512-512',
    trainableOnAgroCloud: false,
    inferEngine: 'ftw',
    gpuRequirement: 'medium',
    source: 'agrocloud',
  },
  {
    id: 'agro-yolo-trees',
    name: 'Trees — YOLO',
    modelType: 'Object Detection',
    task: 'Individual tree detection',
    inputDataType: 'RGB (drone / hi-res)',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: '0.05–2 m RGB',
    ...hf('Ultralytics/YOLOv8'),
    canRunWithoutTraining: true,
    requiresFineTuning: false,
    onnxAvailable: true,
    recommendedAgriculture: true,
    recommendedFields: false,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'HF points to Ultralytics YOLOv8 family; AgroCloud uses local tree-detection service.',
    categories: ['tree_detection', 'tree_segmentation', 'orchard_detection', 'drone', 'rgb'],
    trainableOnAgroCloud: false,
    inferEngine: 'yolo-trees',
    gpuRequirement: 'medium',
    source: 'agrocloud',
  },

  // —— Hugging Face EO foundation (verified) ——
  {
    id: 'hf-prithvi-eo-2-300m',
    name: 'Prithvi EO 2.0 – 300M',
    modelType: 'Earth Observation Foundation Model',
    task: 'Multispectral feature extraction / fine-tune downstream ag tasks',
    inputDataType: 'Multispectral Satellite (HLS / Sentinel-2)',
    requiredBands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    recommendedResolution: '~10–30 m satellite',
    ...hf('ibm-nasa-geospatial/Prithvi-EO-2.0-300M'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation:
      'Best for Sentinel-2 agricultural mapping. Not wired to AgroCloud Trainer yet — catalog + fine-tune path.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'land_cover', 'vegetation', 'field_segmentation'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },
  {
    id: 'hf-prithvi-eo-2-600m',
    name: 'Prithvi EO 2.0 – 600M',
    modelType: 'Earth Observation Foundation Model',
    task: 'Higher-capacity EO features / segmentation / classification',
    inputDataType: 'Multispectral Satellite',
    requiredBands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    recommendedResolution: '~10–30 m satellite',
    ...hf('ibm-nasa-geospatial/Prithvi-EO-2.0-600M'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Higher capacity; needs more GPU. Catalog only until Trainer supports Prithvi.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'land_cover', 'vegetation'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },
  {
    id: 'hf-prithvi-eo-1-100m',
    name: 'Prithvi EO 1.0 – 100M',
    modelType: 'Earth Observation Foundation Model',
    task: 'Lighter EO features for limited GPU',
    inputDataType: 'Sentinel-2 / HLS',
    requiredBands: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12'],
    recommendedResolution: '~30 m HLS / S2',
    ...hf('ibm-nasa-geospatial/Prithvi-EO-1.0-100M'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Smaller Prithvi; still not trainable on :8095.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'feature_extraction'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'medium',
    source: 'huggingface',
  },
  {
    id: 'hf-prithvi-crop-cls',
    name: 'Prithvi Crop Classification',
    modelType: 'Multi-temporal Crop Classification',
    task: 'Crop type / agricultural land classification',
    inputDataType: 'Multi-temporal multispectral',
    requiredBands: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12'],
    recommendedResolution: '~30 m time series',
    ...hf('ibm-nasa-geospatial/Prithvi-EO-1.0-100M-multi-temporal-crop-classification'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Especially for Crop Type / Crop Classification. Needs temporal stack.',
    categories: ['crop_classification', 'vegetation', 'sentinel2', 'multispectral', 'field_detection'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'medium',
    source: 'huggingface',
  },
  {
    id: 'hf-terramind-small',
    name: 'TerraMind 1.0 – small',
    modelType: 'Multimodal EO Foundation',
    task: 'EO foundation workflows (lighter)',
    inputDataType: 'Sentinel-2 / satellite multimodal',
    requiredBands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    recommendedResolution: 'Satellite (S2-class)',
    ...hf('ibm-esa-geospatial/TerraMind-1.0-small'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Pick small when GPU/RAM limited. Catalog until Trainer supports TerraMind.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'land_cover'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'medium',
    source: 'huggingface',
  },
  {
    id: 'hf-terramind-base',
    name: 'TerraMind 1.0 – base',
    modelType: 'Multimodal EO Foundation',
    task: 'EO foundation workflows (balanced)',
    inputDataType: 'Sentinel-2 / satellite multimodal',
    requiredBands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    recommendedResolution: 'Satellite (S2-class)',
    ...hf('ibm-esa-geospatial/TerraMind-1.0-base'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Default TerraMind size. Not yet fine-tuned on AgroCloud Trainer.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'land_cover'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },
  {
    id: 'hf-terramind-large',
    name: 'TerraMind 1.0 – large',
    modelType: 'Multimodal EO Foundation',
    task: 'EO foundation workflows (highest capacity)',
    inputDataType: 'Sentinel-2 / satellite multimodal',
    requiredBands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
    recommendedResolution: 'Satellite (S2-class)',
    ...hf('ibm-esa-geospatial/TerraMind-1.0-large'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: false,
    recommendedDrone: false,
    recommendedSentinel2: true,
    confidenceLimitation: 'Largest TerraMind; high GPU/RAM.',
    categories: ['foundation', 'sentinel2', 'multispectral', 'land_cover'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },

  // —— High-res RGB CV (verified HF) ——
  {
    id: 'hf-sam2-1-large',
    name: 'SAM 2.1 (Hiera Large)',
    modelType: 'Promptable Segmentation',
    task: 'High-res object / field / tree masks',
    inputDataType: 'RGB',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: 'Drone / hi-res satellite RGB',
    ...hf('facebook/sam2.1-hiera-large'),
    canRunWithoutTraining: true,
    requiresFineTuning: false,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'RGB-only. Sentinel-2 multispectral requires band mapping / not native.',
    categories: ['field_segmentation', 'tree_segmentation', 'drone', 'rgb'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },
  {
    id: 'hf-mask2former',
    name: 'Mask2Former (Swin-Base ADE)',
    modelType: 'Panoptic / Semantic Segmentation',
    task: 'High-res land / object segmentation',
    inputDataType: 'RGB',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: 'Drone / hi-res RGB',
    ...hf('facebook/mask2former-swin-base-ade-semantic'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'RGB encoder; not native Sentinel-2 multispectral.',
    categories: ['field_segmentation', 'land_cover', 'drone', 'rgb'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'high',
    source: 'huggingface',
  },
  {
    id: 'hf-dinov2-base',
    name: 'DINOv2 Base',
    modelType: 'Self-supervised Vision Backbone',
    task: 'RGB feature extraction for downstream heads',
    inputDataType: 'RGB',
    requiredBands: ['R', 'G', 'B'],
    recommendedResolution: 'Drone / hi-res RGB',
    ...hf('facebook/dinov2-base'),
    canRunWithoutTraining: false,
    requiresFineTuning: true,
    onnxAvailable: false,
    recommendedAgriculture: true,
    recommendedFields: true,
    recommendedTrees: true,
    recommendedDrone: true,
    recommendedSentinel2: false,
    confidenceLimitation: 'Features only — needs a segmentation / detection head.',
    categories: ['feature_extraction', 'drone', 'rgb'],
    trainableOnAgroCloud: false,
    gpuRequirement: 'medium',
    source: 'huggingface',
  },
]

export const DEFAULT_TRAINING_MODEL_ID = 'agro-segformer-b2'

/** Models shown in Training AI model picker (fine-tune SegFormers + AgroCloud field engines). */
export function isTrainModelPickerEntry(model: TrainingModelEntry): boolean {
  if (model.trainableOnAgroCloud) return true
  return model.inferEngine === 'delineate-fbis' || model.inferEngine === 'ftw'
}

/**
 * Map any Train-step picker selection to a SegFormer that can actually fine-tune on :8095.
 * FTW / Delineate remain the Infer engines; TRAIN MODEL fine-tunes their declared
 * trainEncoder (SegFormer-B2) so Results get real epoch curves for every picker choice.
 */
export function resolveTrainJobModel(
  modelId: string | null | undefined,
): TrainingModelEntry | null {
  const selected = getTrainingModelById(modelId)
  if (!selected || !isTrainModelPickerEntry(selected)) return null
  if (selected.trainableOnAgroCloud && selected.trainEncoder) return selected
  const fallback = getTrainingModelById(DEFAULT_TRAINING_MODEL_ID)
  if (!fallback?.trainableOnAgroCloud || !fallback.trainEncoder) return null
  const encoder = selected.trainEncoder || fallback.trainEncoder
  return {
    ...fallback,
    trainEncoder: encoder,
    // Keep RGB capture bands for the SegFormer fine-tune job.
    requiredBands: fallback.requiredBands,
  }
}

export function getTrainingModelById(id: string | null | undefined): TrainingModelEntry | null {
  const key = String(id || '').trim()
  if (!key) return null
  return TRAINING_MODEL_REGISTRY.find(m => m.id === key) || null
}

export function hfLabel(entry: TrainingModelEntry): string {
  return entry.hfModelId || 'No suitable Hugging Face model found'
}
