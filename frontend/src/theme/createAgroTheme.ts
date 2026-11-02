import { createTheme, type Theme } from '@mui/material/styles'
import { agroComponents } from './components'
import { darkPalette, lightPalette } from './palette'
import { agroShape } from './shape'
import { agroTypography } from './typography'
import { agroZIndex } from './zIndex'

export type AgroThemeMode = 'light' | 'dark'

export interface AgroThemeOptions {
  /** Organisation accent from System Settings → custom theme (hex). */
  customPrimary?: string | null
}

export function createAgroTheme(mode: AgroThemeMode, options: AgroThemeOptions = {}): Theme {
  const palette = mode === 'dark' ? darkPalette(options.customPrimary) : lightPalette(options.customPrimary)
  const base = createTheme({
    palette,
    typography: agroTypography,
    shape: agroShape,
    spacing: 4,
    breakpoints: {
      values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
    },
    zIndex: {
      mobileStepper: 1000,
      fab: 1050,
      speedDial: 1050,
      appBar: agroZIndex.appBar,
      drawer: agroZIndex.drawer,
      modal: agroZIndex.modal,
      snackbar: agroZIndex.snackbar,
      tooltip: agroZIndex.popover,
    },
  })
  return createTheme(base, { components: agroComponents(base) })
}

export function readDocumentThemeMode(): AgroThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}
