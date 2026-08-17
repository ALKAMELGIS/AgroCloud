import test from 'node:test'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import { detectFieldsBuiltin } from '../server/fieldBoundaryBuiltin.js'
import { detectTreesBuiltin } from '../server/treeDetectionProxy.js'

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

test('builtin tree detect returns YOLO-shaped boxes from RGB', () => {
  const width = 96
  const height = 96
  const data = Buffer.alloc(width * height * 4, 255)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 198
    data[i * 4 + 1] = 178
    data[i * 4 + 2] = 132
    data[i * 4 + 3] = 255
  }
  const paint = (cx, cy, radius, r, g, b) => {
    const r2 = radius * radius
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const i = (y * width + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }
  }
  paint(28, 30, 8, 28, 168, 36)
  paint(70, 66, 7, 22, 150, 30)
  const { data: encoded } = jpeg.encode({ data, width, height }, 92)
  const trees = detectTreesBuiltin({ buffer: Buffer.from(encoded), score: 0.2, metersPerPixel: 0.3 })
  assert.equal(trees.engine, 'spectral-builtin')
  assert.ok(Array.isArray(trees.boxes))
  assert.ok(trees.boxes.length >= 1, `expected canopy boxes, got ${trees.boxes.length}`)
  assert.ok(trees.boxes[0].xmax > trees.boxes[0].xmin)
  assert.ok(trees.boxes[0].score > 0)
})
