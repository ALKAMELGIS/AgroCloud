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
