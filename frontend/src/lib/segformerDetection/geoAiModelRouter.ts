/**
 * GeoAI Analysis Toolbox — target chips → inference engine + SegFormer preset.
 *
 * Detect v1: Cars shows YOLO11 in the UI but still calls SegFormer vehicles
 * classes until a dedicated YOLO service is wired.
 */

import type { SegFormerCategoryId } from './segformerCatalog'
import {
  getSegFormerModelType,
  isSegFormerFieldPipeline,
  type SegFormerModelTypeId,
} from './segformerModelPresets'

export type GeoAiTargetId =
  | 'crops'
  | 'trees'
  | 'buildings'
  | 'cars'
  | 'land-cover'
  | 'field-boundary'

export type GeoAiEngine = 'segformer-b5' | 'yolo11' | 'sam2'

export type GeoAiTargetChipTier = 'primary' | 'secondary'

export type GeoAiTargetDef = {
  id: GeoAiTargetId
  label: string
  chipTier: GeoAiTargetChipTier
}

export const GEO_AI_TARGETS: readonly GeoAiTargetDef[] = [
  { id: 'trees', label: 'Trees', chipTier: 'primary' },
  { id: 'crops', label: 'Crops', chipTier: 'primary' },
  { id: 'buildings', label: 'Buildings', chipTier: 'primary' },
  { id: 'cars', label: 'Cars', chipTier: 'primary' },
  { id: 'land-cover', label: 'Land Cover', chipTier: 'secondary' },
  { id: 'field-boundary', label: 'Field Boundary', chipTier: 'secondary' },
] as const

const GEO_AI_TARGET_IDS = new Set<GeoAiTargetId>(GEO_AI_TARGETS.map((t) => t.id))

const TARGET_TO_MODEL_TYPE: Record<GeoAiTargetId, SegFormerModelTypeId> = {
  crops: 'crop-classification',
  trees: 'tree-detection',
  buildings: 'building-extraction',
  cars: 'vehicle-detection',
  'land-cover': 'land-cover',
  'field-boundary': 'agriculture-field-boundary',
}

const MODEL_TYPE_TO_TARGET = new Map<SegFormerModelTypeId, GeoAiTargetId>(
  (Object.entries(TARGET_TO_MODEL_TYPE) as [GeoAiTargetId, SegFormerModelTypeId][]).map(
    ([targetId, modelTypeId]) => [modelTypeId, targetId],
  ),
)

export type GeoAiTargetRoute = {
  targetId: GeoAiTargetId
  /** Badge shown on the AI Analysis Tool row. */
  detectEngine: GeoAiEngine
  modelTypeId: SegFormerModelTypeId
  categoryId: SegFormerCategoryId
  /**
   * True when Detect still hits SegFormer `/detect` while the UI labels another
   * engine (Cars → YOLO11 until Ultralytics service ships).
   */
  detectUsesSegFormerFallback: boolean
  /** Staged B5 → SAM2 → Temporal (field boundary only). */
  fieldPipeline: boolean
  /** Boundary refine toggle is meaningful for this target (incl. optional SAM2). */
  supportsSam2Refine: boolean
}

export function isGeoAiTargetId(value: unknown): value is GeoAiTargetId {
  return typeof value === 'string' && GEO_AI_TARGET_IDS.has(value as GeoAiTargetId)
}

export function getGeoAiTargetDef(targetId: GeoAiTargetId): GeoAiTargetDef | undefined {
  return GEO_AI_TARGETS.find((t) => t.id === targetId)
}

export function geoAiModelTypeIdForTarget(targetId: GeoAiTargetId): SegFormerModelTypeId {
  return TARGET_TO_MODEL_TYPE[targetId]
}

export function geoAiTargetIdForModelType(
  modelTypeId: SegFormerModelTypeId,
): GeoAiTargetId | undefined {
  return MODEL_TYPE_TO_TARGET.get(modelTypeId)
}

export function resolveGeoAiTargetRoute(targetId: GeoAiTargetId): GeoAiTargetRoute {
  const modelTypeId = TARGET_TO_MODEL_TYPE[targetId]
  const preset = getSegFormerModelType(modelTypeId)
  if (!preset) {
    throw new Error(`GeoAI router: unknown model type for target "${targetId}"`)
  }

  const fieldPipeline = isSegFormerFieldPipeline(modelTypeId)
  const detectEngine: GeoAiEngine = targetId === 'cars' ? 'yolo11' : 'segformer-b5'

  return {
    targetId,
    detectEngine,
    modelTypeId,
    categoryId: preset.categoryId,
    detectUsesSegFormerFallback: targetId === 'cars',
    fieldPipeline,
    supportsSam2Refine: true,
  }
}

export function geoAiEngineLabel(engine: GeoAiEngine): string {
  switch (engine) {
    case 'segformer-b5':
      return 'SegFormer-B5'
    case 'yolo11':
      return 'YOLO11'
    case 'sam2':
      return 'SAM2'
    default: {
      const _exhaustive: never = engine
      return _exhaustive
    }
  }
}
