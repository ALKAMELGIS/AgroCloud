/**
 * Temporal Transformer crop-typing proxy.
 *
 * Forwards to backend/services/temporal-transformer, and can merge Crop_Type
 * props locally when the Python service is offline (passthrough merge).
 *
 *   TEMPORAL_TRANSFORMER_URL   (default http://127.0.0.1:8097/classify)
 *   TEMPORAL_TRANSFORMER_TOKEN (optional Bearer)
 */

import express from 'express'

/** Pure merge used when the Python service is offline or for Node-side tests. */
export function mergeCropTypeProps(geojson, opts = {}) {
  const featuresIn = Array.isArray(geojson?.features) ? geojson.features : []
  const byId = opts.cropByFeatureId || opts.crop_by_feature_id || {}
  let majName = String(opts.majorityClassName || opts.majority_class_name || '').trim()
  const majId = opts.majorityClassId ?? opts.majority_class_id
  if (!majName && majId != null && Number.isFinite(Number(majId))) {
    majName = `Class ${Number(majId)}`
  }
  let majConf = opts.majorityConfidence ?? opts.majority_confidence
  if (majConf != null) majConf = Math.max(0, Math.min(1, Number(majConf) || 0))
  const dates = Array.isArray(opts.dates) ? opts.dates.filter(Boolean) : []
  const dateNote = dates.join(',').slice(0, 120)
  const defaultCrop = String(opts.defaultCrop || 'Unknown').trim() || 'Unknown'

  const features = featuresIn.map((f) => {
    if (!f || typeof f !== 'object') return f
    const props = { ...(f.properties || {}) }
    const fid = String(props.Feature_ID || props.objectId || props.object_id || f.id || '')
    const hint = fid ? byId[fid] : null
    let cropName = defaultCrop
    let cropConf = 0.15
    if (hint && typeof hint === 'object') {
      cropName = String(hint.cropType || hint.Crop_Type || hint.class || cropName)
      const c = Number(hint.confidence ?? hint.Crop_Confidence ?? cropConf)
      cropConf = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.15
    } else if (typeof hint === 'string' && hint.trim()) {
      cropName = hint.trim()
      cropConf = 0.55
    } else if (majName) {
      cropName = majName
      cropConf = majConf != null && Number.isFinite(majConf) ? majConf : 0.45
    }
    props.Crop_Type = cropName
    props.Crop_Confidence = Math.round(cropConf * 10000) / 10000
    props.cropType = cropName
    props.crop_type = cropName
    props.cropConfidence = props.Crop_Confidence
    props.crop_confidence = props.Crop_Confidence
    if (dateNote) {
      props.Temporal_Dates = dateNote
      props.temporalDates = dateNote
    }
    return { ...f, properties: props }
  })

  return { type: 'FeatureCollection', features }
}

/**
 * @param {import('express').Express} app
 */
export function registerTemporalTransformerRoutes(app, { jsonBodyLimit = '16mb' } = {}) {
  const ENDPOINT = String(
    process.env.TEMPORAL_TRANSFORMER_URL || 'http://127.0.0.1:8097/classify',
  ).trim()
  const TOKEN = String(process.env.TEMPORAL_TRANSFORMER_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/classify\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateBody(body) {
    if (!body || typeof body !== 'object') return 'Expected JSON { geojson, dates? }.'
    if (!body.geojson || body.geojson.type !== 'FeatureCollection') {
      return 'geojson FeatureCollection is required.'
    }
    return null
  }

  async function forwardJson(url, { method = 'GET', body, timeoutMs = 60_000 } = {}) {
    const headers = authHeaders(body != null ? { 'Content-Type': 'application/json' } : {})
    const upstream = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await upstream.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      return {
        status: 502,
        json: { error: 'Temporal transformer returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      return {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        json: {
          error: json?.error || `Temporal transformer error (HTTP ${upstream.status}).`,
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/temporal-transformer/config', (_req, res) => {
    res.json({ configured: Boolean(ENDPOINT), endpoint: Boolean(ENDPOINT) })
  })

  app.post(
    '/api/temporal-transformer/classify',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      const err = validateBody(req.body)
      if (err) return res.status(400).json({ error: err })

      // Prefer Python service; fall back to local merge so publish never hard-fails.
      if (ENDPOINT) {
        try {
          const { status, json } = await forwardJson(ENDPOINT, {
            method: 'POST',
            body: req.body,
            timeoutMs: 3 * 60 * 1000,
          })
          if (status === 200) return res.status(200).json(json)
        } catch (error) {
          // fall through to local merge
          console.warn('[temporal-transformer] upstream offline, using local merge:', error?.message || error)
        }
      }

      const merged = mergeCropTypeProps(req.body.geojson, req.body)
      return res.status(200).json({
        geojson: merged,
        count: merged.features.length,
        engine: 'temporal-transformer',
        backend: 'local-merge',
        dates: Array.isArray(req.body.dates) ? req.body.dates : [],
        offlineFallback: true,
      })
    },
  )

  app.get('/api/temporal-transformer/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8_000) })
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json(json)
    } catch (error) {
      // Local merge still works — report degraded not hard offline for classify UX.
      return res.status(200).json({
        status: 'degraded',
        engine: 'temporal-transformer',
        backend: 'local-merge',
        detail: String(error?.message || error),
      })
    }
  })
}
