import { useSyncExternalStore } from 'react'
import { getDeepseekApiKey, subscribeDeepseekApiKey } from '../config/deepseekApiKey'

export function useDeepseekApiKey(): string {
  return useSyncExternalStore(subscribeDeepseekApiKey, getDeepseekApiKey, getDeepseekApiKey)
}
