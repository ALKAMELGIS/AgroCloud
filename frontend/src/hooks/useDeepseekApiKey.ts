import { useSyncExternalStore } from 'react'
import { getDeepseekApiKey, subscribeDeepseekApiKey } from '../lib/deepseekApiKey'

export function useDeepseekApiKey(): string {
  return useSyncExternalStore(subscribeDeepseekApiKey, getDeepseekApiKey, getDeepseekApiKey)
}
