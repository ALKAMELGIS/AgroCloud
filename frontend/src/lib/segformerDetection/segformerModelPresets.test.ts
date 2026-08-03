import { describe, expect, it } from 'vitest'
import {
  getSegFormerClass,
  getSegFormerDefaultMinConfidence,
  isSegFormerClassMapped,
  SEGFORMER_AG_MIN_CONFIDENCE,
  SEGFORMER_DEFAULT_MIN_CONFIDENCE,
} from './segformerCatalog'
import {
  createSegFormerInferenceParams,
  getSegFormerClassesForModelType,
  getSegFormerModelType,
  getSegFormerModelTypeDefaultConfidence,
  normalizeSegFormerConfidence,
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  resolveSegFormerModelTypeClassId,
  SEGFORMER_CROP_CLASS_IDS,
  SEGFORMER_DEFAULT_MODEL_TYPE_ID,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
  SEGFORMER_MODEL_TYPES,
  SEGFORMER_TILE_SIZE_OPTIONS,
} from './segformerModelPresets'

describe('segformerModelPresets', () => {
  it('maps each Model Type onto an existing catalogue category / class', () => {
    const expected: Record<string, { categoryId: string; defaultClassId: number }> = {
      'agriculture-field-boundary': { categoryId: 'agriculture', defaultClassId: 1 },
      'crop-classification': { categoryId: 'agriculture', defaultClassId: 2 },
      'land-cover': { categoryId: 'land-surface', defaultClassId: 80 },
      'tree-detection': { categoryId: 'trees', defaultClassId: 20 },
      'water-detection': { categoryId: 'water', defaultClassId: 70 },
      'building-extraction': { categoryId: 'buildings', defaultClassId: 40 },
      'vehicle-detection': { categoryId: 'vehicles', defaultClassId: 60 },
    }

    expect(SEGFORMER_MODEL_TYPES).toHaveLength(7)
    for (const preset of SEGFORMER_MODEL_TYPES) {
      const exp = expected[preset.id]
      expect(exp).toBeDefined()
      expect(preset.categoryId).toBe(exp!.categoryId)
      expect(preset.defaultClassId).toBe(exp!.defaultClassId)
      const cls = getSegFormerClass(preset.defaultClassId)
      expect(cls).toBeDefined()
      expect(cls!.categoryId).toBe(preset.categoryId)
      expect(isSegFormerClassMapped(cls!)).toBe(true)
      expect(resolveSegFormerModelTypeClassId(preset.id)).toBe(preset.defaultClassId)
    }
  })

  it('Agriculture Field Boundary targets Agricultural Field only', () => {
    const preset = getSegFormerModelType('agriculture-field-boundary')!
    expect(preset.defaultClassId).toBe(1)
    expect(getSegFormerClass(1)?.name).toBe('Agricultural Field')
    expect(getSegFormerClassesForModelType(preset).map((c) => c.id)).toEqual([1])
  })

  it('Crop Classification uses the crop-related agriculture subset', () => {
    const classes = getSegFormerClassesForModelType('crop-classification')
    expect(classes.map((c) => c.id)).toEqual([...SEGFORMER_CROP_CLASS_IDS])
    expect(classes.every((c) => c.categoryId === 'agriculture')).toBe(true)
    // Farm Boundary / Greenhouse stay out of the crop working set
    expect(classes.some((c) => c.id === 8 || c.id === 9)).toBe(false)
  })

  it('Vehicle Detection defaults to Car in the vehicles category', () => {
    const preset = getSegFormerModelType('vehicle-detection')!
    expect(preset.categoryId).toBe('vehicles')
    expect(preset.defaultClassId).toBe(60)
    expect(getSegFormerClass(60)?.name).toBe('Car')
    const classes = getSegFormerClassesForModelType('vehicle-detection')
    expect(classes.every((c) => c.categoryId === 'vehicles')).toBe(true)
    expect(classes.some((c) => c.id === 60)).toBe(true)
  })

  it('Land Cover / Tree / Water / Building use full category class lists', () => {
    for (const id of [
      'land-cover',
      'tree-detection',
      'water-detection',
      'building-extraction',
    ] as const) {
      const preset = getSegFormerModelType(id)!
      expect(preset.classIds).toEqual([])
      const classes = getSegFormerClassesForModelType(id)
      expect(classes.length).toBeGreaterThan(1)
      expect(classes.every((c) => c.categoryId === preset.categoryId)).toBe(true)
    }
  })

  it('uses field-pipeline confidence (~0.4) for agriculture-field-boundary', () => {
    expect(getSegFormerModelTypeDefaultConfidence('agriculture-field-boundary')).toBe(0.4)
    expect(getSegFormerModelType('agriculture-field-boundary')?.fieldPipeline).toBe(true)
    expect(getSegFormerModelTypeDefaultConfidence('tree-detection')).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerModelTypeDefaultConfidence('building-extraction')).toBe(
      SEGFORMER_DEFAULT_MIN_CONFIDENCE,
    )
    expect(getSegFormerModelTypeDefaultConfidence('land-cover')).toBe(
      getSegFormerDefaultMinConfidence('land-surface'),
    )
  })

  it('defaults field pipeline to tile 640 / overlap 20% / conf 0.4', () => {
    expect(SEGFORMER_DEFAULT_MODEL_TYPE_ID).toBe('agriculture-field-boundary')
    expect(SEGFORMER_DEFAULT_TILE_SIZE).toBe(512)
    expect(SEGFORMER_TILE_SIZE_OPTIONS).toEqual([256, 512, 640, 1024])
    expect(SEGFORMER_DEFAULT_OVERLAP).toBe(0.2)

    expect(normalizeSegFormerTileSize(256)).toBe(256)
    expect(normalizeSegFormerTileSize(640)).toBe(640)
    expect(normalizeSegFormerTileSize(999)).toBe(1024)
    expect(normalizeSegFormerOverlap(0.2)).toBe(0.2)
    expect(normalizeSegFormerOverlap(20)).toBe(0.2) // percent → fraction
    expect(normalizeSegFormerOverlap(2)).toBe(0.02) // 2% → 0.02
    expect(normalizeSegFormerOverlap(90)).toBe(0.5) // clamped to 50%
    expect(normalizeSegFormerConfidence(1.5)).toBe(1)
    expect(normalizeSegFormerConfidence(-0.2)).toBe(0)

    const params = createSegFormerInferenceParams()
    expect(params).toEqual({
      minConfidence: 0.4,
      tileSize: 640,
      overlap: 0.2,
    })
  })
})
