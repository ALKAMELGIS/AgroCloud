export type ManpowerSummary = {
  total: number
  used: number
  reserved: number
  available: number
  byRole?: unknown[]
}

export async function fetchManpowerSummary(): Promise<ManpowerSummary> {
  const res = await fetch('/api/v1/manpower', { credentials: 'include' })
  const data = (await res.json()) as ManpowerSummary & { ok?: boolean }
  if (!res.ok) throw new Error('Failed to load manpower')
  return data
}

export async function allocateManpower(body: {
  roleCode: string
  total: number
  reason?: string
}): Promise<void> {
  const res = await fetch('/api/v1/manpower/allocate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Allocate failed')
  }
}
