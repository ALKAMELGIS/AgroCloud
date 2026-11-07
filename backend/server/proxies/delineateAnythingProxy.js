/**
 * Delineate Anything (FBIS field-boundary instance segmentation) proxy.
 *
 * Forwards Training AI Infer mosaics to `backend/services/delineate-anything`
 * (default http://127.0.0.1:8096/predict).
 *
 * Env:
 *   DELINEATE_ANYTHING_URL   (default http://127.0.0.1:8096/predict)
 *   DELINEATE_ANYTHING_MODEL (default large = DelineateAnything.pt / FBIS-22M)
 */

import express from 'express'

function toNum(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function registerDelineateAnythingRoutes(app, { rawBodyLimit = '40mb' } = {}) {
  const ENDPOINT = String(
    process.env.DELINEATE_ANYTHING_URL || 'http://127.0.0.1:8096/predict',
  ).trim()
  const DEFAULT_MODEL = String(process.env.DELINEATE_ANYTHING_MODEL || 'v2').trim() || 'v2'
  const DEFAULT_CONF = toNum(process.env.DELINEATE_ANYTHING_CONF, 0.2)
  const IMG_SIZE = toNum(process.env.DELINEATE_ANYTHING_IMG_SIZE, 1024)
  const IOU = toNum(process.env.DELINEATE_ANYTHING_IOU, 0.45)

  app.get('/api/delineate-anything/config', async (_req, res) => {
    let online = false
    let health = null
    try {
      const healthUrl = ENDPOINT.replace(/\/predict\/?$/i, '/health')
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const r = await fetch(healthUrl, { signal: ctrl.signal })
      clearTimeout(t)
      if (r.ok) {
        online = true
        health = await r.json().catch(() => null)
      }
    } catch {
      online = false
    }
    res.json({
      configured: Boolean(ENDPOINT) && online,
      online,
      model: DEFAULT_MODEL,
      imgSize: IMG_SIZE,
      iou: IOU,
      engine: health?.engine || 'delineate-anything',
      endpoint: ENDPOINT.replace(/\/predict\/?$/i, ''),
    })
  })

  app.get('/api/delineate-anything/health', async (_req, res) => {
    try {
      const healthUrl = ENDPOINT.replace(/\/predict\/?$/i, '/health')
      const r = await fetch(healthUrl)
      const json = await r.json().catch(() => ({}))
      return res.status(r.ok ? 200 : 502).json({ ...json, online: r.ok })
    } catch (error) {
      return res.status(502).json({
        online: false,
        status: 'offline',
        error:
          'Delineate Anything service offline. Start: cd backend/services/delineate-anything; .\\start-local.ps1',
        detail: String(error?.message || error),
      })
    }
  })

  app.post(
    '/api/delineate-anything/predict',
    express.raw({ type: () => true, limit: rawBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'Delineate Anything is not configured. Start backend/services/delineate-anything (start-local.ps1).',
        })
      }
      const buf = req.body
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Empty image body — expected raw PNG bytes.' })
      }

      try {
        const conf = toNum(req.query.conf ?? req.query.score, DEFAULT_CONF)
        const imgsz = toNum(req.query.imgsz, IMG_SIZE)
        const iou = toNum(req.query.iou, IOU)
        const model = String(req.query.model || DEFAULT_MODEL)
        const minArea = toNum(req.query.min_area_m2, 40)
        const west = req.query.west
        const south = req.query.south
        const east = req.query.east
        const north = req.query.north

        const form = new FormData()
        form.append('file', new Blob([buf], { type: 'image/png' }), 'aoi.png')
        form.append('conf', String(conf))
        form.append('imgsz', String(imgsz))
        form.append('iou', String(iou))
        form.append('model', model)
        form.append('min_area_m2', String(minArea))
        if (west != null && south != null && east != null && north != null) {
          form.append('west', String(west))
          form.append('south', String(south))
          form.append('east', String(east))
          form.append('north', String(north))
        }

        const upstream = await fetch(ENDPOINT, { method: 'POST', body: form })
        const text = await upstream.text()
        if (!upstream.ok) {
          return res.status(502).json({
            error: `Delineate Anything error (HTTP ${upstream.status}).`,
            detail: text.slice(0, 800),
          })
        }
        let json
        try {
          json = JSON.parse(text)
        } catch {
          return res.status(502).json({ error: 'Delineate Anything returned non-JSON.' })
        }
        return res.json(json)
      } catch (error) {
        return res.status(502).json({
          error:
            'Could not reach Delineate Anything. Start: cd backend/services/delineate-anything; .\\start-local.ps1',
          detail: String(error?.message || error),
        })
      }
    },
  )
}
