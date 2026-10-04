import type { Components, Theme } from '@mui/material/styles'
import { agroZIndex } from './zIndex'

export function agroComponents(theme: Theme): Components<Omit<Theme, 'components'>> {
  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: theme.shape.borderRadius,
          [theme.breakpoints.down('sm')]: {
            minHeight: 44,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          [theme.breakpoints.down('sm')]: {
            padding: 10,
          },
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: {
          borderRadius: theme.shape.borderRadius,
          border: `1px solid ${theme.palette.divider}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          zIndex: agroZIndex.appBar,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          zIndex: agroZIndex.drawer,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: {
          zIndex: agroZIndex.modal,
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          zIndex: agroZIndex.snackbar,
        },
      },
    },
  }
}
