import { useSyncExternalStore } from 'react'
import { getOllamaBaseUrl, getOllamaModel, subscribeOllamaConfig } from '../lib/ollamaConfig'

export function useOllamaConfig(): { baseUrl: string; model: string } {
  const baseUrl = useSyncExternalStore(subscribeOllamaConfig, getOllamaBaseUrl, getOllamaBaseUrl)
  const model = useSyncExternalStore(subscribeOllamaConfig, getOllamaModel, getOllamaModel)
  return { baseUrl, model }
}
