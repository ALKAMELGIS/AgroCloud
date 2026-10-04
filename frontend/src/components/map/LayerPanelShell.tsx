import { Box, Divider, List, ListSubheader, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { SectionHeader } from '../layout/SectionHeader'

export type LayerPanelSection = {
  id: string
  title: string
  children: ReactNode
}

/**
 * GIS / raster layer panel chrome — business logic and layer rows stay in modules/gis.
 */
export function LayerPanelShell({
  title = 'Layers',
  sections,
  footer,
}: {
  title?: string
  sections: LayerPanelSection[]
  footer?: ReactNode
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ px: 2, pt: 2 }}>
        <SectionHeader title={title} />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {sections.map((s) => (
          <List
            key={s.id}
            dense
            subheader={<ListSubheader component="div">{s.title}</ListSubheader>}
          >
            {s.children}
          </List>
        ))}
      </Box>
      {footer ? (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>{footer}</Box>
        </>
      ) : null}
    </Box>
  )
}

export function LayerPanelPlaceholder({ name }: { name: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
      {name}
    </Typography>
  )
}
