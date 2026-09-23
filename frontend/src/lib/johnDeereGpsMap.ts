/** John Deere Operations Center map (post-OAuth lands on /login?code=…). */
export const JOHN_DEERE_GPS_MAP_ORIGIN = 'https://map.deere.com'

/** Default in-app entry — Operations Center map (machine / fleet tracking). */
export const JOHN_DEERE_GPS_DEFAULT_ENTRY_URL = 'https://map.deere.com/'

const PROXY_EMBED_ROOT = '/api/gps/john-deere-map/go'

const ALLOWED_GPS_EMBED_HOSTS = new Set(['map.deere.com', 'signin.johndeere.com', 'signin.deere.com'])

/** Map home (/) loads an empty SPA shell until JS runs — /login starts OAuth in the iframe immediately. */
export function johnDeereGpsInAppEntryUrl(externalUrl: string): string {
  const trimmed = String(externalUrl || '').trim() || JOHN_DEERE_GPS_DEFAULT_ENTRY_URL
  try {
    const u = new URL(trimmed)
    if (u.hostname === 'map.deere.com' && (!u.pathname || u.pathname === '/')) {
      u.pathname = '/login'
      return u.toString()
    }
  } catch {
    return `${JOHN_DEERE_GPS_MAP_ORIGIN}/login`
  }
  return trimmed
}

/** Same-origin GPS embed path for a Deere https URL (backend strips X-Frame-Options). */
export function johnDeereGpsEmbedSrcForUrl(externalUrl: string): string {
  const trimmed = String(externalUrl || '').trim()
  if (!trimmed) return johnDeereGpsEmbedSrc('/login')
  try {
    const u = new URL(trimmed)
    if (!ALLOWED_GPS_EMBED_HOSTS.has(u.hostname)) {
      return johnDeereGpsEmbedSrc('/login')
    }
    const pathWithQuery = `${u.pathname || '/'}${u.search || ''}`
    return `${PROXY_EMBED_ROOT}/${u.hostname}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`
  } catch {
    return johnDeereGpsEmbedSrc('/login')
  }
}

/** Proxied iframe entry tuned for in-app embed (sign-in first when URL is map home). */
export function johnDeereGpsInAppEmbedSrcForUrl(externalUrl: string): string {
  return johnDeereGpsEmbedSrcForUrl(johnDeereGpsInAppEntryUrl(externalUrl))
}

/**
 * Same-origin GPS embed (backend strips X-Frame-Options and rewrites Deere URLs).
 * Starts at map.deere.com — redirects to sign-in or /login?code=… inside the iframe.
 */
export function johnDeereGpsEmbedSrc(mapPath = '/'): string {
  const path = mapPath.startsWith('/') ? mapPath : `/${mapPath}`
  return `${PROXY_EMBED_ROOT}/map.deere.com${path}`
}
