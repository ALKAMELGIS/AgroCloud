import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

export type PageHeaderBreadcrumb = { label: string; to?: string }

export type PageHeaderProps = {
  title: string
  description?: string
  /** Optional leading icon shown in a tinted tile. */
  icon?: ReactNode
  breadcrumbs?: PageHeaderBreadcrumb[]
  actions?: ReactNode
}

export function PageHeader({ title, description, icon, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <Stack spacing={1} component="header">
      {breadcrumbs?.length ? (
        <Breadcrumbs aria-label="breadcrumb" sx={{ fontSize: '0.8125rem' }}>
          {breadcrumbs.map((b, i) =>
            b.to ? (
              <Link key={i} component={RouterLink} to={b.to} underline="hover" color="inherit">
                {b.label}
              </Link>
            ) : (
              <Typography key={i} color="text.primary" variant="body2">
                {b.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      ) : null}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
      >
        <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
          {icon ? (
            <Box
              aria-hidden
              sx={(t) => ({
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                color: 'primary.main',
                bgcolor: alpha(t.palette.primary.main, 0.12),
                '& svg': { fontSize: 22 },
                '& i': { fontSize: 18 },
              })}
            >
              {icon}
            </Box>
          ) : null}
          <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" component="h1">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          ) : null}
          </Box>
        </Stack>
        {actions ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  )
}
