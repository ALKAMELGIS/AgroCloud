import type { ThemeOptions } from '@mui/material/styles'
import { agroRadius } from './tokens'

export const agroShape: NonNullable<ThemeOptions['shape']> = {
  borderRadius: agroRadius.md,
}

export const agroRadii = {
  sm: agroRadius.xs,
  md: agroRadius.sm,
  lg: agroRadius.lg,
  xl: agroRadius.xl,
} as const
