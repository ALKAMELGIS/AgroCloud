import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldDashBarChart } from './FieldDashBarChart'

describe('FieldDashBarChart', () => {
  it('renders vertical bars with axis labels', () => {
    render(
      <FieldDashBarChart
        rows={[
          { label: 'Field 1', value: 5.2 },
          { label: 'Field 2', value: 3.1 },
        ]}
        ariaLabel="Area by field"
        yLabel="ha"
      />,
    )
    expect(screen.getByRole('img', { name: 'Area by field' })).toBeTruthy()
    expect(screen.getByText('F1')).toBeTruthy()
    expect(screen.getByText('F2')).toBeTruthy()
  })

  it('shows empty state when no rows', () => {
    render(<FieldDashBarChart rows={[]} ariaLabel="Empty chart" />)
    expect(screen.getByText('No data')).toBeTruthy()
  })
})
