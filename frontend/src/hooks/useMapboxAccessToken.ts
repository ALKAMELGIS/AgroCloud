import { useSyncExternalStore } from 'react'
import { getMapboxAccessToken, subscribeMapboxAccessToken } from '../lib/mapboxAccessToken'

/** Re-renders when the effective Mapbox token changes (env is static; localStorage updates trigger refresh). */
export function useMapboxAccessToken(): string {
  return useSyncExternalStore(subscribeMapboxAccessToken, getMapboxAccessToken, getMapboxAccessToken)
}
