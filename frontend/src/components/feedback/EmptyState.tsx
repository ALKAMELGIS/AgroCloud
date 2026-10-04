import { Box, Button, Typography } from '@mui/material'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: ReactNode
}) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
      <Box sx={{ color: 'text.secondary', mb: 1 }}>{icon ?? <InboxOutlinedIcon sx={{ fontSize: 48 }} />}</Box>
      <Typography variant="h6">{title}</Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 420, mx: 'auto' }}>
          {description}
        </Typography>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="contained" sx={{ mt: 2 }} onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </Box>
  )
}
