import { useMemo, useEffect, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { useSystemSettings } from '@/core/state/SystemSettingsContext'
import { createAgroTheme, readDocumentThemeMode, type AgroThemeMode } from './createAgroTheme'

function resolveDark(themeMode: string): boolean {
  if (themeMode === 'dark') return true
  if (themeMode === 'light' || themeMode === 'custom') return false
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return true
  return false
}

export function AgroThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSystemSettings()
  const [docMode, setDocMode] = useState<AgroThemeMode>(() => readDocumentThemeMode())

  useEffect(() => {
    const root = document.documentElement
    const obs = new MutationObserver(() => {
      setDocMode(readDocumentThemeMode())
    })
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const mode: AgroThemeMode = useMemo(() => {
    if (settings.themeMode === 'dark') return 'dark'
    if (settings.themeMode === 'light' || settings.themeMode === 'custom') return 'light'
    return resolveDark(settings.themeMode) ? 'dark' : 'light'
  }, [settings.themeMode])

  const effectiveMode = settings.themeMode === 'system' ? docMode : mode
  const theme = useMemo(() => createAgroTheme(effectiveMode), [effectiveMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  )
}
