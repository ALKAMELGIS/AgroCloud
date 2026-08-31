/** Bundled Elite Agro Projects white logo (frontend/public → /AgroCloud/elite-agro-logo-white.png). */
export const ELITE_AGRO_LOGO_WHITE_URL = `${import.meta.env.BASE_URL}elite-agro-logo-white.png`

/** Removed from eliteprojects.ae — map to bundled asset so saved settings keep working. */
export const LEGACY_ELITE_AGRO_LOGO_URL =
  'https://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png'

export function resolveEliteAgroLogoUrl(url: string | null | undefined): string {
  const trimmed = String(url ?? '').trim()
  if (!trimmed || trimmed === LEGACY_ELITE_AGRO_LOGO_URL) return ELITE_AGRO_LOGO_WHITE_URL
  return trimmed
}

/** Absolute URL for fetch/embed (PDF export, etc.). */
export function eliteAgroLogoAbsoluteUrl(): string {
  if (typeof window === 'undefined') return ELITE_AGRO_LOGO_WHITE_URL
  return new URL(ELITE_AGRO_LOGO_WHITE_URL, window.location.href).href
}
