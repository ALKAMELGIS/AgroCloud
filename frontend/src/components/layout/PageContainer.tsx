import { Box, type BoxProps } from '@mui/material'
import type { ReactNode } from 'react'

export type PageContainerProps = {
  children: ReactNode
  /** `default` 1280px reading width, `wide` 1600px for tables/dashboards, `full` no cap. */
  width?: 'default' | 'wide' | 'full'
  sx?: BoxProps['sx']
}

const maxWidth = { default: 1280, wide: 1600, full: 'none' } as const

/** Standard page gutters + vertical rhythm. Use for every non-map page. */
export function PageContainer({ children, width = 'default', sx }: PageContainerProps) {
  return (
    <Box
      component="section"
      sx={[
        {
          width: '100%',
          maxWidth: maxWidth[width],
          mx: 'auto',
          boxSizing: 'border-box',
          px: { xs: 4, sm: 5, md: 6 },
          py: { xs: 4, sm: 6 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 4, sm: 5 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}
