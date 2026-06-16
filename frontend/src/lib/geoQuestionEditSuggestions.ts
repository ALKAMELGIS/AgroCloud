/**
 * Lightweight local suggestions for “Edit question” — no API calls.
 * Improves clarity, common typos (e.g. Felids → Fields), and GIS hints.
 */

export type GeoQuestionSuggestContext = {
  layers: string[]
  fields: string[]
  numericFields: string[]
}

export function buildGeoQuestionEditSuggestions(text: string, ctx: GeoQuestionSuggestContext): string[] {
  const raw = text.trim()
  if (!raw) return []

  const lower = raw.toLowerCase()
  const out: string[] = []

  // Common typo when asking for attribute columns
  if (/\bfelids\b/i.test(raw)) {
    out.push(raw.replace(/\bFelids\b/g, 'Fields').replace(/\bfelids\b/g, 'fields'))
  }

  // Natural clarification for tabular asks
  if ((/\btable\b/i.test(raw) || /\bgrid\b/i.test(raw)) && !/\blayer\b/i.test(lower)) {
    const layer = ctx.layers[0]
    if (layer) {
      out.push(`${raw} — specify layer "${layer}" if that's the target.`)
    } else {
      out.push(`${raw} — which layer should this table use?`)
    }
  }

  // Encode layer hint when user didn’t name one
  if (ctx.layers.length && !ctx.layers.some(l => raw.includes(l))) {
    const L = ctx.layers[0]
    out.push(`${raw} (layer: "${L}")`)
  }

  // Field hint for summarize / count style prompts
  if (/\b(sum|average|count|total|group|مجموع|متوسط|عدد)\b/i.test(raw) && ctx.numericFields.length) {
    const n = ctx.numericFields[0]
    if (!raw.includes(n)) {
      out.push(`${raw} — numeric field: ${n}`)
    }
  }

  // Shorter Arabic clarity line (append-only variant)
  if (/[\u0600-\u06FF]/.test(raw) && ctx.layers[0]) {
    out.push(`${raw} — الطبقة: "${ctx.layers[0]}"`)
  }

  // Plain English tightening
  if (!/[\u0600-\u06FF]/.test(raw) && raw.length > 48 && /\bshow\b/i.test(raw)) {
    out.push(raw.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim())
  }

  const dedup: string[] = []
  const seen = new Set<string>()
  for (const s of out) {
    const k = s.trim().toLowerCase()
    if (!seen.has(k) && s.trim() !== raw.trim()) {
      seen.add(k)
      dedup.push(s.trim())
    }
  }
  return dedup.slice(0, 6)
}
