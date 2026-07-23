export const GIS_RECENT_LS_KEY = 'agrocloud.gis.recent'
export const GIS_FAVORITES_LS_KEY = 'agrocloud.gis.favorites'

const MAX_RECENT = 30

export type RecentSource = {
  id: string
  title: string
  category: string
  detail?: string
  url?: string
  savedAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function readList(key: string): RecentSource[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentSource)
  } catch {
    return []
  }
}

function writeList(key: string, items: RecentSource[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch {
    console.warn('[gisConnections] Could not persist recent/favorites')
  }
}

function isRecentSource(value: unknown): value is RecentSource {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.category === 'string' &&
    typeof v.savedAt === 'string'
  )
}

export function listRecent(): RecentSource[] {
  return readList(GIS_RECENT_LS_KEY)
}

/** Push a source to the front of recent (dedupe by id), capped at 30. */
export function pushRecent(
  source: Omit<RecentSource, 'savedAt'> & Partial<Pick<RecentSource, 'savedAt'>>,
): RecentSource[] {
  const entry: RecentSource = {
    ...source,
    title: source.title.trim(),
    category: source.category.trim(),
    detail: source.detail,
    url: source.url,
    savedAt: source.savedAt ?? nowIso(),
  }
  const next = [entry, ...listRecent().filter(r => r.id !== entry.id)].slice(0, MAX_RECENT)
  writeList(GIS_RECENT_LS_KEY, next)
  return next
}

/** Remove a single recent source by id. Returns the updated list. */
export function removeRecent(id: string): RecentSource[] {
  const next = listRecent().filter(r => r.id !== id)
  writeList(GIS_RECENT_LS_KEY, next)
  return next
}

/** Clear all recent sources. */
export function clearRecent(): void {
  writeList(GIS_RECENT_LS_KEY, [])
}

export function listFavorites(): RecentSource[] {
  return readList(GIS_FAVORITES_LS_KEY)
}

export function isFavorite(id: string): boolean {
  return listFavorites().some(f => f.id === id)
}

/** Add or remove a favorite by id. Returns whether it is now a favorite. */
export function toggleFavorite(
  source: Omit<RecentSource, 'savedAt'> & Partial<Pick<RecentSource, 'savedAt'>>,
): boolean {
  const favs = listFavorites()
  const existing = favs.findIndex(f => f.id === source.id)
  if (existing >= 0) {
    favs.splice(existing, 1)
    writeList(GIS_FAVORITES_LS_KEY, favs)
    return false
  }
  const entry: RecentSource = {
    ...source,
    title: source.title.trim(),
    category: source.category.trim(),
    detail: source.detail,
    url: source.url,
    savedAt: source.savedAt ?? nowIso(),
  }
  writeList(GIS_FAVORITES_LS_KEY, [entry, ...favs])
  return true
}
