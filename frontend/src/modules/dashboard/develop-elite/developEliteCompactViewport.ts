import { useEffect, useState } from 'react'

/** Phone + tablet: lists move into the in-dashboard slide drawer. */
export const DEVELOP_ELITE_COMPACT_VIEWPORT_MQ = '(max-width: 1199px)'

export const DEVELOP_ELITE_COMPACT_LIST_WIDGET_IDS = [
  'sidebar-farms',
  'sidebar-countries',
  'zones',
  'structures',
] as const

export function useDevelopEliteCompactViewport(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(DEVELOP_ELITE_COMPACT_VIEWPORT_MQ).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(DEVELOP_ELITE_COMPACT_VIEWPORT_MQ)
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}
