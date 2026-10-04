import type { ThemeOptions } from '@mui/material/styles'

export const agroShape: NonNullable<ThemeOptions['shape']> = {
  borderRadius: 8,
}

export const agroRadii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const
