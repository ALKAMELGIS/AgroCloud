import { Dialog, DialogContent, DialogTitle, useMediaQuery, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

export function ResponsiveDialog({
  open,
  onClose,
  title,
  children,
  maxWidth = 'sm',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth={maxWidth}>
      {title ? <DialogTitle>{title}</DialogTitle> : null}
      <DialogContent>{children}</DialogContent>
    </Dialog>
  )
}
