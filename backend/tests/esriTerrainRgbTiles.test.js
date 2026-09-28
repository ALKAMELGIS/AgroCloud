/**
 * Smoke tests for Esri → Mapbox terrain-RGB tile proxy (3D relief mesh).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'

test('terrain esri-rgb route returns PNG', async () => {
  const { registerEsriTerrainTileRoutes } = await import('../server/esriTerrainRgbTiles.js')
  const app = express()
  registerEsriTerrainTileRoutes(app)
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/terrain/esri-rgb/8/120/85.png`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /image\/png/i)
    const buf = Buffer.from(await res.arrayBuffer())
    assert.ok(buf.length > 100)
    assert.equal(buf[0], 0x89)
    assert.equal(buf[1], 0x50)
  } finally {
    server.close()
  }
})
