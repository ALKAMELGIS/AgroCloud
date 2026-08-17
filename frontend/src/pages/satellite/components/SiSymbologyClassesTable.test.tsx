import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiSymbologyClassesTable } from './SiSymbologyClassesTable'
import type { SymbologyContext } from '../symbologyHelpers'

afterEach(cleanup)

const symbologyCtx: SymbologyContext = {
  categories: ['Wheat', 'Corn'],
  categoryColors: { Wheat: '#aabbcc', Corn: '#ddeeff' },
  categoryLabels: {},
  categoryCounts: { Wheat: 3, Corn: 2 },
  categoryHidden: {},
  uniqueDashes: {},
  dotDashes: [],
  breakLabels: [],
  otherColor: '#94a3b8',
  threshold: Number.NaN,
  breaks: [],
  colors: [],
  widths: [],
}

describe('SiSymbologyClassesTable', () => {
  it('renders unique classes and calls change handler on color edit', () => {
    const onClassOverrideChange = vi.fn()
    render(
      <SiSymbologyClassesTable
        mode="unique"
        symbologyCtx={symbologyCtx}
        classOverrides={{}}
        onClassOverrideChange={onClassOverrideChange}
        onBreakOverrideChange={() => {}}
      />,
    )

    expect(screen.getByText('Wheat')).toBeTruthy()
    expect(screen.getByText('Corn')).toBeTruthy()

    const colorInputs = screen.getAllByLabelText(/Color for/)
    fireEvent.change(colorInputs[0]!, { target: { value: '#123456' } })

    expect(onClassOverrideChange).toHaveBeenCalledWith('Wheat', expect.objectContaining({ color: '#123456' }))
  })
})
