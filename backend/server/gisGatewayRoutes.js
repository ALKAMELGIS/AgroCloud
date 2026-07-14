/**
 * GIS Data Manager — database gateway stubs.
 * Validates connection profiles only; never opens remote DB sockets.
 * Do not log passwords or full credentials.
 */

function readDbProfile(body) {
  const raw = body && typeof body === 'object' ? body : {}
  return {
    kind: String(raw.kind ?? '').trim(),
    host: String(raw.host ?? '').trim(),
    port: raw.port,
    database: String(raw.database ?? '').trim(),
    username: String(raw.username ?? '').trim(),
    ssl: Boolean(raw.ssl),
  }
}

/** @returns {string|null} error message when invalid */
function validateDbProfile(profile) {
  if (!profile.host && !profile.database) {
    return 'Host and database are required.'
  }
  if (!profile.host) {
    return 'Host is required.'
  }
  if (!profile.database) {
    return 'Database is required.'
  }
  if (profile.port != null && profile.port !== '' && !Number.isFinite(Number(profile.port))) {
    return 'Port must be a number.'
  }
  return null
}

export function registerGisGatewayRoutes(app) {
  app.get('/api/gis-gateway/health', (_req, res) => {
    res.json({ ok: true, service: 'gis-gateway' })
  })

  app.post('/api/gis-gateway/db/test', (req, res) => {
    const profile = readDbProfile(req.body)
    const err = validateDbProfile(profile)
    if (err) {
      return res.status(400).json({ ok: false, message: err })
    }
    return res.json({
      ok: true,
      message: 'Gateway reachable. Live PostGIS connector not configured — profile validated.',
    })
  })

  app.post('/api/gis-gateway/db/tables', (req, res) => {
    const profile = readDbProfile(req.body)
    const err = validateDbProfile(profile)
    if (err) {
      return res.status(400).json({ ok: false, message: err, tables: [] })
    }
    return res.json({
      tables: [],
      message: 'Configure GIS_GATEWAY_DSN to list spatial tables.',
    })
  })
}
