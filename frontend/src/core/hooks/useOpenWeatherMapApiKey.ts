import { useSyncExternalStore } from 'react'
import { getOpenWeatherMapApiKey, subscribeOpenWeatherMapApiKey } from '../config/openWeatherMapApiKey'

export function useOpenWeatherMapApiKey(): string {
  return useSyncExternalStore(subscribeOpenWeatherMapApiKey, getOpenWeatherMapApiKey, getOpenWeatherMapApiKey)
}
