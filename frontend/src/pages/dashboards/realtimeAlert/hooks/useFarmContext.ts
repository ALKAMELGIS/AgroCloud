import { useCallback, useEffect, useState } from 'react'
import type { RealtimeAlertFarmSelection } from '../types/realtimeAlert.types'

export function buildDefaultFarmSelection(
  context: {
    defaults?: Partial<RealtimeAlertFarmSelection>
    farms?: Array<{ id: string }>
    crops?: Array<{ id: string }>
    locations?: Array<{ id: string }>
  } | null,
): RealtimeAlertFarmSelection {
  const d = context?.defaults ?? {}
  return {
    farmId: d.farmId ?? context?.farms?.[0]?.id ?? '',
    cropId: d.cropId ?? context?.crops?.[0]?.id ?? '',
    locationId: d.locationId ?? context?.locations?.[0]?.id ?? '',
    sowingDate: d.sowingDate ?? '',
    analysisDate: d.analysisDate ?? new Date().toISOString().slice(0, 10),
  }
}

export function useFarmContextState(
  context: Parameters<typeof buildDefaultFarmSelection>[0],
) {
  const [selection, setSelection] = useState<RealtimeAlertFarmSelection>(() => buildDefaultFarmSelection(context))

  useEffect(() => {
    if (context) setSelection(buildDefaultFarmSelection(context))
  }, [context])

  const patchSelection = useCallback((patch: Partial<RealtimeAlertFarmSelection>) => {
    setSelection(prev => ({ ...prev, ...patch }))
  }, [])

  return { selection, setSelection, patchSelection }
}
