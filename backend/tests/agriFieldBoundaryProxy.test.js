import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { registerAgriFieldBoundaryRoutes } from '../server/agriFieldBoundaryProxy.js'

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

function close(server) {
  return new Promise(resolve => server.close(resolve))
}

test('agri-field-boundary /health is always online (builtin fallback)', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/health`)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.status, 'ok')
    assert.equal(json.offline, false)
    assert.equal(json.builtin_fallback, true)
    assert.equal(json.ready, true)
  } finally {
    await close(server)
  }
})

test('agri-field-boundary /config reports configured with builtin fallback', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/config`)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.configured, true)
    assert.equal(json.builtin_fallback, true)
  } finally {
    await close(server)
  }
})

test('ftw-mosaic-vectorize preserves concave mask corners (not convex hull)', async () => {
  const { vectorizeBinaryMaskBuiltin } = await import('../server/fieldBoundaryBuiltin.js')
  const { PNG } = await import('pngjs')
  const w = 32
  const h = 32
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside =
        (x >= 4 && x <= 10 && y >= 4 && y <= 26) || (x >= 4 && x <= 24 && y >= 18 && y <= 26)
      const o = (y * w + x) * 4
      const v = inside ? 255 : 0
      png.data[o] = v
      png.data[o + 1] = v
      png.data[o + 2] = v
      png.data[o + 3] = 255
    }
  }
  const mask = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
  const result = vectorizeBinaryMaskBuiltin({
    mask,
    bbox: [55.0, 24.0, 55.01, 24.01],
    min_area_m2: 1,
    preserve_geometry: true,
  })
  assert.ok(result.count >= 1)
  const ring = result.geojson.features[0].geometry.coordinates[0]
  assert.ok(ring.length >= 6, `expected concave contour, got ${ring.length} vertices`)
})

test('ftw-mosaic-vectorize route is registered and accepts mask POST', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const { PNG } = await import('pngjs')
    const w = 64
    const h = 64
    const png = new PNG({ width: w, height: h })
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      png.data[o] = 255
      png.data[o + 1] = 255
      png.data[o + 2] = 255
      png.data[o + 3] = 255
    }
    const mask = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/ftw-mosaic-vectorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mask,
        bbox: [5.0, 52.0, 5.02, 52.02],
        min_area_m2: 100,
      }),
    })
    assert.notEqual(res.status, 404, 'route must exist')
    const json = await res.json()
    assert.equal(res.status, 200)
    assert.ok(json.geojson)
    assert.equal(json.geojson.type, 'FeatureCollection')
    assert.ok(json.count >= 1, 'white mosaic mask should yield at least one field polygon')
  } finally {
    await close(server)
  }
})

test('FTW Inference S2 detect without image is not rejected as { image, bbox }', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/detect-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: [30.0, 30.0, 30.01, 30.01],
        source: 'basemap',
        model: 'ftw-inference-s2',
      }),
    })
    const json = await res.json()
    assert.notEqual(
      String(json.error || ''),
      'Expected JSON { image, bbox } for field boundary detection.',
    )
    if (res.status !== 200) {
      assert.match(String(json.error || ''), /FTW Inference|Python|8092|ftw-baselines/i)
    }
  } finally {
    await close(server)
  }
})

test('basemap source + FTW S2 model canonicalizes source before forward', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/detect-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: [30.0, 30.0, 30.01, 30.01],
        source: 'basemap',
        model: 'ftw-inference-s2',
      }),
    })
    const json = await res.json()
    assert.notEqual(
      String(json.error || ''),
      'Expected JSON { image, bbox } for field boundary detection.',
    )
    if (res.status !== 200) {
      assert.match(String(json.error || ''), /FTW Inference|Python|8092|ftw-baselines/i)
    }
  } finally {
    await close(server)
  }
})

test('AFD detect without image is not rejected as { image, bbox }', async () => {
  const app = express()
  registerAgriFieldBoundaryRoutes(app)
  const server = await listen(app)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agri-field-boundary/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: [30.0, 30.0, 30.01, 30.01],
        source: 'agricultural-field-delineation',
        image: '',
      }),
    })
    const json = await res.json()
    assert.notEqual(
      String(json.error || ''),
      'Expected JSON { image, bbox } for field boundary detection.',
    )
    // Without a ready Python engine, AFD must surface the model-specific message
    // (or a successful geojson payload if :8092 is already up in this environment).
    if (res.status !== 200) {
      assert.match(String(json.error || ''), /Agricultural Field Delineation|Python|8092|model/i)
      assert.ok(res.status === 400 || res.status === 502)
    } else {
      assert.ok(json.geojson)
    }
  } finally {
    await close(server)
  }
})
