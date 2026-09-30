/**
 * Client for backend Open-Meteo ET0 batch proxy.
 */

export type OpenMeteoEt0BatchEntry = {
  fieldKey: string
  lat: number
  lon: number
  observationDate: string
}

export async function fetchOpenMeteoEt0Batch(
  entries: OpenMeteoEt0BatchEntry[],
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!entries.length) return out

  const resp = await fetch('/api/open-meteo/et0/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries, fromDate, toDate }),
    signal,
  })
  if (!resp.ok) return out

  const json = (await resp.json()) as { results?: Record<string, number> }
  for (const [fieldKey, et0] of Object.entries(json.results ?? {})) {
    if (et0 != null && Number.isFinite(et0)) out.set(fieldKey, et0)
  }
  return out
}
