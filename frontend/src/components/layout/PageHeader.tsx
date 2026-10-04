import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

export type PageHeaderBreadcrumb = { label: string; to?: string }

export type PageHeaderProps = {
  title: string
  description?: string
  breadcrumbs?: PageHeaderBreadcrumb[]
  actions?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
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
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
      </Stack>
    </Stack>
  )
}
