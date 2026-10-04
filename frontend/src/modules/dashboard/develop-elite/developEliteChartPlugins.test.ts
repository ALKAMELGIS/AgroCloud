import { describe, expect, it } from 'vitest'
import { layoutPieCalloutSide, layoutPieCallouts, pieCalloutPaddingForSize } from './developEliteChartPlugins'

describe('layoutPieCalloutSide', () => {
  it('separates labels that would otherwise sit on the same row', () => {
    const centers = layoutPieCalloutSide([80, 84, 90, 160], 0, 220, 22)
    expect(centers).not.toBeNull()
    const sorted = [...(centers ?? [])].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(22)
    }
  })

  it('refuses a stack that cannot fit without overlap', () => {
    expect(layoutPieCalloutSide([10, 12, 14, 16, 18], 0, 40, 22)).toBeNull()
  })
})

describe('pieCalloutPaddingForSize', () => {
  it('gives a tall pie canvas a circle much larger than the label gutters', () => {
    const pad = pieCalloutPaddingForSize(239, 322, 6, 8)
    const pie = Math.min(239 - pad.left - pad.right, 322 - pad.top - pad.bottom)
    expect(pie).toBeGreaterThan(200)
    expect(pad.top).toBeGreaterThanOrEqual(46)
  })
})

describe('layoutPieCallouts', () => {
  it('keeps every crop name intact and avoids vertical overlap', () => {
    const labels = ['Capsicum Red', 'Plum Tomato', 'Capsicum Orange', 'Capsicum Yellow']
    const boxes = layoutPieCallouts(
      labels.map((label, index) => ({
        label,
        value: 40 - index * 5,
        midAngle: -Math.PI / 2 + index * 0.18,
        preferredY: 90 + index * 4,
      })),
      130,
      { top: 8, bottom: 280, boxHeight: 24 },
      text => text.length * 6,
    )
    expect(boxes.map(box => box.label)).toEqual(labels)
    const ys = boxes.map(box => box.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(24)
    }
  })
})
