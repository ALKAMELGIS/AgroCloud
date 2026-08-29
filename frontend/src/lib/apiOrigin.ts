/**
 * Shared backend API origin resolver.
 *
 * The frontend talks to the Node/Express backend through `/api/*` routes. Those routes only exist
 * when an actual server is in front of the bundle:
 *   - local dev: Vite proxies `/api` → backend, so same-origin works.
 *   - full-stack hosting: the Node server serves the SPA, so same-origin works.
 *   - static hosting (GitHub Pages, Hostinger static, custom domains): there is **no** local `/api`,
 *     so requests must be sent to a separately deployed backend via `VITE_AGRI_API_SECRETS_URL`.
 *
 * Centralising this here means every API client resolves the backend the same way and custom domains
 * (e.g. `eliteagrocloud.com`) keep working instead of POSTing to a static host that returns 405/404.
 */

/** Hostinger Node that serves `/api/*` for the GitHub Pages custom domain. */
export const ELITE_AGROCLOUD_API_ORIGIN = 'https://api.eliteagrocloud.com'

function sameOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
}

function hostname(): string {
  return typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : ''
}

function isLocalLoopbackHost(host: string): boolean {
  const h = String(host || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0'
}

/** www / apex are GitHub Pages. `api.` is the Hostinger Express app. */
function isEliteAgrocloudPagesHost(host: string): boolean {
  const h = String(host || '').toLowerCase()
  return h === 'eliteagrocloud.com' || h === 'www.eliteagrocloud.com'
}

/** VPS full-stack build: SPA and `/api/*` share eliteagrocloud.com (no api. subdomain). */
function eliteAgrocloudSameOriginApi(): boolean {
  return import.meta.env.VITE_ELITE_SAME_ORIGIN_API === 'true'
}

/** Hostinger Node that serves `/api/*` for static SPAs (GitHub Pages, eliteagrocloud.com, mirrors). */
function defaultRemoteApiOriginForStaticHost(): string {
  if (typeof window === 'undefined') return ''
  const host = hostname().toLowerCase()
  if (host === 'api.eliteagrocloud.com') return ''
  if (isLocalLoopbackHost(host)) return ''
  if (isEliteAgrocloudPagesHost(host)) {
    if (eliteAgrocloudSameOriginApi()) return ''
    return ELITE_AGROCLOUD_API_ORIGIN
  }
  if (isKnownStaticHostname(host)) return ELITE_AGROCLOUD_API_ORIGIN
  return ''
}

function originFromEnvUrl(raw: string): string {
  try {
    return new URL(raw, sameOrigin() || 'http://localhost').origin
  } catch {
    return ''
  }
}

/** Trimmed value of the configured backend origin override, or '' when unset. */
export function configuredApiOrigin(): string {
  // Local full-stack / Vite dev always use same-origin `/api` (proxy or co-located Node).
  if (typeof window !== 'undefined' && isLocalLoopbackHost(hostname())) return ''

  const raw = import.meta.env.VITE_AGRI_API_SECRETS_URL
  const configured = typeof raw === 'string' ? raw.trim() : ''
  if (configured) {
    const origin = originFromEnvUrl(configured)
    if (origin) {
      /**
       * GitHub Pages sometimes sets VITE_AGRI_API_SECRETS_URL to the same static origin.
       * That is not a Node backend — fall through to the Hostinger API host.
       */
      const onPages = typeof window !== 'undefined' && origin === sameOrigin() && isKnownStaticHostname(hostname())
      if (!onPages) {
        if (typeof window !== 'undefined' && origin === sameOrigin()) return ''
        return origin
      }
    }
  }
  const remoteFallback = defaultRemoteApiOriginForStaticHost()
  if (remoteFallback) return remoteFallback
  return ''
}

/** Synthetic guard / deployment errors that mean "no same-origin backend — use remote API or degrade". */
export function isBackendUnavailablePayload(raw: string | null | undefined): boolean {
  return /backend_unavailable|backend is not available|configure VITE_AGRI_API_SECRETS_URL/i.test(
    String(raw || ''),
  )
}

function isKnownStaticHostname(host: string): boolean {
  return (
    /\.github\.io$/i.test(host) ||
    /\.pages\.dev$/i.test(host) ||
    /\.netlify\.app$/i.test(host) ||
    isEliteAgrocloudPagesHost(host)
  )
}

/**
 * Origin that serves the backend `/api/*` routes.
 * Prefers the configured backend override, otherwise same-origin (dev proxy / full-stack host).
 */
export function resolveApiOrigin(): string {
  return configuredApiOrigin() || sameOrigin()
}

/** Absolute URL for a backend API path (leading slash optional). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${resolveApiOrigin()}${normalized}`
}

/**
 * True when the app is served from a static host that has no co-located backend
 * (no Vite dev proxy, no full-stack Node server) and no *external* backend override.
 * In that case relative `/api/*` calls would hit the static host and fail (404/405),
 * so callers should skip the request and surface a clear "configure backend" message.
 */
export function isStaticDeploymentWithoutBackend(): boolean {
  if (import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  if (!isKnownStaticHostname(window.location.hostname)) {
    // Unknown host with an external backend override → not a static-only deploy.
    return false
  }
  // Known static host: only "has backend" when override points at a different origin.
  return !configuredApiOrigin()
}

/**
 * HTTP statuses that indicate the backend route isn't reachable:
 *   - 404/405/501: a static host swallowed the `/api/*` route.
 *   - 503: the synthetic "backend unavailable" response produced by the global fetch guard
 *     (see `apiFetchGuard.ts`) when the circuit-breaker is open. Treating it the same way means
 *     clients that only inspect the status still latch the breaker and degrade gracefully.
 */
export function isBackendUnreachableStatus(status: number): boolean {
  return status === 404 || status === 405 || status === 501 || status === 503
}

/**
 * Runtime circuit-breaker for the same-origin backend.
 *
 * Some static deployments live on custom domains (e.g. `eliteagrocloud.com`,
 * `vrm.my.site.com`) that can't be detected by hostname, so {@link isStaticDeploymentWithoutBackend}
 * returns `false` for them. The first relative `/api/*` request still fails with a
 * backend-unreachable status (404/405/501). We latch that outcome here so every other
 * API client stops firing doomed requests for the rest of the session — turning a flood
 * of console errors into a single probe.
 *
 * The breaker only applies to the *same-origin* backend. When a backend override
 * (`VITE_AGRI_API_SECRETS_URL`) is configured, requests target a real API and the
 * breaker stays closed.
 */
const BREAKER_STORAGE_KEY = 'agrocloud.sameOriginBackendUnreachable'

/**
 * Read the latched breaker state from `sessionStorage`. Persisting per-session means a
 * returning page load skips the doomed `/api/*` probe entirely (no console flood on reload),
 * while a fresh session still re-probes in case the backend was deployed since.
 */
function readPersistedBreaker(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage?.getItem(BREAKER_STORAGE_KEY) === '1' ? false : null
  } catch {
    return null
  }
}

let sameOriginBackendReachable: boolean | null = readPersistedBreaker()

/** Drop a stale same-origin breaker when a remote API host is configured (Pages / preview). */
function clearStaleSameOriginBreakerWhenRemoteApiConfigured(): void {
  if (import.meta.env.DEV || typeof window === 'undefined') return
  if (!configuredApiOrigin()) return
  sameOriginBackendReachable = null
  try {
    window.sessionStorage?.removeItem(BREAKER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

clearStaleSameOriginBreakerWhenRemoteApiConfigured()

function persistBreakerTripped(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage?.setItem(BREAKER_STORAGE_KEY, '1')
  } catch {
    /* storage unavailable (private mode / quota) — in-memory latch still applies */
  }
}

/**
 * Record that a same-origin `/api/*` route returned a backend-unreachable status.
 * No-op when a backend override is configured (those requests hit a real API).
 */
export function markBackendUnreachable(): void {
  if (configuredApiOrigin()) return
  sameOriginBackendReachable = false
  persistBreakerTripped()
}

/** Record a successful same-origin backend response (closes the breaker). */
export function markBackendReachable(): void {
  if (configuredApiOrigin()) return
  sameOriginBackendReachable = true
}

/** Reset the same-origin circuit breaker (local dev recovery after backend restart). */
export function clearSameOriginBackendBreaker(): void {
  sameOriginBackendReachable = null
  backendProbe = null
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage?.removeItem(BREAKER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * True when the backend `/api/*` routes are known to be unavailable for this session:
 * either a recognised static host, or a previously tripped circuit-breaker. Callers
 * should skip the request entirely and degrade gracefully.
 */
export function isBackendKnownUnavailable(): boolean {
  if (import.meta.env.DEV) return false
  if (configuredApiOrigin()) return false
  if (isStaticDeploymentWithoutBackend()) return true
  return sameOriginBackendReachable === false
}

/**
 * Inspect a fetch Response and trip the circuit-breaker if it indicates the same-origin
 * backend isn't reachable. Returns `true` when the breaker tripped (backend unreachable),
 * so callers can branch into their graceful-degradation path.
 */
export function noteApiResponse(status: number): boolean {
  if (isBackendUnreachableStatus(status)) {
    markBackendUnreachable()
    return true
  }
  markBackendReachable()
  return false
}

/**
 * Shared, serialized liveness probe.
 *
 * The reactive breaker ({@link noteApiResponse}) only trips *after* a request has already
 * failed. On a page load that fires many `/api/*` calls at once (terrain tiles, weather,
 * statistics, crop/flood config…), each one races ahead before the first failure latches the
 * breaker — producing the console flood of 404/405s.
 *
 * `ensureBackendAvailable()` collapses that race into a single `GET /api/health` request.
 * Every caller awaits the same in-flight promise, so the breaker is decided *once* before the
 * rest of the requests go out. Returns `true` when the backend is reachable (caller should
 * proceed), `false` when it isn't (caller should degrade gracefully and skip the request).
 */
let backendProbe: Promise<boolean> | null = null

/**
 * Confirm a `/api/health` response actually came from the JSON backend.
 *
 * Custom-domain static hosts (e.g. `eliteagrocloud.com`) answer unknown routes — including
 * `/api/health` — with the SPA's `index.html` and a **200 OK**. A status-only check is fooled
 * by that fallback and leaves the breaker closed, so every other client then fires doomed
 * `/api/*` requests (the 404/405 console flood). The real backend returns a small JSON payload
 * (`{ status: 'ok' }`), so we require the body to parse as JSON; an HTML fallback never will.
 */
async function isLiveBackendHealthResponse(res: Response): Promise<boolean> {
  const contentType = res.headers.get('content-type') ?? ''
  // SPA fallbacks are served as text/html — reject before touching the body.
  if (contentType && !/\bjson\b/i.test(contentType)) return false
  try {
    const body = await res.json()
    return Boolean(body) && typeof body === 'object'
  } catch {
    // Body wasn't JSON (HTML fallback or empty) — not a real backend.
    return false
  }
}

export function ensureBackendAvailable(): Promise<boolean> {
  // Dev proxy and configured overrides always target a real API — no probe needed.
  if (import.meta.env.DEV) return Promise.resolve(true)
  if (configuredApiOrigin()) return Promise.resolve(true)
  // Already decided this session (recognised static host or a previously tripped breaker).
  if (isBackendKnownUnavailable()) return Promise.resolve(false)
  if (sameOriginBackendReachable === true) return Promise.resolve(true)
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return Promise.resolve(true)

  if (!backendProbe) {
    backendProbe = (async () => {
      try {
        const res = await fetch(apiUrl('/api/health'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        })
        // A backend-unreachable status (static host swallowed the route) trips the breaker.
        if (isBackendUnreachableStatus(res.status)) {
          markBackendUnreachable()
          return false
        }
        // Guard against static hosts that answer with index.html + 200 (SPA fallback):
        // only a real JSON health payload counts as a reachable backend.
        if (!(await isLiveBackendHealthResponse(res))) {
          markBackendUnreachable()
          return false
        }
        markBackendReachable()
        return true
      } catch {
        // Network error / abort — treat the backend as unavailable for this session so callers
        // degrade gracefully instead of each retrying their own doomed request.
        markBackendUnreachable()
        return false
      }
    })()
  }
  return backendProbe
}
