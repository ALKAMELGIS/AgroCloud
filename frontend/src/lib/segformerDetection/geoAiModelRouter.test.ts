import { describe, expect, it } from 'vitest'
import { getSegFormerClass } from './segformerCatalog'
import {
  geoAiEngineLabel,
  geoAiModelTypeIdForTarget,
  geoAiTargetIdForModelType,
  GEO_AI_TARGETS,
  isGeoAiTargetId,
  resolveGeoAiTargetRoute,
  type GeoAiTargetId,
} from './geoAiModelRouter'
import { getSegFormerModelType, resolveSegFormerModelTypeClassId } from './segformerModelPresets'

const TARGET_ENGINE: Record<GeoAiTargetId, 'segformer-b5' | 'yolo11'> = {
  crops: 'segformer-b5',
  trees: 'segformer-b5',
  buildings: 'segformer-b5',
  cars: 'yolo11',
  'land-cover': 'segformer-b5',
  'field-boundary': 'segformer-b5',
}

const TARGET_MODEL_TYPE: Record<GeoAiTargetId, string> = {
  crops: 'crop-classification',
  trees: 'tree-detection',
  buildings: 'building-extraction',
  cars: 'vehicle-detection',
  'land-cover': 'land-cover',
  'field-boundary': 'agriculture-field-boundary',
}

describe('geoAiModelRouter', () => {
  it('lists primary and secondary GeoAI target chips', () => {
    expect(GEO_AI_TARGETS.map((t) => t.id)).toEqual([
      'trees',
      'crops',
      'buildings',
      'cars',
      'land-cover',
      'field-boundary',
    ])
    const primary = GEO_AI_TARGETS.filter((t) => t.chipTier === 'primary').map((t) => t.id)
    expect(primary).toEqual(['trees', 'crops', 'buildings', 'cars'])
  })

  it('maps each target to engine + model type preset', () => {
    for (const target of GEO_AI_TARGETS) {
      const route = resolveGeoAiTargetRoute(target.id)
      expect(route.detectEngine).toBe(TARGET_ENGINE[target.id])
      expect(route.modelTypeId).toBe(TARGET_MODEL_TYPE[target.id])
      expect(geoAiModelTypeIdForTarget(target.id)).toBe(route.modelTypeId)
      expect(geoAiTargetIdForModelType(route.modelTypeId)).toBe(target.id)

      const preset = getSegFormerModelType(route.modelTypeId)
      expect(preset?.categoryId).toBe(route.categoryId)
    }
  })

  it('flags Cars as YOLO11 with SegFormer detect fallback', () => {
    const cars = resolveGeoAiTargetRoute('cars')
    expect(cars.detectEngine).toBe('yolo11')
    expect(cars.detectUsesSegFormerFallback).toBe(true)
    expect(cars.categoryId).toBe('vehicles')
    expect(resolveSegFormerModelTypeClassId('vehicle-detection')).toBe(60)
    expect(getSegFormerClass(60)?.name).toBe('Car')
  })

  it('enables field pipeline only for field-boundary', () => {
    expect(resolveGeoAiTargetRoute('field-boundary').fieldPipeline).toBe(true)
    expect(resolveGeoAiTargetRoute('crops').fieldPipeline).toBe(false)
    expect(resolveGeoAiTargetRoute('cars').supportsSam2Refine).toBe(true)
  })

  it('formats engine badges for the UI', () => {
    expect(geoAiEngineLabel('segformer-b5')).toBe('SegFormer-B5')
    expect(geoAiEngineLabel('yolo11')).toBe('YOLO11')
    expect(geoAiEngineLabel('sam2')).toBe('SAM2')
  })

  it('guards GeoAI target ids', () => {
    expect(isGeoAiTargetId('cars')).toBe(true)
    expect(isGeoAiTargetId('water-detection')).toBe(false)
    expect(isGeoAiTargetId(null)).toBe(false)
  })
})
