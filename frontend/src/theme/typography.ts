import type { TypographyOptions } from '@mui/material/styles/createTypography'
import { agroFont } from './tokens'

/**
 * Type scale tuned for dense, all-day operational use: 14px body for data-heavy screens,
 * tight-but-readable headings, tabular numerals for tables / KPIs (see components.ts).
 */
export const agroTypography: TypographyOptions = {
  fontFamily: agroFont.sans,
  fontSize: 14,
  h1: { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h2: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.015em' },
  h3: { fontSize: '1.25rem', fontWeight: 650, lineHeight: 1.3, letterSpacing: '-0.01em' },
  h4: { fontSize: '1.125rem', fontWeight: 650, lineHeight: 1.35 },
  h5: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
  h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.45 },
  subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
  subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.45 },
  body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
  body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  caption: { fontSize: '0.75rem', lineHeight: 1.45 },
  button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
}
