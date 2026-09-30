/**
 * Client for backend WaPOR AET batch proxy.
 */

export type WaporAetFieldResult = {
  aetMmDay: number
  source: string
  waporDate: string
  observationDate: string
} | null

export type WaporAetBatchEntry = {
  fieldKey: string
  lon: number
  lat: number
  observationDate: string
}

export async function fetchWaporAetBatch(
  entries: WaporAetBatchEntry[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!entries.length) return out

  const resp = await fetch('/api/wapor/aet/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
    signal,
  })
  if (!resp.ok) return out

  const json = (await resp.json()) as {
    results?: Record<string, WaporAetFieldResult>
  }
  const results = json.results ?? {}
  for (const [fieldKey, row] of Object.entries(results)) {
    if (row?.aetMmDay != null && Number.isFinite(row.aetMmDay)) {
      out.set(fieldKey, row.aetMmDay)
    }
  }
  return out
}
