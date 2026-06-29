/**
 * Global `/api/*` fetch guard.
 *
 * Individual API clients already consult the circuit-breaker in `apiOrigin.ts`, but that only
 * helps the clients that were refactored to call it. On a static deployment without a backend,
 * everything else — third-party libraries, generated chunks, ad-hoc `fetch('/api/...')` calls,
 * and Mapbox GL's tile loader — still fires doomed same-origin `/api/*` requests, flooding the
 * console with 404/405 errors.
 *
 * Installing a single `window.fetch` wrapper applies the breaker uniformly: once the backend is
 * known unavailable, every internal `/api/*` request short-circuits to a synthetic `503` instead
 * of hitting the network. The first request triggers the shared `/api/health` probe; the rest of
 * the session is decided from the latched breaker with no further network traffic.
 *
 * Notes / limitations:
 *   - Only *same-origin* `/api/*` requests are intercepted. When a backend override
 *     (`VITE_AGRI_API_SECRETS_URL`) is configured the breaker stays closed, so those requests
 *     pass straight through to the real API.
 *   - `/api/health` is always passed through to the original `fetch` so the liveness probe in
 *     `ensureBackendAvailable()` can run without recursing back into this guard.
 *   - Mapbox GL fetches tiles from a Web Worker, which has its *own* `fetch` and is not affected
 *     by this wrapper. Terrain sources must additionally be gated on `ensureBackendAvailable()`
 *     before being added to the map (see `agroCloudMapTerrain.ts`).
 */

import {
  configuredApiOrigin,
  ensureBackendAvailable,
  isBackendKnownUnavailable,
  noteApiResponse,
} from './apiOrigin'

const GUARD_FLAG = '__agrocloudApiFetchGuardInstalled'

/** Extract a URL string from any of fetch's accepted input shapes. */
function inputToUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** Resolve a fetch input to an absolute URL, or `null` when it can't be parsed. */
function resolveAbsoluteUrl(input: RequestInfo | URL): URL | null {
  try {
    return new URL(inputToUrl(input), window.location.href)
  } catch {
    return null
  }
}

/** True for a same-origin `/api/*` request that the breaker should govern. */
function isGuardedApiRequest(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname.startsWith('/api/')
}

/** Build the synthetic response returned when the backend is unavailable. */
function backendUnavailableResponse(pathname: string): Response {
  return new Response(
    JSON.stringify({
      error: 'backend_unavailable',
      message:
        'The backend API is not available for this deployment. Configure VITE_AGRI_API_SECRETS_URL to point at a running backend.',
      path: pathname,
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

/**
 * Install the global `/api/*` fetch guard. Idempotent and a no-op outside the browser, in dev
 * (Vite proxies `/api`), or when a backend override is configured (requests hit a real API).
 */
export function installApiFetchGuard(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  if (import.meta.env.DEV) return
  if (configuredApiOrigin()) return
  if ((window as unknown as Record<string, unknown>)[GUARD_FLAG]) return
  ;(window as unknown as Record<string, unknown>)[GUARD_FLAG] = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async function guardedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = resolveAbsoluteUrl(input)

    // Not a guarded internal API call (cross-origin, non-/api, or unparseable) — pass through.
    if (!url || !isGuardedApiRequest(url)) {
      return originalFetch(input, init)
    }

    // The liveness probe itself must reach the network so `ensureBackendAvailable()` can decide.
    if (url.pathname === '/api/health') {
      return originalFetch(input, init)
    }

    // Breaker already open this session — skip the doomed request entirely.
    if (isBackendKnownUnavailable()) {
      return backendUnavailableResponse(url.pathname)
    }

    // Status unknown — run (or await) the shared probe before letting the request out.
    const reachable = await ensureBackendAvailable()
    if (!reachable) {
      return backendUnavailableResponse(url.pathname)
    }

    // Backend looked healthy; let the request through but still latch the breaker reactively
    // if this specific route turns out to be unreachable.
    const response = await originalFetch(input, init)
    noteApiResponse(response.status)
    return response
  } as typeof window.fetch
}
