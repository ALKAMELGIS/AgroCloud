/**
 * Enterprise security headers, HTTPS enforcement, and static asset caching.
 * No third-party middleware — keeps the Hostinger deploy footprint small.
 */

const ONE_YEAR = 31536000

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

function resolveTrustedConnectHosts() {
  const extra = String(process.env.CSP_CONNECT_SRC_EXTRA || '')
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
  return extra
}

/**
 * Content-Security-Policy tuned for AgroCloud GIS:
 * - App scripts/styles/fonts are self-hosted (no CDN libraries).
 * - Map tiles, ArcGIS, Sentinel, weather APIs use HTTPS connect/img (no mixed content).
 * - Inline scripts in index.html require 'unsafe-inline' (hash nonces can replace later).
 */
export function buildContentSecurityPolicy() {
  const connectExtra = resolveTrustedConnectHosts()
  const connectSrc = ["'self'", 'https:', 'wss:', ...connectExtra].join(' ')

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-src 'self' https://accounts.google.com https://www.dropbox.com https://onedrive.live.com",
    'upgrade-insecure-requests',
  ]

  const reportUri = String(process.env.CSP_REPORT_URI || '').trim()
  if (reportUri) directives.push(`report-uri ${reportUri}`)

  return directives.join('; ')
}

/** Force HTTPS when behind a reverse proxy (Hostinger / LiteSpeed). */
export function httpsRedirectMiddleware(req, res, next) {
  if (!isProduction()) return next()
  if (String(process.env.FORCE_HTTPS || 'true').toLowerCase() === 'false') return next()

  const forwarded = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (!forwarded || forwarded === 'https') return next()

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  if (!host) return next()
  return res.redirect(301, `https://${host}${req.originalUrl || req.url}`)
}

/** Standard enterprise response headers on every response. */
export function securityHeadersMiddleware(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  )
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy())

  if (isProduction()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  next()
}

/** Cache-Control for static files served from frontend/dist. */
export function staticCacheControl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  if (normalized.endsWith('/index.html') || normalized.endsWith('index.html')) {
    return 'no-cache, no-store, must-revalidate'
  }
  if (normalized.includes('/assets/')) {
    return `public, max-age=${ONE_YEAR}, immutable`
  }
  if (/\.(png|jpe?g|webp|svg|ico|woff2?|ttf|eot)$/i.test(normalized)) {
    return `public, max-age=${ONE_YEAR}, immutable`
  }
  if (/\.(js|css|mjs|wasm)$/i.test(normalized)) {
    return `public, max-age=${ONE_YEAR}, immutable`
  }
  if (/\.(json|webmanifest|txt|xml)$/i.test(normalized)) {
    return 'public, max-age=86400'
  }
  return 'public, max-age=3600'
}

export function applyStaticCacheHeaders(res, filePath) {
  res.setHeader('Cache-Control', staticCacheControl(filePath))
}
