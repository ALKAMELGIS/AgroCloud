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
