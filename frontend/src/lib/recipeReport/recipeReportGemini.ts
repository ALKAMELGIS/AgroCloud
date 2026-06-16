import { geminiGenerateContent, type GeminiContent } from '../geoExplorerGemini'

export type RecipeReportInsights = {
  executiveLines: string[]
  keyMetrics: Array<{ metric: string; value: string }>
}

function stripCodeFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/\s*```\s*$/m, '')
  }
  return t.trim()
}

function parseInsightsJson(raw: string): RecipeReportInsights | null {
  try {
    const j = JSON.parse(stripCodeFences(raw)) as {
      executiveNarrative?: string
      keyMetrics?: Array<{ metric?: string; value?: string }>
    }
    const narrative = typeof j.executiveNarrative === 'string' ? j.executiveNarrative.trim() : ''
    const lines = narrative
      ? narrative
          .split(/\n+/)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 8)
      : []
    const metrics = Array.isArray(j.keyMetrics)
      ? j.keyMetrics
          .map(r => ({
            metric: String(r?.metric ?? '').trim(),
            value: String(r?.value ?? '').trim(),
          }))
          .filter(r => r.metric && r.value)
          .slice(0, 14)
      : []
    if (!lines.length && !metrics.length) return null
    return { executiveLines: lines.slice(0, 6), keyMetrics: metrics }
  } catch {
    return null
  }
}

/**
 * Uses Gemini (when API key is configured) to produce a short executive narrative and a condensed metrics list.
 * Returns null if the call fails — callers should fall back to deterministic summaries.
 */
export async function fetchRecipeReportInsightsFromGemini(opts: {
  apiKey: string
  lang: 'en' | 'ar'
  workflowTitle: string
  periodLabel?: string
  rowCount: number
  columnLabels: string[]
  numericSummariesForPrompt: Array<{
    column: string
    count: number
    sum: number
    avg: number
    min: number
    max: number
  }>
  sampleRows: Array<Record<string, string>>
}): Promise<RecipeReportInsights | null> {
  const key = opts.apiKey.trim()
  if (!key) return null

  const langHint =
    opts.lang === 'ar'
      ? 'Write the executive narrative in Modern Standard Arabic (professional tone). Metric labels may stay bilingual if clearer.'
      : 'Write the executive narrative in concise professional English.'

  const systemInstruction =
    'You are a senior agricultural data analyst preparing an executive PDF appendix. ' +
    'Output MUST be a single JSON object only — no markdown, no commentary outside JSON. ' +
    'Be precise with numbers exactly as given; do not invent rows or fields not present in the payload.'

  const userPayload = {
    task: 'Produce executive insights for a saved workflow recipe export.',
    langHint,
    workflowTitle: opts.workflowTitle,
    reportingPeriod: opts.periodLabel ?? '',
    recordsInExport: opts.rowCount,
    columns: opts.columnLabels,
    numericFieldStats: opts.numericSummariesForPrompt,
    sampleRecords: opts.sampleRows.slice(0, 5),
    schema: {
      executiveNarrative:
        'Exactly 4 to 6 lines separated by newline characters. Each line <= 120 characters. Highlight totals, shares, averages, and risk/opportunity in plain language.',
      keyMetrics:
        'Array of { "metric": string, "value": string } with at most 12 entries — only the MOST decision-relevant KPIs (avoid repeating raw min/max unless critical). Include record count as first item.',
    },
  }

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(userPayload) }] }]

  const text = await geminiGenerateContent({
    apiKey: key,
    systemInstruction,
    contents,
  })

  return parseInsightsJson(text)
}
