import { describe, expect, it } from 'vitest'
import { sanitizeMapboxColorExpression, sanitizeMapboxPaint } from './mapboxPaintSanitize'

describe('mapboxPaintSanitize', () => {
  it('replaces null literals with fallback', () => {
    expect(sanitizeMapboxColorExpression(null)).toBe('rgba(0,0,0,0)')
  })

  it('wraps bare get expressions with to-color', () => {
    expect(sanitizeMapboxColorExpression(['get', 'fillColor'])).toEqual([
      'to-color',
      ['get', 'fillColor'],
      'rgba(0,0,0,0)',
    ])
  })

  it('converts coalesce chains to to-color so invalid property values are skipped', () => {
    expect(sanitizeMapboxColorExpression(['coalesce', ['get', 'strokeColor'], '#4ade80'])).toEqual([
      'to-color',
      ['get', 'strokeColor'],
      '#4ade80',
    ])
  })

  it('appends fallback when a coalesce chain has no literal fallback', () => {
    expect(sanitizeMapboxColorExpression(['coalesce', ['get', 'a'], ['get', 'b']])).toEqual([
      'to-color',
      ['get', 'a'],
      ['get', 'b'],
      'rgba(0,0,0,0)',
    ])
  })

  it('keeps coalesce when it contains interpolate (not valid inside to-color)', () => {
    const interp = ['interpolate', ['linear'], ['zoom'], 0, '#000000', 10, '#ffffff']
    const out = sanitizeMapboxColorExpression(['coalesce', interp]) as unknown[]
    expect(out[0]).toBe('coalesce')
    expect(out[out.length - 1]).toBe('rgba(0,0,0,0)')
  })

  it('sanitizes match branch outputs', () => {
    const expr = ['match', ['get', 'type'], 'a', null, 'b', '#ff0000', null] as any[]
    const out = sanitizeMapboxColorExpression(expr) as any[]
    expect(out[3]).toBe('rgba(0,0,0,0)')
    expect(out[5]).toBe('#ff0000')
    expect(out[6]).toBe('rgba(0,0,0,0)')
  })

  it('does not double-wrap to-color expressions', () => {
    expect(sanitizeMapboxColorExpression(['to-color', ['get', 'c'], '#fff'])).toEqual([
      'to-color',
      ['get', 'c'],
      '#fff',
    ])
  })

  it('sanitizes paint records', () => {
    const paint = sanitizeMapboxPaint({
      'fill-color': ['get', 'fillColor'],
      'fill-opacity': 0.5,
    })
    expect(paint['fill-opacity']).toBe(0.5)
    expect(paint['fill-color']).toEqual(['to-color', ['get', 'fillColor'], 'rgba(0,0,0,0)'])
  })
})
