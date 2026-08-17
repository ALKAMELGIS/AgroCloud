/**
 * Default symbology for Agri Field Boundary extraction — matches SI gallery `poly-cyan-outline`.
 */
export const FIELD_BOUNDARY_STROKE_COLOR = '#22d3ee'
export const FIELD_BOUNDARY_STROKE_WIDTH = 2
export const FIELD_BOUNDARY_FILL_COLOR = '#22d3ee'
export const FIELD_BOUNDARY_POLYGON_FILL_ALPHA = 0

export function fieldBoundaryOutlineLayerStyle(): {
  color: string
  fillColor: string
  weight: number
  strokeStyle: 'solid'
  polygonFillAlpha: number
  fillStyle: 'solid'
} {
  return {
    color: FIELD_BOUNDARY_STROKE_COLOR,
    fillColor: FIELD_BOUNDARY_FILL_COLOR,
    weight: FIELD_BOUNDARY_STROKE_WIDTH,
    strokeStyle: 'solid',
    polygonFillAlpha: FIELD_BOUNDARY_POLYGON_FILL_ALPHA,
    fillStyle: 'solid',
  }
}
