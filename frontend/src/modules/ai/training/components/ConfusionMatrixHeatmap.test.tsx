import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfusionMatrixHeatmap, viridis } from './ConfusionMatrixHeatmap'

afterEach(cleanup)

/** Cell labels only — the colour bar repeats the maximum outside the grid. */
function cellValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.si-cm__value')].map(n => n.textContent ?? '')
}

describe('ConfusionMatrixHeatmap', () => {
  it('draws one cell per count with its value written in', () => {
    const { container } = render(
      <ConfusionMatrixHeatmap
        counts={[
          [869, 29],
          [108, 725],
        ]}
        labels={['Class 0', 'Class 6']}
      />,
    )
    expect(cellValues(container)).toEqual(['869', '29', '108', '725'])
    expect(screen.getByText('Predicted labels')).toBeTruthy()
    expect(screen.getByText('True labels')).toBeTruthy()
  })

  it('shortens large counts so cells stay readable', () => {
    const { container } = render(
      <ConfusionMatrixHeatmap counts={[[1_240_000, 25_000]]} labels={['Field']} />,
    )
    expect(cellValues(container)).toEqual(['1.2M', '25k'])
  })

  it('renders nothing without a matrix', () => {
    const { container } = render(<ConfusionMatrixHeatmap counts={[]} labels={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('maps the viridis ramp from dark purple to yellow', () => {
    expect(viridis(0)).toBe('rgb(68, 1, 84)')
    expect(viridis(1)).toBe('rgb(253, 231, 37)')
    expect(viridis(-5)).toBe(viridis(0))
    expect(viridis(Number.NaN)).toBe(viridis(0))
  })
})
