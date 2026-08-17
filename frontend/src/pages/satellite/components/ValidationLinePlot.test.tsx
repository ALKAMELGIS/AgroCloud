import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ValidationLinePlot } from './ValidationLinePlot'

afterEach(cleanup)

const series = [
  {
    id: 'train',
    label: 'Train',
    color: '#1f77b4',
    points: [
      { x: 1, y: 1.2 },
      { x: 2, y: 0.8 },
      { x: 3, y: 0.4 },
    ],
  },
  {
    id: 'val',
    label: 'Val',
    color: '#ff7f0e',
    points: [
      { x: 1, y: 1.1 },
      { x: 2, y: 0.7 },
      { x: 3, y: 0.5 },
    ],
  },
]

describe('ValidationLinePlot', () => {
  it('shows a hover tooltip with series values near a point', () => {
    const { container } = render(
      <ValidationLinePlot
        series={series}
        xLabel="Epochs"
        yLabel="Loss"
        ariaLabel="Loss chart"
        width={260}
        height={168}
      />,
    )
    const svg = container.querySelector('svg.si-afbv__figure') as SVGSVGElement
    expect(svg).toBeTruthy()
    // jsdom has no layout — stub the SVG box so client→viewBox mapping works.
    svg.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 168,
        right: 260,
        width: 260,
        height: 168,
        toJSON: () => ({}),
      }) as DOMRect

    fireEvent.mouseMove(svg, { clientX: 120, clientY: 80 })
    const tip = screen.getByRole('status')
    expect(tip).toBeTruthy()
    expect(tip.textContent).toMatch(/Epochs\s*2/)
    expect(tip.textContent).toContain('Train')
    expect(tip.textContent).toContain('Val')
    expect(tip.textContent).toContain('0.80')
    expect(tip.textContent).toContain('0.70')

    fireEvent.mouseLeave(svg)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
