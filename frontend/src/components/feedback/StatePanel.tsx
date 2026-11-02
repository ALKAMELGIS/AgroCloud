import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined'
import type { ReactNode } from 'react'

export type StatePanelTone = 'empty' | 'error' | 'offline' | 'soon'

export type StatePanelProps = {
  tone?: StatePanelTone
  title: string
  description?: ReactNode
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  /** Render without the card surface (when already inside a card). */
  bare?: boolean
}

const toneIcon: Record<StatePanelTone, ReactNode> = {
  empty: <InboxOutlinedIcon />,
  error: <ErrorOutlineIcon />,
  offline: <CloudOffOutlinedIcon />,
  soon: <HourglassEmptyOutlinedIcon />,
}

/**
 * One consistent empty / error / service-offline / coming-soon block for every page.
 * Tinted icon tile + title + guidance + optional actions, centered, max 460px wide.
 */
export function StatePanel({
  tone = 'empty',
  title,
  description,
  icon,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  bare,
}: StatePanelProps) {
  const theme = useTheme()
  const color =
    tone === 'error'
      ? theme.palette.error.main
      : tone === 'offline'
        ? theme.palette.warning.main
        : tone === 'soon'
          ? theme.palette.secondary.main
          : theme.palette.primary.main

  const body = (
    <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ py: { xs: 5, sm: 7 }, px: 3 }} role={tone === 'error' ? 'alert' : 'status'}>
      <Box
        aria-hidden
        sx={{
          width: 56,
          height: 56,
          borderRadius: 3.5,
          display: 'grid',
          placeItems: 'center',
          color,
          bgcolor: alpha(color, 0.12),
          boxShadow: `inset 0 0 0 1px ${alpha(color, 0.18)}`,
          '& svg': { fontSize: 28 },
        }}
      >
        {icon ?? toneIcon[tone]}
      </Box>
      <Typography variant="h5" component="h2">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
          {description}
        </Typography>
      ) : null}
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 1, width: { xs: '100%', sm: 'auto' } }}>
          {actionLabel && onAction ? (
            <Button variant="contained" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Button variant="outlined" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  )

  if (bare) return body
  return <Paper variant="outlined" sx={{ borderRadius: 3.5 }}>{body}</Paper>
}
