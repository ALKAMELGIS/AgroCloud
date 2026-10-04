import { Box } from '@mui/material'
import { ResponsiveDrawer } from './ResponsiveDrawer'

/** Mobile-first bottom sheet — content slot only. */
export function BottomSheet({
  open,
  onClose,
  onOpen,
  children,
}: {
  open: boolean
  onClose: () => void
  onOpen?: () => void
  children: React.ReactNode
}) {
  return (
    <ResponsiveDrawer open={open} onClose={onClose} onOpen={onOpen} anchor="bottom">
      <Box sx={{ p: 2, pb: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>{children}</Box>
    </ResponsiveDrawer>
  )
}
