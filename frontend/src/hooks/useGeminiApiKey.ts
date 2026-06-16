import { useSyncExternalStore } from 'react'
import { getGeminiApiKey, subscribeGeminiApiKey } from '../lib/geminiApiKey'

/** Re-renders when the effective Gemini API key changes (localStorage save/clear in this tab or another). */
export function useGeminiApiKey(): string {
  return useSyncExternalStore(subscribeGeminiApiKey, getGeminiApiKey, getGeminiApiKey)
}
