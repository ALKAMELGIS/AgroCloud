import { apiUrl, configuredApiOrigin, ensureBackendAvailable, noteApiResponse } from '@/core/api/apiOrigin'

async function weatherApiReachable(): Promise<boolean> {
  if (import.meta.env.DEV) return true
  if (configuredApiOrigin()) return true
  return ensureBackendAvailable()
}

export type GridPoint = { lat: number; lng: number }

export type GridBatchHourlyResponse = {
  points: Array<{ lat: number; lng: number; values: Record<string, number | null> }>
}

export type GridBatchCurrentResponse = {
  points: Array<{
    lat: number
    lng: number
    current: Record<string, number | null>
    dailyMinC?: number | null
    dailyMaxC?: number | null
  }>
}

async function postGridBatch<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  try {
    if (!(await weatherApiReachable())) return null
    const res = await fetch(apiUrl('/api/weather/grid-batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    })
    noteApiResponse(res.status)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchHourlyGridBatch(
  points: GridPoint[],
  hourly: string | string[],
  timeIso?: string,
  signal?: AbortSignal,
): Promise<GridBatchHourlyResponse | null> {
  if (!points.length) return { points: [] }
  return postGridBatch({ mode: 'hourly', points, hourly, timeIso }, signal)
}

export async function fetchCurrentGridBatch(
  points: GridPoint[],
  current: string | string[],
  signal?: AbortSignal,
): Promise<GridBatchCurrentResponse | null> {
  if (!points.length) return { points: [] }
  return postGridBatch({ mode: 'current', points, current }, signal)
}
