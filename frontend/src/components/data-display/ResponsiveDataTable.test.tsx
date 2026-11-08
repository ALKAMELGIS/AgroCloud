import { Button, Chip } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResponsiveDataTable } from './ResponsiveDataTable'

vi.mock('@mui/material', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mui/material')>()
  return { ...mod, useMediaQuery: () => true } // mobile card layout
})

afterEach(() => vi.restoreAllMocks())

describe('ResponsiveDataTable (mobile cards)', () => {
  it('renders rich cell content without invalid <p> nesting', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ResponsiveDataTable
        rows={[{ id: 'u1', name: 'Field Lead', status: 'Active' }]}
        columns={[
          { id: 'name', header: 'Name', mobilePrimary: true, render: (r) => <Chip label={r.name} /> },
          { id: 'status', header: 'Status', render: (r) => <Chip label={r.status} color="success" /> },
          { id: 'actions', header: 'Actions', render: () => <Button>Edit</Button> },
        ]}
      />,
    )
    expect(screen.getByText('Field Lead')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    expect(container.querySelector('p div, p button')).toBeNull()
    expect(consoleError.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'))).toEqual([])
  })
})
