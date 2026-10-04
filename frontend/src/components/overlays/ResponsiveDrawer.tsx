import { Drawer, SwipeableDrawer, useMediaQuery, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

export function ResponsiveDrawer({
  open,
  onClose,
  onOpen,
  children,
  anchor = 'right',
  width = 360,
}: {
  open: boolean
  onClose: () => void
  onOpen?: () => void
  children: ReactNode
  anchor?: 'left' | 'right' | 'bottom'
  width?: number
}) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))

  if (mobile && anchor === 'bottom') {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={onOpen ?? (() => undefined)}
        disableSwipeToOpen
        PaperProps={{ sx: { maxHeight: '85vh', borderTopLeftRadius: 12, borderTopRightRadius: 12 } }}
      >
        {children}
      </SwipeableDrawer>
    )
  }

  return (
    <Drawer
      anchor={anchor === 'bottom' ? 'right' : anchor}
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: mobile ? 'min(100vw, 400px)' : width } }}
    >
      {children}
    </Drawer>
  )
}
