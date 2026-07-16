import { lazy, type ComponentType } from 'react'

/**
 * Stale-deploy recovery for code-split routes.
 *
 * After a new deployment the hashed chunk file names change. A browser that still holds a cached
 * `index.html` (or a precached PWA shell) keeps requesting the OLD chunk names, which no longer
 * exist on the server. The dynamic `import()` then rejects with messages like
 * "Failed to fetch dynamically imported module" or "error loading dynamically imported module".
 *
 * When that happens we purge the service worker + Cache Storage, then reload once with a cache-bust
 * query so the browser fetches the fresh `index.html` with the current chunk names. The session
 * guard prevents an infinite reload loop when the failure is a genuine network/offline error.
 */

const RELOAD_GUARD_PREFIX = 'agro_chunk_reload:'

/** Query param appended to bust the CDN/browser cache of `index.html` on recovery. */
const CACHE_BUST_PARAM = '_cb'

/**
 * Unregister service workers and delete Cache Storage entries.
 * Critical on GitHub Pages PWA deploys: Workbox can keep serving deleted chunk hashes.
 */
export async function purgeClientCachesAndServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined') return
  const jobs: Promise<unknown>[] = []
  try {
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))),
      )
    }
  } catch {
    /* noop */
  }
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      jobs.push(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))))
    }
  } catch {
    /* noop */
  }
  await Promise.all(jobs).catch(() => {})
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
 * Full stale-deploy recovery: drop SW/caches, then cache-bust navigate to a fresh shell.
 * Fire-and-forget — callers should not await (navigation replaces the page).
 */
export function hardRecoverFromStaleDeploy(): void {
  if (typeof window === 'undefined') return
  void purgeClientCachesAndServiceWorkers().finally(() => {
    reloadWithCacheBust()
  })
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
    /expected a JavaScript(?:-or-Wasm)? module/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
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
    try {
      const mod = await factory()
      // Success — clear the guard so a future stale deploy can trigger a fresh reload.
      safeSessionRemove(guardKey)
      return mod
    } catch (error) {
      if (isDynamicImportError(error) && !safeSessionGet(guardKey)) {
        safeSessionSet(guardKey, '1')
        // Purge PWA caches first — a cache-bust alone often reuses the SW-served old shell.
        hardRecoverFromStaleDeploy()
        // Return a never-resolving promise so React keeps showing the Suspense fallback
        // (instead of flashing an error) until the reload takes over.
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}

export { isDynamicImportError }
