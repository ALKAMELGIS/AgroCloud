import test from 'node:test'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import { detectFieldsBuiltin } from '../server/engines/fieldBoundaryBuiltin.js'

function greenJpegDataUrl(width = 48, height = 48) {
  const data = Buffer.alloc(width * height * 4, 255)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 30
    data[i * 4 + 1] = 160
    data[i * 4 + 2] = 40
    data[i * 4 + 3] = 255
  }
  const { data: encoded } = jpeg.encode({ data, width, height }, 80)
  return `data:image/jpeg;base64,${Buffer.from(encoded).toString('base64')}`
}

test('builtin field detect polygonizes a green RGB capture', () => {
  const result = detectFieldsBuiltin({
    image: greenJpegDataUrl(),
    bbox: [55.0, 24.0, 55.02, 24.02],
    min_area_m2: 1,
    source: 'basemap',
  })
  assert.equal(result.engine, 'spectral-builtin')
  assert.ok(result.count >= 1)
  assert.equal(result.geojson.type, 'FeatureCollection')
  assert.equal(result.geojson.features[0].geometry.type, 'Polygon')
  assert.ok(Number(result.geojson.features[0].properties.area_m2) > 0)
})
