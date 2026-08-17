import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import jpeg from 'jpeg-js'
import {
  builtinTrainingHealth,
  getBuiltinInferenceJob,
  getBuiltinModel,
  getBuiltinTrainingJob,
  resetTrainingAiBuiltinForTests,
  startBuiltinInferenceJob,
  startBuiltinTrainingJob,
} from '../server/trainingAiBuiltin.js'

function greenJpegDataUrl(width = 64, height = 64) {
  const data = Buffer.alloc(width * height * 4, 255)
  for (let i = 0; i < width * height; i++) {
    const x = i % width
    const left = x < width / 2
    data[i * 4] = left ? 30 : 170
    data[i * 4 + 1] = left ? 160 : 70
    data[i * 4 + 2] = left ? 40 : 30
    data[i * 4 + 3] = 255
  }
  const { data: encoded } = jpeg.encode({ data, width, height }, 80)
  return `data:image/jpeg;base64,${Buffer.from(encoded).toString('base64')}`
}

function box(west, south, east, north) {
  return {
    type: 'Polygon',
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  }
}

test('builtin training health reports training ready without Python :8095', () => {
  const health = builtinTrainingHealth()
  assert.equal(health.status, 'ok')
  assert.equal(health.training, true)
  assert.equal(health.available, true)
  assert.equal(health.engine, 'spectral-builtin')
})

test('builtin training + inference learn RGB prototypes from labeled samples', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrocloud-tai-'))
  process.env.TRAINING_AI_BUILTIN_DIR = dir
  resetTrainingAiBuiltinForTests()
  try {
    const bbox = [55.0, 24.0, 55.02, 24.02]
    const samples = [
      { sample_id: 'a', class_id: 1, class_name: 'Field', geometry: box(55.001, 24.001, 55.008, 24.018), geometry_type: 'Polygon' },
      { sample_id: 'b', class_id: 1, class_name: 'Field', geometry: box(55.002, 24.002, 55.007, 24.010), geometry_type: 'Polygon' },
      { sample_id: 'c', class_id: 1, class_name: 'Field', geometry: box(55.003, 24.004, 55.006, 24.012), geometry_type: 'Polygon' },
      { sample_id: 'd', class_id: 2, class_name: 'Soil', geometry: box(55.012, 24.001, 55.019, 24.018), geometry_type: 'Polygon' },
      { sample_id: 'e', class_id: 2, class_name: 'Soil', geometry: box(55.013, 24.003, 55.018, 24.011), geometry_type: 'Polygon' },
    ]
    const jobId = startBuiltinTrainingJob({
      samples,
      classes: [
        { class_id: 1, class_name: 'Field', color: '#22c55e' },
        { class_id: 2, class_name: 'Soil', color: '#b45309' },
      ],
      imageDataUrl: greenJpegDataUrl(),
      bbox,
      epochs: 4,
    })
    const job = getBuiltinTrainingJob(jobId)
    assert.equal(job?.status, 'done')
    assert.ok(job?.model?.model_id)
    assert.ok((job?.loss_history || []).length >= 4)
    const model = getBuiltinModel(job.model.model_id)
    assert.equal(model?.engine, 'spectral-builtin')

    const inferId = startBuiltinInferenceJob({
      model_id: job.model.model_id,
      imageDataUrl: greenJpegDataUrl(),
      bbox,
      confidence: 0.2,
      output_type: 'segmentation',
    })
    const infer = getBuiltinInferenceJob(inferId)
    assert.equal(infer?.status, 'done')
    assert.equal(infer?.result?.geojson?.type, 'FeatureCollection')
    assert.ok((infer?.result?.count || 0) >= 1)
    assert.equal(infer?.result?.engine, 'spectral-builtin')
  } finally {
    resetTrainingAiBuiltinForTests()
    delete process.env.TRAINING_AI_BUILTIN_DIR
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
