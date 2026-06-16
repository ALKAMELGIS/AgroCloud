import { useSyncExternalStore } from 'react'
import { getClaudeApiKey, subscribeClaudeApiKey } from '../lib/claudeApiKey'

/** Re-renders when the effective Claude API key changes (localStorage save/clear in this tab or another). */
export function useClaudeApiKey(): string {
  return useSyncExternalStore(subscribeClaudeApiKey, getClaudeApiKey, getClaudeApiKey)
}
