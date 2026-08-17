import { describe, expect, it } from 'vitest'
import {
  autoSelectModelId,
  evaluateModelCompatibility,
  recommendModelsForImagery,
} from './modelCompatibility'
import {
  DEFAULT_TRAINING_MODEL_ID,
  TRAINING_MODEL_REGISTRY,
  getTrainingModelById,
  hfLabel,
} from './modelRegistry'

describe('modelRegistry', () => {
  it('includes AgroCloud SegFormer-B2 as default trainable model', () => {
    const m = getTrainingModelById(DEFAULT_TRAINING_MODEL_ID)
    expect(m?.trainableOnAgroCloud).toBe(true)
    expect(m?.hfModelId).toBe('nvidia/segformer-b2-finetuned-ade-512-512')
  })

  it('keeps verified HF ids and marks unknown as null', () => {
    const prithvi = getTrainingModelById('hf-prithvi-eo-2-300m')
    expect(prithvi?.hfModelId).toBe('ibm-nasa-geospatial/Prithvi-EO-2.0-300M')
    const ftw = getTrainingModelById('agro-ftw-live')
    expect(ftw?.hfModelId).toBeNull()
    expect(hfLabel(ftw!)).toMatch(/No suitable Hugging Face/)
  })

  it('does not invent empty registry', () => {
    expect(TRAINING_MODEL_REGISTRY.length).toBeGreaterThan(10)
  })
})

describe('modelCompatibility', () => {
  it('marks Sentinel-2 + Prithvi as compatible / fine-tune', () => {
    const m = getTrainingModelById('hf-prithvi-eo-2-300m')!
    const c = evaluateModelCompatibility(m, 'sentinel2')
    expect(['compatible', 'requires_fine_tuning']).toContain(c.status)
    expect(c.score).toBeGreaterThan(80)
  })

  it('marks Drone RGB + SAM as compatible', () => {
    const m = getTrainingModelById('hf-sam2-1-large')!
    const c = evaluateModelCompatibility(m, 'drone_rgb')
    expect(c.status).toBe('compatible')
  })

  it('marks Drone RGB + Prithvi as not directly compatible', () => {
    const m = getTrainingModelById('hf-prithvi-eo-2-300m')!
    const c = evaluateModelCompatibility(m, 'drone_rgb')
    expect(c.status).toBe('not_compatible')
  })

  it('requires preprocessing for Sentinel-2 + RGB SegFormer', () => {
    const m = getTrainingModelById('agro-segformer-b2')!
    const c = evaluateModelCompatibility(m, 'sentinel2')
    expect(['requires_preprocessing', 'requires_fine_tuning']).toContain(c.status)
  })

  it('auto-select prefers trainable models for Train step', () => {
    const id = autoSelectModelId('sentinel2', { preferTrainable: true })
    expect(getTrainingModelById(id)?.trainableOnAgroCloud).toBe(true)
  })

  it('recommends EO models for Sentinel-2', () => {
    const ids = recommendModelsForImagery('sentinel2', 8).map(m => m.id)
    expect(ids.some(id => id.includes('prithvi') || id.includes('terramind') || id.includes('ftw'))).toBe(
      true,
    )
  })
})
