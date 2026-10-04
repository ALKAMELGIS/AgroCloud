import { Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

export type ResponsiveColumn<T> = {
  id: string
  header: string
  render: (row: T) => ReactNode
  /** Shown as primary line on mobile cards */
  mobilePrimary?: boolean
}

export function ResponsiveDataTable<T extends { id: string | number }>({
  rows,
  columns,
  empty,
}: {
  rows: T[]
  columns: ResponsiveColumn<T>[]
  empty?: ReactNode
}) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (!rows.length) {
    return <>{empty ?? null}</>
  }

  if (mobile) {
    const primaryCol = columns.find((c) => c.mobilePrimary) ?? columns[0]
    return (
      <Stack spacing={1.5}>
        {rows.map((row) => (
          <Card key={row.id} variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2">{primaryCol.render(row)}</Typography>
              {columns
                .filter((c) => c.id !== primaryCol.id)
                .map((c) => (
                  <Stack key={c.id} direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{c.header}</Typography>
                    <Typography variant="body2">{c.render(row)}</Typography>
                  </Stack>
                ))}
            </CardContent>
          </Card>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.id}>{c.header}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((c) => (
                <TableCell key={c.id}>{c.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
