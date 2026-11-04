import { alpha, type PaletteOptions } from '@mui/material/styles'
import { agroColors, type AgroColorMode } from './tokens'

function buildPalette(mode: AgroColorMode, customPrimary?: string | null): PaletteOptions {
  const c = agroColors[mode]
  const primaryMain = customPrimary || c.primary
  return {
    mode,
    primary: {
      main: primaryMain,
      dark: customPrimary ? undefined : c.primaryHover,
      contrastText: customPrimary ? undefined : c.onPrimary,
    },
    secondary: { main: c.secondary },
    success: { main: c.success },
    warning: { main: c.warning },
    error: { main: c.danger },
    info: { main: c.info },
    background: {
      default: c.bg,
      paper: c.surface,
    },
    text: {
      primary: c.text,
      secondary: c.textSecondary,
      disabled: alpha(c.text, 0.38),
    },
    divider: c.border,
    action: {
      hover: alpha(mode === 'dark' ? '#ffffff' : c.text, mode === 'dark' ? 0.06 : 0.04),
      selected: c.primarySoft,
      focus: c.focusRing,
    },
  }
}

export function lightPalette(customPrimary?: string | null): PaletteOptions {
  return buildPalette('light', customPrimary)
}

export function darkPalette(customPrimary?: string | null): PaletteOptions {
  return buildPalette('dark', customPrimary)
}
