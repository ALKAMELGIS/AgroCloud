import { Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export type SectionHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      justifyContent="space-between"
      spacing={1}
      sx={{ mb: 2 }}
    >
      <div>
        <Typography variant="h6" component="h2">{title}</Typography>
        {description ? (
          <Typography variant="caption" color="text.secondary">{description}</Typography>
        ) : null}
      </div>
      {actions}
    </Stack>
  )
}
