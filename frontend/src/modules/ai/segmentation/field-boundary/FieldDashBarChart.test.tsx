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

  it('uses horizontal x ticks when expanded', () => {
    render(
      <FieldDashBarChart
        expanded
        xTickLayout="horizontal"
        rows={[
          { label: 'Wheat', value: 4 },
          { label: 'Corn', value: 2 },
        ]}
        ariaLabel="Crop mix"
      />,
    )
    const wheat = screen.getByText('Wheat')
    expect(wheat.getAttribute('transform')).toBeNull()
    expect(wheat.getAttribute('text-anchor')).toBe('middle')
  })

  it('enables category scroll for wide horizontal charts', () => {
    const { container } = render(
      <FieldDashBarChart
        expanded
        categoryScroll
        xTickLayout="horizontal"
        rows={Array.from({ length: 12 }, (_, i) => ({
          label: `Field ${i + 1}`,
          value: 10 - i * 0.3,
        }))}
        ariaLabel="Area by field"
      />,
    )
    expect(container.querySelector('.si-field-dash__vbar--scroll')).toBeTruthy()
    expect(container.querySelectorAll('.si-field-dash__vbar-tick--horizontal').length).toBe(12)
  })

  it('rotates x ticks when horizontal labels would overlap', () => {
    render(
      <FieldDashBarChart
        expanded
        xTickLayout="horizontal"
        rows={[
          { label: 'Herbaceous', value: 72 },
          { label: 'Fallow / bare soil', value: 68 },
          { label: 'Dense herbaceous', value: 36 },
          { label: 'Uncultivated', value: 30 },
          { label: 'Tree crop', value: 17 },
          { label: 'Bare Soil', value: 7 },
        ]}
        ariaLabel="Crop type field count"
      />,
    )
    const herb = screen.getByText('Herbaceous')
    expect(herb.getAttribute('transform')).toMatch(/rotate\(-42/)
    expect(herb.getAttribute('text-anchor')).toBe('end')
  })

  it('renders afbv skin with horizontal category ticks', () => {
    render(
      <FieldDashBarChart
        skin="afbv"
        rows={[
          { label: 'Train', value: 100 },
          { label: 'Val', value: 20 },
        ]}
        ariaLabel="Split"
      />,
    )
    expect(screen.getByText('Train')).toBeTruthy()
    expect(screen.getByText('Val')).toBeTruthy()
    expect(document.querySelector('.si-afbv__figure--vbar')).toBeTruthy()
  })
})
