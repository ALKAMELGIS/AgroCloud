/**
 * Server-side proxy for Sentinel Hub / CDSE Statistical API (keeps OAuth client secret off the browser).
 * @see https://docs.sentinel-hub.com/api/latest/api/statistical/
 * @see https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical/Examples.html
 */

import { readApiSecretsFile } from './apiSecretsPersistence.js'
import {
  isWmsStatisticsFallbackReady,
  postSentinelStatisticsViaWms,
} from './sentinelHubWmsStatisticsEngine.js'

const SENTINEL_HUB_OAUTH_URL = 'https://services.sentinel-hub.com/oauth/token'
const SENTINEL_HUB_STATISTICS_URL = 'https://services.sentinel-hub.com/api/v1/statistics'
const CDSE_OAUTH_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const CDSE_STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'
const SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN = 'PUBLIC_DATA_FEATURED_COLLECTIONS'

/** @type {Map<string, { token: string; expiresAt: number }>} */
const oauthCache = new Map()

function pickEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

function readBuiltinSecret(secretsFilePath, key) {
  const { secrets } = readApiSecretsFile(secretsFilePath)
  return String(secrets?.builtin?.[key] || '').trim()
}

function pickCdseClientCredentials() {
  return {
    clientId: pickEnv('CDSE_CLIENT_ID', 'VITE_CDSE_CLIENT_ID', 'COPERNICUS_CLIENT_ID'),
    clientSecret: pickEnv('CDSE_CLIENT_SECRET', 'VITE_CDSE_CLIENT_SECRET', 'COPERNICUS_CLIENT_SECRET'),
  }
}

function pickSentinelHubClientCredentials() {
  return {
    clientId: pickEnv('SENTINEL_HUB_CLIENT_ID', 'VITE_SENTINEL_HUB_CLIENT_ID'),
    clientSecret: pickEnv('SENTINEL_HUB_CLIENT_SECRET', 'VITE_SENTINEL_HUB_CLIENT_SECRET'),
  }
}

function pickAccessToken(secretsFilePath) {
  const fromFile = readBuiltinSecret(secretsFilePath, 'sentinelHubAccessToken')
  return pickEnv('SENTINEL_HUB_ACCESS_TOKEN', 'VITE_SENTINEL_HUB_ACCESS_TOKEN') || fromFile
}

function pickWmsInstanceId(secretsFilePath) {
  const fromFile = readBuiltinSecret(secretsFilePath, 'sentinelHubWmsInstanceId')
  return pickEnv('SENTINEL_HUB_WMS_INSTANCE_ID', 'VITE_SENTINEL_HUB_WMS_INSTANCE_ID') || fromFile
}

function pickWmsConfig(secretsFilePath) {
  return {
    accessToken: pickAccessToken(secretsFilePath) || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN,
    instanceId: pickWmsInstanceId(secretsFilePath),
  }
}

function hasOAuthOrPrivateToken(secretsFilePath) {
  const cdse = pickCdseClientCredentials()
  if (cdse.clientId && cdse.clientSecret) return true
  const sh = pickSentinelHubClientCredentials()
  if (sh.clientId && sh.clientSecret) return true
  return isPrivateAccessToken(pickAccessToken(secretsFilePath))
}

function isLikelyJwt(token) {
  return token.split('.').length >= 3
}

function isPrivateAccessToken(token) {
  if (!token || token === SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN) return false
  if (isLikelyJwt(token)) return true
  return token.length > 20
}

function isPublicWmsToken(token) {
  return token === SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN
}

export function isSentinelHubStatisticsProxyConfigured(secretsFilePath) {
  if (hasOAuthOrPrivateToken(secretsFilePath)) return true
  const wms = pickWmsConfig(secretsFilePath)
  return isWmsStatisticsFallbackReady(wms.accessToken, wms.instanceId)
}

export function describeSentinelHubStatisticsConfig(secretsFilePath) {
  const wms = pickWmsConfig(secretsFilePath)
  const oauthConfigured = hasOAuthOrPrivateToken(secretsFilePath)
  const wmsReady = isWmsStatisticsFallbackReady(wms.accessToken, wms.instanceId)
  const statsConfigured = oauthConfigured || wmsReady
  const publicWmsOnly = isPublicWmsToken(wms.accessToken) && !oauthConfigured && wmsReady

  let mode = 'none'
  if (oauthConfigured) mode = 'statistical-api'
  else if (wmsReady) mode = 'wms-zonal'

  let hint
  if (!statsConfigured) {
    hint =
      'Configure Sentinel Hub WMS (SENTINEL_HUB_ACCESS_TOKEN + SENTINEL_HUB_WMS_INSTANCE_ID) or add CDSE_CLIENT_ID/SECRET for Statistical API.'
  } else if (publicWmsOnly) {
    hint =
      'AOI statistics use Layer Live WMS credentials (PUBLIC_DATA_FEATURED_COLLECTIONS). Add CDSE_CLIENT_ID/SECRET for faster Statistical API if needed.'
  }

  return {
    configured: statsConfigured,
    mode,
    wmsReady,
    publicWmsOnly,
    oauthConfigured,
    hint,
  }
}

async function fetchOAuthToken(cacheKey, tokenUrl, clientId, clientSecret) {
  const now = Date.now()
  const cached = oauthCache.get(cacheKey)
  if (cached && cached.expiresAt > now + 60_000) return cached.token

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OAuth failed (${res.status}): ${text.slice(0, 180)}`)
  }
  const json = await res.json()
  const token = String(json.access_token ?? '').trim()
  if (!token) throw new Error('OAuth returned no access_token')
  oauthCache.set(cacheKey, {
    token,
    expiresAt: now + Math.max(300, Number(json.expires_in) || 3600) * 1000,
  })
  return token
}

async function resolveAuth(secretsFilePath) {
  const cdse = pickCdseClientCredentials()
  if (cdse.clientId && cdse.clientSecret) {
    const token = await fetchOAuthToken('cdse', CDSE_OAUTH_URL, cdse.clientId, cdse.clientSecret)
    return { token, statisticsUrl: CDSE_STATISTICS_URL }
  }

  const sh = pickSentinelHubClientCredentials()
  if (sh.clientId && sh.clientSecret) {
    const token = await fetchOAuthToken('sh', SENTINEL_HUB_OAUTH_URL, sh.clientId, sh.clientSecret)
    return { token, statisticsUrl: SENTINEL_HUB_STATISTICS_URL }
  }

  const accessToken = pickAccessToken(secretsFilePath)
  if (isPrivateAccessToken(accessToken)) {
    return { token: accessToken, statisticsUrl: SENTINEL_HUB_STATISTICS_URL }
  }

  return null
}

/**
 * Resolve an OAuth bearer + Process API URL for raw imagery requests (AOI fetch).
 * Returns null when only a public WMS token is available (Process API needs OAuth).
 * @param {string} secretsFilePath
 * @returns {Promise<{ token: string; processUrl: string } | null>}
 */
export async function resolveSentinelHubProcessAuth(secretsFilePath) {
  const auth = await resolveAuth(secretsFilePath)
  if (!auth) return null
  return { token: auth.token, processUrl: auth.statisticsUrl.replace('/statistics', '/process') }
}

/**
 * WMS config (access token + instance id) for AOI imagery via OGC WMS — no OAuth required.
 * @param {string} secretsFilePath
 * @returns {{ accessToken: string; instanceId: string }}
 */
export function resolveSentinelHubWmsConfig(secretsFilePath) {
  return pickWmsConfig(secretsFilePath)
}

/**
 * @param {string} secretsFilePath
 * @param {Record<string, unknown>} body
 */
export async function postSentinelStatistics(secretsFilePath, body) {
  const auth = await resolveAuth(secretsFilePath)
  if (auth) {
    const res = await fetch(auth.statisticsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 240) || `Sentinel Hub Statistics HTTP ${res.status}`)
    }

    if (!res.ok) {
      const message =
        typeof json?.error?.message === 'string'
          ? json.error.message
          : text.slice(0, 240) || `Sentinel Hub Statistics HTTP ${res.status}`
      const err = new Error(message)
      err.status = res.status
      err.payload = json
      throw err
    }

    return json
  }

  const wms = pickWmsConfig(secretsFilePath)
  if (isWmsStatisticsFallbackReady(wms.accessToken, wms.instanceId)) {
    return postSentinelStatisticsViaWms(wms, body)
  }

  const err = new Error(describeSentinelHubStatisticsConfig(secretsFilePath).hint)
  err.status = 503
  throw err
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath: string }} options
 */
export function registerSentinelHubStatisticsRoutes(app, { secretsFilePath }) {
  app.get('/api/sentinel-hub/statistics/status', (_req, res) => {
    res.json(describeSentinelHubStatisticsConfig(secretsFilePath))
  })

  app.post('/api/sentinel-hub/statistics', async (req, res) => {
    const status = describeSentinelHubStatisticsConfig(secretsFilePath)
    if (!status.configured) {
      return res.status(503).json({
        error: status.hint || 'Sentinel Hub Statistical API is not configured on the server.',
        publicWmsOnly: status.publicWmsOnly,
        wmsReady: status.wmsReady,
        mode: status.mode,
      })
    }

    try {
      const json = await postSentinelStatistics(secretsFilePath, req.body ?? {})
      return res.json(json)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sentinel Hub Statistics proxy failed'
      const code = typeof e?.status === 'number' ? e.status : 502
      return res.status(code >= 400 && code < 600 ? code : 502).json({ error: message })
    }
  })
}
