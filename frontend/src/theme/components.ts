import { alpha, type Components, type Theme } from '@mui/material/styles'
import { agroColors, agroElevation, agroFont, agroMotion, agroRadius } from './tokens'
import { agroZIndex } from './zIndex'

/** Shared glass surface (headers, drawers, menus, floating map panels). */
export function agroGlass(theme: Theme) {
  const c = agroColors[theme.palette.mode]
  return {
    backgroundColor: c.glassBg,
    backdropFilter: `saturate(160%) blur(${c.glassBlur}px)`,
    WebkitBackdropFilter: `saturate(160%) blur(${c.glassBlur}px)`,
    border: `1px solid ${c.glassBorder}`,
  } as const
}

export function agroComponents(theme: Theme): Components<Omit<Theme, 'components'>> {
  const mode = theme.palette.mode
  const c = agroColors[mode]
  const shadow = agroElevation(mode)
  const transition = `background-color ${agroMotion.fast} ${agroMotion.ease}, border-color ${agroMotion.fast} ${agroMotion.ease}, box-shadow ${agroMotion.fast} ${agroMotion.ease}, color ${agroMotion.fast} ${agroMotion.ease}`
  // Outline (not box-shadow): legacy page CSS resets box-shadow on buttons, which hid the ring.
  const focusRing = { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 }
  const primary = theme.palette.primary.main

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          fontFeatureSettings: '"cv11", "ss01"',
        },
        'code, kbd, pre, samp': { fontFamily: agroFont.mono },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            transitionDuration: '0.01ms !important',
            animationDuration: '0.01ms !important',
          },
        },
      },
    },

    /* ---------- Buttons ---------- */
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        root: { '&.Mui-focusVisible': focusRing },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 38,
          paddingInline: 16,
          borderRadius: agroRadius.sm,
          fontWeight: 600,
          transition,
          [theme.breakpoints.down('sm')]: { minHeight: 44 },
        },
        sizeSmall: { minHeight: 32, paddingInline: 12, fontSize: '0.8125rem' },
        sizeLarge: { minHeight: 46, paddingInline: 22, fontSize: '0.9375rem' },
        containedPrimary: {
          boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.14)}, ${shadow.sm}`,
          '&:hover': { boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.14)}, ${shadow.md}` },
        },
        outlined: {
          borderColor: c.borderStrong,
          backgroundColor: c.surface,
          '&:hover': { borderColor: primary, backgroundColor: c.primarySoft },
        },
        text: { '&:hover': { backgroundColor: c.primarySoft } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: agroRadius.sm,
          transition,
          '&:hover': { backgroundColor: theme.palette.action.hover },
          [theme.breakpoints.down('sm')]: { padding: 10 },
        },
        sizeSmall: { padding: 6 },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: c.surfaceSunken,
          borderRadius: agroRadius.sm,
          padding: 3,
          gap: 2,
          border: `1px solid ${c.border}`,
        },
        grouped: {
          border: 0,
          borderRadius: `${agroRadius.xs}px !important`,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          color: c.textSecondary,
          paddingBlock: 6,
          '&.Mui-selected': {
            backgroundColor: c.surface,
            color: theme.palette.text.primary,
            boxShadow: shadow.sm,
            '&:hover': { backgroundColor: c.surface },
          },
        },
      },
    },
    MuiFab: {
      styleOverrides: { root: { boxShadow: shadow.md, '&:active': { boxShadow: shadow.sm } } },
    },

    /* ---------- Surfaces ---------- */
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: c.border },
        elevation1: { boxShadow: shadow.sm, border: `1px solid ${c.border}` },
        elevation2: { boxShadow: shadow.md, border: `1px solid ${c.border}` },
        elevation8: { boxShadow: shadow.lg },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: agroRadius.lg,
          border: `1px solid ${c.border}`,
          backgroundColor: c.surface,
          boxShadow: shadow.sm,
          transition,
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: '16px 20px 8px' },
        title: { fontSize: '0.9375rem', fontWeight: 650 },
        subheader: { fontSize: '0.8125rem', color: c.textMuted },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          zIndex: agroZIndex.appBar,
          ...agroGlass(theme),
          borderTop: 0,
          borderInline: 0,
          color: theme.palette.text.primary,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: { gap: 8 },
        dense: { minHeight: 48 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: { zIndex: agroZIndex.drawer },
        paper: {
          ...agroGlass(theme),
          borderBlock: 0,
          borderRadius: 0,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: { zIndex: agroZIndex.modal },
        paper: {
          borderRadius: agroRadius.xl,
          border: `1px solid ${c.border}`,
          boxShadow: shadow.lg,
          backgroundColor: c.surfaceRaised,
          [theme.breakpoints.down('sm')]: { margin: 12, width: 'calc(100% - 24px)' },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1.0625rem', fontWeight: 650, padding: '18px 24px 8px' } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px 16px' } } },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '12px 24px 20px', gap: 8, borderTop: `1px solid ${c.border}`, '& > :not(style) ~ :not(style)': { marginLeft: 0 } },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          '&:not(.MuiBackdrop-invisible)': {
            backgroundColor: c.scrim,
            backdropFilter: 'blur(2px)',
          },
        },
      },
    },
    MuiPopover: {
      styleOverrides: { paper: { ...agroGlass(theme), boxShadow: shadow.lg, borderRadius: agroRadius.md } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { ...agroGlass(theme), boxShadow: shadow.lg, borderRadius: agroRadius.md, marginTop: 4 },
        list: { padding: 4 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: agroRadius.xs,
          minHeight: 36,
          fontSize: '0.875rem',
          '&.Mui-selected': { backgroundColor: c.primarySoft, fontWeight: 600 },
          [theme.breakpoints.down('sm')]: { minHeight: 44 },
        },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 350 },
      styleOverrides: {
        tooltip: {
          backgroundColor: mode === 'dark' ? '#E6EDE9' : '#17241E',
          color: mode === 'dark' ? '#0B1210' : '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 10px',
          borderRadius: agroRadius.xs,
        },
        arrow: { color: mode === 'dark' ? '#E6EDE9' : '#17241E' },
      },
    },

    /* ---------- Forms ---------- */
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: '0.875rem', color: c.textSecondary },
        shrink: { fontWeight: 600 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: agroRadius.sm,
          backgroundColor: c.surface,
          transition,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.borderStrong, transition },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.55) },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: primary, borderWidth: 1 },
          '&.Mui-focused': { boxShadow: `0 0 0 3px ${c.focusRing}` },
          '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.error.main, 0.25)}` },
          '&.Mui-disabled': { backgroundColor: c.surfaceSunken },
        },
        input: {
          [theme.breakpoints.down('sm')]: { fontSize: 16 }, // prevents iOS zoom on focus
        },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginInline: 2, fontSize: '0.75rem' } } },
    MuiFormLabel: { styleOverrides: { root: { fontWeight: 600, fontSize: '0.8125rem', color: c.textSecondary } } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { ...agroGlass(theme), boxShadow: shadow.lg, borderRadius: agroRadius.md },
        option: { borderRadius: agroRadius.xs, margin: '0 4px' },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 11, opacity: 1, backgroundColor: c.borderStrong },
        thumb: { boxShadow: shadow.sm },
        switchBase: {
          '&.Mui-checked + .MuiSwitch-track': { opacity: 1 },
        },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { borderRadius: agroRadius.xs } } },

    /* ---------- Data display ---------- */
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: agroRadius.lg,
          border: `1px solid ${c.border}`,
          backgroundColor: c.surface,
          overflowX: 'auto',
        },
      },
    },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-head': { backgroundColor: c.surfaceSunken } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${c.border}`,
          fontVariantNumeric: 'tabular-nums',
          paddingBlock: 10,
        },
        head: {
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: c.textSecondary,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition,
          '&.MuiTableRow-hover:hover': { backgroundColor: theme.palette.action.hover },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: c.primarySoft },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: agroRadius.pill, fontWeight: 600, fontSize: '0.75rem' },
        sizeSmall: { height: 24 },
        outlined: { borderColor: c.borderStrong },
      },
    },
    MuiBadge: { styleOverrides: { badge: { fontWeight: 700, fontSize: '0.6875rem' } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 700, fontSize: '0.875rem' } } },
    MuiDivider: { styleOverrides: { root: { borderColor: c.border } } },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: agroRadius.pill, height: 6, backgroundColor: c.primarySoft } },
    },
    MuiSkeleton: { defaultProps: { animation: 'wave' } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: agroRadius.md, alignItems: 'center', fontSize: '0.875rem' },
        standardSuccess: { border: `1px solid ${alpha(theme.palette.success.main, 0.25)}` },
        standardInfo: { border: `1px solid ${alpha(theme.palette.info.main, 0.25)}` },
        standardWarning: { border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}` },
        standardError: { border: `1px solid ${alpha(theme.palette.error.main, 0.25)}` },
      },
    },

    /* ---------- Navigation ---------- */
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 42 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0' },
        flexContainer: { gap: 4 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 42,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: c.textSecondary,
          paddingInline: 14,
          '&.Mui-selected': { color: theme.palette.text.primary },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: agroRadius.sm,
          transition,
          '&.Mui-selected': {
            backgroundColor: c.primarySoft,
            color: primary,
            '& .MuiListItemIcon-root': { color: primary },
            '&:hover': { backgroundColor: c.primarySoft },
          },
        },
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 36, color: c.textSecondary } } },
    MuiBottomNavigation: {
      styleOverrides: { root: { ...agroGlass(theme), borderInline: 0, borderBottom: 0, height: 60 } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: { minWidth: 0, '&.Mui-selected': { color: primary } },
        label: { fontSize: '0.6875rem', fontWeight: 600, '&.Mui-selected': { fontSize: '0.6875rem' } },
      },
    },
    MuiBreadcrumbs: { styleOverrides: { root: { fontSize: '0.8125rem' } } },
    MuiSnackbar: { styleOverrides: { root: { zIndex: agroZIndex.snackbar } } },
    MuiSnackbarContent: {
      styleOverrides: { root: { borderRadius: agroRadius.md, boxShadow: shadow.lg } },
    },
  }
}
