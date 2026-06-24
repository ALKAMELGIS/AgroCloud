/**
 * Realtime Alert Dashboard — REST API + config persistence.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(SERVER_DIR, '..', 'data', 'realtime-alert')

function readJson(fileName, fallback) {
  try {
    const p = path.join(DATA_DIR, fileName)
    if (!fs.existsSync(p)) return fallback
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(fileName, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(path.join(DATA_DIR, fileName), JSON.stringify(data, null, 2))
}

const layerSyncState = new Map()

function buildKpiPayload() {
  const zones = readJson('zones.geojson', { features: [] })
  const trace = readJson('traceability.json', { rows: [] })
  const zoneCount = zones?.features?.length ?? 0
  const critical = (zones?.features ?? []).filter(f => f?.properties?.risk === 'critical').length
  const active = (zones?.features ?? []).filter(f => ['active', 'warning', 'critical'].includes(f?.properties?.risk)).length
  return {
    fieldCount: zoneCount * 4,
    alertCount: active,
    criticalCount: critical,
    weatherRisk: 'moderate',
    coveragePct: null,
    updatedAt: new Date().toISOString(),
  }
}

function buildTodayAlerts() {
  return {
    issues: [
      { id: 'iss-1', zone: 'B', severity: 'high', title: 'Water stress detected', fieldName: 'Plot-07' },
      { id: 'iss-2', zone: 'A', severity: 'medium', title: 'NDVI decline vs previous scene', fieldName: 'Pivot-12' },
      { id: 'iss-3', zone: 'C', severity: 'low', title: 'Monitor — stable CHAS', fieldName: 'Greenhouse-03' },
    ],
    updatedAt: new Date().toISOString(),
  }
}

function buildRecommendations() {
  return {
    items: [
      { id: 'rec-1', priority: 'high', text: 'Increase irrigation in Zone B within 24h' },
      { id: 'rec-2', priority: 'medium', text: 'Schedule scouting for pest traps in Zone A' },
      { id: 'rec-3', priority: 'low', text: 'Continue routine monitoring in Zone C' },
    ],
  }
}

function buildTimeseries(metric) {
  const days = 14
  const base = metric === 'disease_etl' ? 0.35 : 0.42
  const series = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    series.push({
      date: d.toISOString().slice(0, 10),
      value: Number((base + (Math.random() - 0.5) * 0.08).toFixed(3)),
    })
  }
  return {
    metric,
    etl: 0.55,
    eil: 0.75,
    series,
  }
}

export function registerRealtimeAlertRoutes(app, { broadcast } = {}) {
  app.get('/api/v1/realtime-alert/context', (_req, res) => {
    res.json(readJson('context.json', { farms: [], crops: [], locations: [], defaults: {} }))
  })

  app.get('/api/v1/realtime-alert/kpis', (_req, res) => {
    res.json(buildKpiPayload())
  })

  app.get('/api/v1/realtime-alert/zones/geojson', (_req, res) => {
    res.json(readJson('zones.geojson', { type: 'FeatureCollection', features: [] }))
  })

  app.get('/api/v1/realtime-alert/alerts/today', (_req, res) => {
    res.json(buildTodayAlerts())
  })

  app.get('/api/v1/realtime-alert/recommendations', (_req, res) => {
    res.json(buildRecommendations())
  })

  app.get('/api/v1/realtime-alert/timeseries', (req, res) => {
    const metric = String(req.query.metric || 'pest_etl')
    res.json(buildTimeseries(metric))
  })

  app.get('/api/v1/realtime-alert/traceability', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const data = readJson('traceability.json', { rows: [] })
    const rows = data.rows ?? []
    const start = (page - 1) * pageSize
    res.json({
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    })
  })

  app.post('/api/v1/realtime-alert/layers/:id/sync', (req, res) => {
    const id = String(req.params.id || '').trim()
    const revision = Date.now()
    layerSyncState.set(id, { revision, syncedAt: new Date().toISOString() })
    if (typeof broadcast === 'function') {
      broadcast({
        topic: 'realtime-alert/layers',
        payload: { layerId: id, revision, status: 'synced' },
      })
    }
    res.json({ ok: true, layerId: id, revision, syncedAt: layerSyncState.get(id).syncedAt })
  })

  app.get('/api/v1/realtime-alert/config', (_req, res) => {
    res.json(readJson('config.json', {}))
  })

  app.put('/api/v1/realtime-alert/config', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    writeJson('config.json', body)
    res.json({ ok: true, config: body })
  })

  // Push KPI/alerts periodically when broadcast available
  if (typeof broadcast === 'function') {
    setInterval(() => {
      broadcast({ topic: 'realtime-alert/kpis', payload: buildKpiPayload() })
      broadcast({ topic: 'realtime-alert/alerts', payload: buildTodayAlerts() })
    }, 30_000)
  }
}
