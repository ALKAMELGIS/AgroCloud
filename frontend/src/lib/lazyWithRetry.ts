import { lazy, type ComponentType } from 'react'

/**
 * Stale-deploy recovery for code-split routes.
 *
 * After a new deployment the hashed chunk file names change. A browser that still holds a cached
 * `index.html` (or a precached PWA shell) keeps requesting the OLD chunk names, which no longer
 * exist on the server. The dynamic `import()` then rejects with messages like
 * "Failed to fetch dynamically imported module" or "error loading dynamically imported module".
 *
 * When that happens we reload the page exactly once (guarded by sessionStorage) so the browser
 * fetches the fresh `index.html` with the current chunk names. The guard prevents an infinite
 * reload loop when the failure is a genuine network/offline error rather than a stale deploy.
 */

const RELOAD_GUARD_PREFIX = 'agro_chunk_reload:'

/** Query param appended to bust the CDN/browser cache of `index.html` on recovery. */
const CACHE_BUST_PARAM = '_cb'

/**
 * Unregister every service worker and delete all Cache Storage entries.
 *
 * On the PWA build the Workbox service worker serves the precached `index.html` for navigations
 * (`navigateFallback`). After a deploy that precached document is STALE — it still references the
 * previous build's hashed chunk names, which no longer exist on the server. A plain reload (even
 * with a `?_cb=` cache-buster) is intercepted by the service worker and re-served from the same
 * stale precache, so the dynamic-import 404 loops until the one-shot guard gives up on the error
 * screen. Purging the service worker + caches forces the next navigation to fetch the fresh
 * `index.html` (and current chunk hashes) straight from the network.
 */
export async function purgeServiceWorkerAndCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  const jobs: Promise<unknown>[] = []
  try {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof navigator.serviceWorker.getRegistrations === 'function'
    ) {
      jobs.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
          .catch(() => []),
      )
    }
  } catch {
    /* serviceWorker access can throw in sandboxed contexts */
  }
  try {
    if ('caches' in window && typeof caches.keys === 'function') {
      jobs.push(
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
          .catch(() => []),
      )
    }
  } catch {
    /* Cache Storage may be unavailable (private mode) */
  }
  try {
    await Promise.all(jobs)
  } catch {
    /* best-effort purge — reload proceeds regardless */
  }
}

/**
 * Reload the page in a way that bypasses the cached `index.html`.
 *
 * The live site serves `index.html` with `Cache-Control: max-age=600` behind a CDN, so a plain
 * `location.reload()` after a deploy can re-fetch the STALE document that still points at chunk
 * hashes the new build deleted (→ the same dynamic-import 404 loops forever until the one-shot guard
 * gives up on a dead-end error screen). Appending a unique query value makes the CDN/browser treat it
 * as a distinct URL, so the fresh `index.html` with the current chunk names is fetched instead.
 */
export function reloadWithCacheBust(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString(36))
    window.location.replace(url.toString())
  } catch {
    try {
      window.location.reload()
    } catch {
      /* noop */
    }
  }
}

/**
 * Recover from a stale-deploy chunk failure: purge the service worker + caches, then reload with a
 * cache-buster. This is the only reliable recovery on the PWA build, where the service worker would
 * otherwise keep serving the stale precached `index.html` (and its dead chunk references) on reload.
 */
export async function purgeAndReloadForStaleDeploy(): Promise<void> {
  await purgeServiceWorkerAndCaches()
  reloadWithCacheBust()
}

/** After a successful load, drop the recovery guard + strip the `_cb` param from the address bar. */
export function clearStaleChunkRecoveryState(guardKeys: string[] = []): void {
  if (typeof window === 'undefined') return
  for (const key of guardKeys) safeSessionRemove(key)
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has(CACHE_BUST_PARAM)) {
      url.searchParams.delete(CACHE_BUST_PARAM)
      window.history.replaceState(window.history.state, '', url.toString())
    }
  } catch {
    /* noop */
  }
}

function isDynamicImportError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Unable to preload CSS/i.test(message) ||
    /'text\/html'.*not a valid JavaScript MIME type/i.test(message) ||
    /expected a JavaScript(?:-or-Wasm)? module/i.test(message)
  )
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* storage may be unavailable (private mode / quota) */
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** Clear one-shot stale-chunk guards so Reload can recover after a fixed HMR/dev failure. */
export function clearChunkReloadGuards(): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k) keys.push(k)
    }
    for (const k of keys) {
      if (k.startsWith(RELOAD_GUARD_PREFIX) || k === 'agro_boundary_chunk_reload') {
        safeSessionRemove(k)
      }
    }
  } catch {
    /* noop */
  }
}

/**
 * Drop-in replacement for `React.lazy` that recovers from stale-deploy chunk load failures.
 *
 * @param factory  the dynamic import factory (e.g. `() => import('../pages/Foo')`)
 * @param chunkKey a stable identifier used for the one-shot reload guard
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkKey: string,
) {
  const guardKey = `${RELOAD_GUARD_PREFIX}${chunkKey}`

  return lazy(async () => {
    const load = async () => {
      const mod = await factory()
      safeSessionRemove(guardKey)
      return mod
    }

    try {
      return await load()
    } catch (firstError) {
      if (!isDynamicImportError(firstError)) throw firstError

      // Vite HMR often invalidates module URLs while editing — retry once before treating as stale deploy.
      let lastError: unknown = firstError
      try {
        await new Promise<void>(resolve => {
          setTimeout(resolve, import.meta.env.DEV ? 200 : 50)
        })
        return await load()
      } catch (retryError) {
        lastError = retryError
      }

      // In DEV, allow another recovery cycle (guards trap users after mid-edit import failures).
      if (import.meta.env.DEV) {
        clearChunkReloadGuards()
      }

      if (isDynamicImportError(lastError) && !safeSessionGet(guardKey)) {
        safeSessionSet(guardKey, '1')
        void purgeAndReloadForStaleDeploy()
        return new Promise<{ default: T }>(() => {})
      }
      throw lastError
    }
  })
}

export { isDynamicImportError }
