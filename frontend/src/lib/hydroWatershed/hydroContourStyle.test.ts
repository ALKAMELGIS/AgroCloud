import { describe, expect, it } from 'vitest'
import {
  buildContourElevationLegend,
  contourElevationClassEdges,
  contourElevationMapboxColorExpression,
  contourElevationStrokeColor,
  HYDRO_CONTOUR_ELEV_COLORS,
} from './hydroEngine'

describe('contour elevation styling', () => {
  it('colours low elevations blue and high elevations red', () => {
    expect(contourElevationStrokeColor(4, 4, 51).toLowerCase()).toBe(HYDRO_CONTOUR_ELEV_COLORS[0])
    expect(contourElevationStrokeColor(51, 4, 51).toLowerCase()).toBe(HYDRO_CONTOUR_ELEV_COLORS[4])
  })

  it('builds legend classes with elevation Ranges (High first = red)', () => {
    const legend = buildContourElevationLegend(4, 51, 2)
    expect(legend.title).toBe('Elevation Contours')
    expect(legend.swatches[0]?.color).toBe(HYDRO_CONTOUR_ELEV_COLORS[4])
    expect(legend.swatches[0]?.label).toMatch(/High elevation \d+–\d+ m/)
    expect(legend.swatches.some(s => /Low elevation \d+–\d+ m/.test(s.label))).toBe(true)
    expect(legend.note).toMatch(/4–51 m/)
  })

  it('produces Mapbox interpolate stops matching class edges', () => {
    const edges = contourElevationClassEdges(4, 51)
    const expr = contourElevationMapboxColorExpression(4, 51)
    expect(expr[0]).toBe('interpolate')
    expect(expr).toContain(edges[0])
    expect(expr).toContain(HYDRO_CONTOUR_ELEV_COLORS[4])
  })
})
