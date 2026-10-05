import { useMediaQuery, useTheme } from '@mui/material'

export type AgroViewport = 'mobile' | 'tablet' | 'desktop'

/** MUI breakpoints: mobile under 600px, tablet under 900px, desktop 900px+. */
export function useAgroViewport(): AgroViewport {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('sm'))
  const tablet = useMediaQuery(theme.breakpoints.down('md'))
  if (mobile) return 'mobile'
  if (tablet) return 'tablet'
  return 'desktop'
}

export function isAgroTouchViewport(viewport: AgroViewport): boolean {
  return viewport !== 'desktop'
}
