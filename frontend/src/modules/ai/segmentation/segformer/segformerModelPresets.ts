/**
 * SegFormer workspace model-type presets.
 *
 * Each preset maps a high-level Model Type onto existing catalogue
 * categories / classes in {@link ./segformerCatalog}, plus default tiling
 * / confidence parameters kept in hook state.
 *
 * Tile size / overlap normalization is shared with {@link ./segformerTiling}.
 */

import {
  getSegFormerClass,
  getSegFormerClassesForCategory,
  getSegFormerDefaultMinConfidence,
  isSegFormerClassMapped,
  type SegFormerCategoryId,
  type SegFormerClassDef,
} from './segformerCatalog'
import {
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
  SEGFORMER_FIELD_DEFAULT_MIN_CONFIDENCE,
  SEGFORMER_FIELD_DEFAULT_OVERLAP,
  SEGFORMER_FIELD_DEFAULT_TILE_SIZE,
  SEGFORMER_TILE_SIZES,
  type SegFormerTileSize,
} from './segformerTiling'

export type { SegFormerTileSize }
export {
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
  SEGFORMER_FIELD_DEFAULT_MIN_CONFIDENCE,
  SEGFORMER_FIELD_DEFAULT_OVERLAP,
  SEGFORMER_FIELD_DEFAULT_TILE_SIZE,
  SEGFORMER_TILE_SIZES,
}

/** Allowed tile sizes for the workspace UI (alias of tiling module). */
export const SEGFORMER_TILE_SIZE_OPTIONS = SEGFORMER_TILE_SIZES

export type SegFormerModelTypeId =
  | 'agriculture-field-boundary'
  | 'crop-classification'
  | 'land-cover'
  | 'tree-detection'
  | 'water-detection'
  | 'building-extraction'
  | 'vehicle-detection'

export type SegFormerModelTypeDef = {
  id: SegFormerModelTypeId
  label: string
  description: string
  /** Catalogue category this model type drives. */
  categoryId: SegFormerCategoryId
  /**
   * Preferred primary class when the preset is selected.
   * Must exist in {@link SEGFORMER_CLASSES}.
   */
  defaultClassId: number
  /**
   * Class IDs in this model type’s working set (subset of the category).
   * Empty means “all classes in the category”.
   */
  classIds: readonly number[]
  /**
   * When true, Detect runs the staged B5 → SAM2 → Temporal field pipeline
   * instead of single-stage SegFormer detect.
   */
  fieldPipeline?: boolean
}

/**
 * Crop-oriented agriculture classes (excludes infrastructure-like ag entries
 * such as Farm Boundary / Greenhouse when a dedicated crop preset is used).
 */
export const SEGFORMER_CROP_CLASS_IDS: readonly number[] = [
  1, // Agricultural Field
  2, // Cultivated Land
  5, // Newly Cultivated Area
  6, // Irrigated Field
  7, // Rainfed Field
  11, // Orchard
  12, // Plantation
  13, // Pasture
  14, // Grassland
  15, // Crop Residue Area
] as const

export const SEGFORMER_MODEL_TYPES: readonly SegFormerModelTypeDef[] = [
  {
    id: 'agriculture-field-boundary',
    label: 'Agriculture Field Boundary Extraction',
    description:
      'Field accuracy pipeline: SegFormer-B5 → SAM2 refine → temporal crop typing.',
    categoryId: 'agriculture',
    defaultClassId: 1,
    classIds: [1],
    fieldPipeline: true,
  },
  {
    id: 'crop-classification',
    label: 'Crop Classification',
    description: 'Crop / cultivation oriented agriculture classes.',
    categoryId: 'agriculture',
    defaultClassId: 2,
    classIds: SEGFORMER_CROP_CLASS_IDS,
  },
  {
    id: 'land-cover',
    label: 'Land Cover Classification',
    description: 'Land-surface cover classes (soil, sand, rock, …).',
    categoryId: 'land-surface',
    defaultClassId: 80,
    classIds: [],
  },
  {
    id: 'tree-detection',
    label: 'Tree Detection',
    description: 'Tree canopy and vegetation structure classes.',
    categoryId: 'trees',
    defaultClassId: 20,
    classIds: [],
  },
  {
    id: 'water-detection',
    label: 'Water Detection',
    description: 'Open water and wetland classes.',
    categoryId: 'water',
    defaultClassId: 70,
    classIds: [],
  },
  {
    id: 'building-extraction',
    label: 'Building Extraction',
    description: 'Buildings and settlement structures.',
    categoryId: 'buildings',
    defaultClassId: 40,
    classIds: [],
  },
  {
    id: 'vehicle-detection',
    label: 'Vehicle Detection (Cars)',
    description:
      'Cars and fleet objects; GeoAI router shows YOLO11 while Detect uses SegFormer vehicles classes (60–68) until a YOLO service is available.',
    categoryId: 'vehicles',
    defaultClassId: 60,
    classIds: [],
  },
] as const

export const SEGFORMER_DEFAULT_MODEL_TYPE_ID: SegFormerModelTypeId =
  'agriculture-field-boundary'

const MODEL_BY_ID = new Map<SegFormerModelTypeId, SegFormerModelTypeDef>(
  SEGFORMER_MODEL_TYPES.map((m) => [m.id, m]),
)

export function getSegFormerModelType(id: SegFormerModelTypeId): SegFormerModelTypeDef | undefined {
  return MODEL_BY_ID.get(id)
}

/** Resolve class defs for a model type (restricted list or full category). */
export function getSegFormerClassesForModelType(
  modelTypeOrId: SegFormerModelTypeDef | SegFormerModelTypeId,
): SegFormerClassDef[] {
  const def = typeof modelTypeOrId === 'string' ? MODEL_BY_ID.get(modelTypeOrId) : modelTypeOrId
  if (!def) return []
  if (def.classIds.length > 0) {
    return def.classIds
      .map((id) => getSegFormerClass(id))
      .filter((c): c is SegFormerClassDef => Boolean(c))
  }
  return getSegFormerClassesForCategory(def.categoryId)
}

/**
 * Preferred class when applying a model-type preset:
 * defaultClassId if mapped, else first mapped class in the working set.
 */
export function resolveSegFormerModelTypeClassId(
  modelTypeOrId: SegFormerModelTypeDef | SegFormerModelTypeId,
): number | null {
  const def = typeof modelTypeOrId === 'string' ? MODEL_BY_ID.get(modelTypeOrId) : modelTypeOrId
  if (!def) return null
  const preferred = getSegFormerClass(def.defaultClassId)
  if (preferred && isSegFormerClassMapped(preferred)) return preferred.id
  const firstMapped = getSegFormerClassesForModelType(def).find((c) => isSegFormerClassMapped(c))
  return firstMapped?.id ?? def.defaultClassId
}

/** Default Detect confidence for a model type (uses category-aware catalogue defaults). */
export function getSegFormerModelTypeDefaultConfidence(
  modelTypeOrId: SegFormerModelTypeDef | SegFormerModelTypeId,
): number {
  const def = typeof modelTypeOrId === 'string' ? MODEL_BY_ID.get(modelTypeOrId) : modelTypeOrId
  if (!def) return getSegFormerDefaultMinConfidence('agriculture')
  if (def.fieldPipeline) return SEGFORMER_FIELD_DEFAULT_MIN_CONFIDENCE
  return getSegFormerDefaultMinConfidence(def.categoryId)
}

/** True when Detect should run B5 → SAM2 → Temporal stages. */
export function isSegFormerFieldPipeline(
  modelTypeOrId: SegFormerModelTypeDef | SegFormerModelTypeId | null | undefined,
): boolean {
  if (!modelTypeOrId) return false
  const def = typeof modelTypeOrId === 'string' ? MODEL_BY_ID.get(modelTypeOrId) : modelTypeOrId
  return Boolean(def?.fieldPipeline)
}

/** Field pipeline inference defaults (tile 640, overlap 0.2, conf ~0.4). */
export function getSegFormerFieldPipelineInferenceParams(): SegFormerInferenceParams {
  return {
    minConfidence: SEGFORMER_FIELD_DEFAULT_MIN_CONFIDENCE,
    tileSize: SEGFORMER_FIELD_DEFAULT_TILE_SIZE,
    overlap: SEGFORMER_FIELD_DEFAULT_OVERLAP,
  }
}

export function isSegFormerTileSize(value: number): value is SegFormerTileSize {
  return (SEGFORMER_TILE_SIZES as readonly number[]).includes(value)
}

/** Clamp confidence to [0, 1]. */
export function normalizeSegFormerConfidence(value: unknown, fallback = 0.45): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

export type SegFormerInferenceParams = {
  minConfidence: number
  tileSize: SegFormerTileSize
  /** Tile overlap as a fraction 0..0.5 (e.g. 0.2 = 20%). */
  overlap: number
}

export function createSegFormerInferenceParams(
  partial?: Partial<SegFormerInferenceParams> | null,
  modelTypeId: SegFormerModelTypeId = SEGFORMER_DEFAULT_MODEL_TYPE_ID,
): SegFormerInferenceParams {
  const field = isSegFormerFieldPipeline(modelTypeId)
  const confFallback = getSegFormerModelTypeDefaultConfidence(modelTypeId)
  const tileFallback = field ? SEGFORMER_FIELD_DEFAULT_TILE_SIZE : SEGFORMER_DEFAULT_TILE_SIZE
  const overlapFallback = field ? SEGFORMER_FIELD_DEFAULT_OVERLAP : SEGFORMER_DEFAULT_OVERLAP
  return {
    minConfidence: normalizeSegFormerConfidence(partial?.minConfidence, confFallback),
    tileSize: normalizeSegFormerTileSize(
      typeof partial?.tileSize === 'number' ? partial.tileSize : tileFallback,
    ),
    overlap: normalizeSegFormerOverlap(
      typeof partial?.overlap === 'number' ? partial.overlap : overlapFallback,
    ),
  }
}
