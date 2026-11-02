import { Card, CardContent, Stack, Typography, Skeleton, Box } from '@mui/material'
import type { ReactNode } from 'react'

export type KpiCardProps = {
  title: string
  value: ReactNode
  unit?: string
  subtitle?: string
  icon?: ReactNode
  trend?: string
  loading?: boolean
  error?: string
}

export function KpiCard({ title, value, unit, subtitle, icon, trend, loading, error }: KpiCardProps) {
  if (loading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Skeleton width="60%" />
          <Skeleton width="40%" height={36} sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
          {title}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.5 }}>
          {icon ? <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box> : null}
          <Typography variant="h2" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {error ? '—' : value}
            {unit && !error ? (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {unit}
              </Typography>
            ) : null}
          </Typography>
        </Stack>
        {trend ? (
          <Typography variant="caption" color="success.main" display="block">
            {trend}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
        {error ? (
          <Typography variant="caption" color="error" display="block">
            {error}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  )
}
