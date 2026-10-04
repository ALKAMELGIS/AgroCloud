import { Alert, Snackbar } from '@mui/material'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Snack = { severity: 'success' | 'info' | 'warning' | 'error'; message: string }

type SnackbarCtx = {
  showSnack: (severity: Snack['severity'], message: string) => void
}

const Ctx = createContext<SnackbarCtx | null>(null)

export function AppSnackbarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [snack, setSnack] = useState<Snack | null>(null)

  const showSnack = useCallback((severity: Snack['severity'], message: string) => {
    setSnack({ severity, message })
    setOpen(true)
  }, [])

  const value = useMemo(() => ({ showSnack }), [showSnack])

  return (
    <Ctx.Provider value={value}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={5000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'info'} onClose={() => setOpen(false)} variant="filled" sx={{ width: '100%' }}>
          {snack?.message ?? ''}
        </Alert>
      </Snackbar>
    </Ctx.Provider>
  )
}

export function useAppSnackbar(): SnackbarCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return { showSnack: () => undefined }
  }
  return ctx
}
