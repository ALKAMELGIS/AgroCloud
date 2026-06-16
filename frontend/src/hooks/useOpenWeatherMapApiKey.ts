import { useSyncExternalStore } from 'react'
import { getOpenWeatherMapApiKey, subscribeOpenWeatherMapApiKey } from '../lib/openWeatherMapApiKey'

export function useOpenWeatherMapApiKey(): string {
  return useSyncExternalStore(subscribeOpenWeatherMapApiKey, getOpenWeatherMapApiKey, getOpenWeatherMapApiKey)
}
