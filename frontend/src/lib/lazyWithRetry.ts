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
        // Reload to pull the fresh index.html + current chunk hashes.
        window.location.reload()
        // Return a never-resolving promise so React keeps showing the Suspense fallback
        // (instead of flashing an error) until the reload takes over.
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}

export { isDynamicImportError }
