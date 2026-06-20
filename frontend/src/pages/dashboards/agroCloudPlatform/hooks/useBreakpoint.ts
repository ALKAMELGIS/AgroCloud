import { useEffect, useState } from 'react'

export type AcpBreakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_MQ = '(max-width: 767px)'
const TABLET_MQ = '(max-width: 1023px)'

function resolveBreakpoint(): AcpBreakpoint {
  if (typeof window === 'undefined') return 'desktop'
  if (window.matchMedia(MOBILE_MQ).matches) return 'mobile'
  if (window.matchMedia(TABLET_MQ).matches) return 'tablet'
  return 'desktop'
}

/** Tailwind-aligned breakpoints: mobile <768, tablet <1024, desktop ≥1024. */
export function useBreakpoint(): AcpBreakpoint {
  const [bp, setBp] = useState<AcpBreakpoint>(resolveBreakpoint)

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_MQ)
    const tablet = window.matchMedia(TABLET_MQ)
    const sync = () => setBp(resolveBreakpoint())
    sync()
    mobile.addEventListener('change', sync)
    tablet.addEventListener('change', sync)
    return () => {
      mobile.removeEventListener('change', sync)
      tablet.removeEventListener('change', sync)
    }
  }, [])

  return bp
}

export function isAcpCompactLayout(bp: AcpBreakpoint): boolean {
  return bp !== 'desktop'
}
