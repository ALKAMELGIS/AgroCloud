/**
 * Display helpers for Remote Sensing layer menus.
 * Keeps practical names; strips band math / weight formulas from UI copy.
 */

const BAND_TOKEN = String.raw`(?:B\d{1,2}|B8A)`
const SPECTRAL_WORD = String.raw`(?:NIR|SWIR2?|Red|Green|Blue|RE|SWIR)`

/** True when a string looks like a spectral / arithmetic formula rather than prose. */
export function looksLikeLayerFormula(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (/=/.test(s) && /[()/*/+\-−–×]|NIR|SWIR|B\d/i.test(s)) return true
  if (new RegExp(BAND_TOKEN, 'i').test(s) && /[()/*/+\-−–×]/.test(s)) return true
  if (/\d+\.?\d*\s*\([A-Z]{2,}/.test(s) && /\+/.test(s)) return true
  if (new RegExp(`${SPECTRAL_WORD}\\s*[+\\-−–/×*]`, 'i').test(s)) return true
  return false
}

/**
 * Strip spectral / composite formulas from a scientificName for layer-select UI.
 * Returns practical wording only; may be empty when the source was formula-only.
 */
export function stripLayerSelectFormulas(text: string): string {
  let s = String(text || '').trim()
  if (!s) return ''

  // "NDVI = (NIR − Red) / …" → keep left label only when it is prose-ish; else drop formula side.
  if (/=/.test(s)) {
    const left = s.slice(0, s.indexOf('=')).trim()
    const right = s.slice(s.indexOf('=') + 1).trim()
    if (looksLikeLayerFormula(right) || looksLikeLayerFormula(s)) {
      s = left
    }
  }

  // Drop parentheticals that contain band / math markers.
  s = s.replace(
    /\([^)]*(?:B\d{1,2}|B8A|NIR|SWIR|Red|Green|Blue|\/|\+|−|–|×|\*|−|\d+\.?\d*\s*[×*])[^)]*\)/gi,
    ' ',
  )

  // Inline Sentinel band arithmetic: B11 − B12 / B11 + B12, (B8A/B05)−1 remnants
  s = s.replace(
    new RegExp(
      String.raw`(?:^|[\s·•—–-])\(?(?:${BAND_TOKEN})(?:\s*[+\-−–/×*]\s*(?:${BAND_TOKEN}|\([^)]+\)|\d+\.?\d*))+\)?(?:\s*[−–-]\s*\d+\.?\d*)?`,
      'gi',
    ),
    ' ',
  )

  // Weighted index recipes: 0.30(IOI) + 0.25(CMI) + …
  s = s.replace(
    /(?:^|[\s·•—–])(?:\d+\.?\d*\s*[×*]?\s*)?\d*\.?\d*\s*\([A-Z][A-Z0-9_]*\)(?:\s*[+]\s*(?:\d+\.?\d*\s*[×*]?\s*)?\d*\.?\d*\s*\([A-Z][A-Z0-9_]*\))+/g,
    ' ',
  )
  s = s.replace(/(?:^|[\s·•—–])(?:\d+\.?\d*\s*\([A-Z][A-Z0-9_]*\)(?:\s*[+]\s*)?)+/g, ' ')

  // Guyot-style numeric formulas: 705+35×(((…
  s = s.replace(/\b\d{3}(?:\.\d+)?\s*[+]\s*\d+(?:\.\d+)?\s*[×*x].*$/i, ' ')

  // Spectral-word arithmetic leftovers: (NIR − Red) already stripped; bare NIR − Red …
  s = s.replace(
    new RegExp(
      String.raw`(?:^|[\s·•—–])\(?(?:${SPECTRAL_WORD}|\d+\.?\d*)(?:\s*[+\-−–/×*]\s*(?:${SPECTRAL_WORD}|\d+\.?\d*|\([^)]+\)))+\)?`,
      'gi',
    ),
    ' ',
  )

  // Orphan math crumbs left after paren strip: "/ ·", "−1 ·", bare operators
  s = s.replace(/(?:^|[\s·•—–])(?:[+\-−–/×*]+\s*)+\d*(?:\.\d+)?(?=[\s·•—–]|$)/g, ' ')
  s = s.replace(/\/+/g, ' ')

  // Split on middle dots / em dashes and drop formula-only segments.
  const parts = s
    .split(/\s*[·•—–]\s*/)
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => !looksLikeLayerFormula(p))
    .filter(p => !/^[+\-−–/×*\d.\s]+$/.test(p))

  s = parts.join(' · ')
  s = s.replace(/\s{2,}/g, ' ').trim()
  s = s.replace(/^[·•—–\s]+|[·•—–\s]+$/g, '').trim()
  return s
}

/** Practical subtitle for a layer option (empty → hide secondary line). */
export function formatLayerSelectScienceLabel(
  scientificName: string | undefined | null,
  shortLabel?: string,
): string {
  const cleaned = stripLayerSelectFormulas(String(scientificName || ''))
  if (!cleaned) return ''
  const abbr = String(shortLabel || '').trim()
  if (abbr && cleaned.toUpperCase() === abbr.toUpperCase()) return ''
  return cleaned
}
