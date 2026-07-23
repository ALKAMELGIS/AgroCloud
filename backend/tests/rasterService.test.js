/**
 * Smoke tests for aerial raster catalog + tile JSON helpers.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

test('raster store create/get/delete', async () => {
  const { createRasterRecord, getRasterRecord, deleteRasterRecord, RASTER_UPLOAD_ROOT } = await import(
    '../server/raster/rasterStore.js'
  )
  assert.ok(RASTER_UPLOAD_ROOT.includes('uploads'))
  const rec = createRasterRecord({ name: 'test.tif', status: 'processing' })
  assert.equal(getRasterRecord(rec.id)?.name, 'test.tif')
  assert.equal(deleteRasterRecord(rec.id), true)
  assert.equal(getRasterRecord(rec.id), null)
})

test('buildTileJson includes xyz template', async () => {
  const { buildTileJson } = await import('../server/raster/rasterTileProxy.js')
  const req = {
    protocol: 'http',
    headers: {},
    get: () => 'localhost:3011',
  }
  const tj = buildTileJson(req, {
    id: 'abc',
    name: 'ortho.tif',
    bboxWgs84: { west: 45, south: 9, east: 46, north: 10 },
  })
  assert.equal(tj.tilejson, '2.2.0')
  assert.match(tj.tiles[0], /\/api\/raster\/abc\/tiles\/\{z\}\/\{x\}\/\{y\}\.png/)
  assert.deepEqual(tj.bounds, [45, 9, 46, 10])
})

test('assertSupportedDriver rejects ECW', async () => {
  const { assertSupportedDriver } = await import('../server/raster/rasterCogPipeline.js')
  assert.throws(() => assertSupportedDriver('scene.ecw'), /licensed|GeoTIFF|Convert/i)
})
