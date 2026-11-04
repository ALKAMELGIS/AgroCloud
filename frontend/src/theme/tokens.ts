/**
 * AgroCloud design tokens — single source of truth for the MUI theme and the CSS token layer
 * (`assets/styles/agro-premium.css` mirrors these values as `--ds-*` custom properties).
 *
 * Derived from the UI UX Pro Max recommendation for AgroCloud (design-system/agrocloud/MASTER.md):
 * earth green primary (kept on the existing AgroCloud brand emerald #047857, used in 120+ legacy
 * stylesheets) + harvest gold accent, subtle glass, WCAG 4.5:1 text contrast in both modes.
 */

/** Non-MUI islands (map labels, canvas overlays) may read these constants. */
export const agroTokens = {
  touchTargetMin: 44,
  spacing: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64],
  drawerWidth: 280,
  bottomNavHeight: 56,
  headerHeight: 56,
} as const

export type AgroColorMode = 'light' | 'dark'

export interface AgroSemanticColors {
  bg: string
  bgSubtle: string
  surface: string
  surfaceRaised: string
  surfaceSunken: string
  text: string
  textSecondary: string
  textMuted: string
  border: string
  borderStrong: string
  primary: string
  primaryHover: string
  primarySoft: string
  onPrimary: string
  secondary: string
  secondarySoft: string
  accent: string
  accentSoft: string
  success: string
  warning: string
  danger: string
  info: string
  focusRing: string
  glassBg: string
  glassBorder: string
  glassBlur: number
  scrim: string
}

export const agroColors: Record<AgroColorMode, AgroSemanticColors> = {
  light: {
    bg: '#F4F7F5',
    bgSubtle: '#EDF2EF',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F7FAF8',
    text: '#17241E',
    textSecondary: '#475569',
    textMuted: '#5F6B66',
    border: '#DDE5E0',
    borderStrong: '#C4D2CA',
    primary: '#047857',
    primaryHover: '#065F46',
    primarySoft: 'rgba(4, 120, 87, 0.10)',
    onPrimary: '#FFFFFF',
    secondary: '#0369A1',
    secondarySoft: 'rgba(3, 105, 161, 0.10)',
    accent: '#A16207',
    accentSoft: 'rgba(161, 98, 7, 0.12)',
    success: '#15803D',
    warning: '#B45309',
    danger: '#DC2626',
    info: '#0369A1',
    focusRing: 'rgba(4, 120, 87, 0.35)',
    glassBg: 'rgba(255, 255, 255, 0.74)',
    glassBorder: 'rgba(255, 255, 255, 0.65)',
    glassBlur: 16,
    scrim: 'rgba(15, 23, 20, 0.45)',
  },
  dark: {
    bg: '#0B1210',
    bgSubtle: '#0F1714',
    surface: '#121B17',
    surfaceRaised: '#18231E',
    surfaceSunken: '#0E1613',
    text: '#E6EDE9',
    textSecondary: '#A9B8B0',
    textMuted: '#8A9992',
    border: 'rgba(230, 237, 233, 0.09)',
    borderStrong: 'rgba(230, 237, 233, 0.16)',
    primary: '#22C55E',
    primaryHover: '#4ADE80',
    primarySoft: 'rgba(34, 197, 94, 0.14)',
    onPrimary: '#05200F',
    secondary: '#38BDF8',
    secondarySoft: 'rgba(56, 189, 248, 0.14)',
    accent: '#EAB308',
    accentSoft: 'rgba(234, 179, 8, 0.14)',
    success: '#22C55E',
    warning: '#FBBF24',
    danger: '#F87171',
    info: '#38BDF8',
    focusRing: 'rgba(74, 222, 128, 0.45)',
    glassBg: 'rgba(18, 27, 23, 0.68)',
    glassBorder: 'rgba(230, 237, 233, 0.08)',
    glassBlur: 18,
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
}

export const agroFont = {
  sans: '"Inter", "IBM Plex Sans Arabic", "Noto Kufi Arabic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

export const agroRadius = { xs: 6, sm: 8, md: 10, lg: 14, xl: 18, pill: 999 } as const

export const agroMotion = {
  fast: '150ms',
  base: '200ms',
  slow: '300ms',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

export function agroElevation(mode: AgroColorMode) {
  return mode === 'dark'
    ? {
        sm: '0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.25)',
        md: '0 4px 14px rgba(0,0,0,0.38), 0 1px 3px rgba(0,0,0,0.3)',
        lg: '0 16px 40px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.3)',
      }
    : {
        sm: '0 1px 2px rgba(16,24,20,0.06), 0 1px 1px rgba(16,24,20,0.04)',
        md: '0 4px 14px rgba(16,24,20,0.07), 0 1px 3px rgba(16,24,20,0.05)',
        lg: '0 18px 44px rgba(16,24,20,0.12), 0 4px 12px rgba(16,24,20,0.06)',
      }
}
