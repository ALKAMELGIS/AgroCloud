/**
 * In-memory sliding-window rate limiter for auth endpoints (per IP + route key).
 * Configurable via env; suitable for single-node API (use Redis for multi-node later).
 */

const buckets = new Map()

function envInt(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function authRateLimitConfig() {
  return {
    windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    loginMax: envInt('AUTH_RATE_LIMIT_LOGIN_MAX', 20),
    registerMax: envInt('AUTH_RATE_LIMIT_REGISTER_MAX', 10),
    forgotMax: envInt('AUTH_RATE_LIMIT_FORGOT_MAX', 8),
    resetMax: envInt('AUTH_RATE_LIMIT_RESET_MAX', 12),
    verifyMax: envInt('AUTH_RATE_LIMIT_VERIFY_MAX', 15),
  }
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown'
}

function prune(bucket, now, windowMs) {
  const cutoff = now - windowMs
  while (bucket.length && bucket[0] <= cutoff) bucket.shift()
}

export function createAuthRateLimiter(routeKey, maxAttempts) {
  const cfg = authRateLimitConfig()
  const windowMs = cfg.windowMs
  const max = maxAttempts

  return function authRateLimitMiddleware(req, res, next) {
    const key = `${routeKey}:${clientKey(req)}`
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }
    prune(bucket, now, windowMs)
    if (bucket.length >= max) {
      const retryAfterSec = Math.ceil((bucket[0] + windowMs - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)))
      return res.status(429).json({
        ok: false,
        error: 'Too many attempts. Please wait and try again.',
        code: 'rate_limited',
      })
    }
    bucket.push(now)
    return next()
  }
}
