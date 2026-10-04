import type { PaletteOptions } from '@mui/material/styles'

const agGreen = {
  main: '#047857',
  light: '#10b981',
  dark: '#065f46',
  contrastText: '#ffffff',
}

const gisBlue = {
  main: '#0ea5e9',
  light: '#38bdf8',
  dark: '#0284c7',
  contrastText: '#ffffff',
}

export function lightPalette(): PaletteOptions {
  return {
    mode: 'light',
    primary: agGreen,
    secondary: gisBlue,
    success: { main: '#16a34a' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    info: { main: '#2563eb' },
    background: {
      default: '#f6f7f8',
      paper: '#fafbfc',
    },
    text: {
      primary: '#222222',
      secondary: '#555555',
    },
    divider: 'rgba(34, 34, 34, 0.1)',
  }
}

export function darkPalette(): PaletteOptions {
  return {
    mode: 'dark',
    primary: { ...agGreen, main: '#10b981', dark: '#047857' },
    secondary: gisBlue,
    success: { main: '#22c55e' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    info: { main: '#3b82f6' },
    background: {
      default: '#141618',
      paper: '#1a1d21',
    },
    text: {
      primary: '#e6e6e6',
      secondary: '#b8b8b8',
    },
    divider: 'rgba(230, 230, 230, 0.12)',
  }
}
