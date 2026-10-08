import { describe, expect, it } from 'vitest'
import {
  DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M,
  developEliteAgroStructureExtrusionHeightM,
  developEliteMapLibreStructuresExtrusionPaint,
  developEliteMapLibreHiddenHitFillPaint,
  developEliteDrawingInfoUsesPictureMarkers,
  developEliteMapLibreInvisibleCircleHitPaint,
  developEliteMapLibreStructuresPaint,
} from './developEliteMapLibreArcgisSymbology'

describe('developEliteAgroStructureExtrusionHeightM', () => {
  it('extrudes greenhouse structure types to 7 m', () => {
    for (const [value, label] of [
      ['1000', 'Greenhouse'],
      ['1001', 'Nethouse'],
      ['1002', 'Glasshouse'],
      ['1003', 'Retractable Roof Houses'],
      ['1004', 'Cravo'],
    ] as const) {
      expect(developEliteAgroStructureExtrusionHeightM({ value, label, hollow: false })).toBe(7)
    }
  })

  it('keeps outline-only structure types flat in 3D', () => {
    expect(
      developEliteAgroStructureExtrusionHeightM({ value: '1005', label: 'Dates Farm', hollow: true }),
    ).toBe(0)
    expect(developEliteAgroStructureExtrusionHeightM({ value: '1006', label: 'PIVOT', hollow: true })).toBe(0)
    expect(
      developEliteAgroStructureExtrusionHeightM({ value: '1007', label: 'Farm Plots', hollow: true }),
    ).toBe(0)
  })
})

describe('developEliteDrawingInfoUsesPictureMarkers', () => {
  it('detects esriPMS unique-value renderers (AgroLocation)', () => {
    const drawingInfo = {
      renderer: {
        type: 'uniqueValue',
        field1: 'SUBTYPE',
        uniqueValueInfos: [
          {
            value: 1,
            symbol: {
              type: 'esriPMS',
              imageData:
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
              contentType: 'image/png',
              width: 18,
              height: 18,
            },
          },
        ],
      },
    }
    expect(developEliteDrawingInfoUsesPictureMarkers(drawingInfo)).toBe(true)
    expect(developEliteDrawingInfoUsesPictureMarkers(null)).toBe(false)
  })
})

describe('developEliteMapLibreInvisibleCircleHitPaint', () => {
  it('zeros all circle paint keys for identify-only layers', () => {
    const hit = developEliteMapLibreInvisibleCircleHitPaint(10)
    expect(hit['circle-opacity']).toBe(0)
    expect(hit['circle-color']).toBe('rgba(0,0,0,0)')
    expect(hit['circle-stroke-opacity']).toBe(0)
    expect(hit['circle-radius']).toBe(10)
  })
})

describe('developEliteMapLibreHiddenHitFillPaint', () => {
  it('keeps footprint queryable while visually hidden under extrusion', () => {
    const hit = developEliteMapLibreHiddenHitFillPaint({ 'fill-color': '#4ade80', 'fill-opacity': 0.88 })
    expect(hit['fill-opacity']).toBe(0.001)
    expect(hit['fill-color']).toBe('#4ade80')
  })
})

describe('developEliteMapLibreStructuresPaint', () => {
  it('raises low ArcGIS fill opacity for readable portfolio symbology', () => {
    const { fill } = developEliteMapLibreStructuresPaint({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueInfos: [
          {
            value: '1000',
            label: 'Greenhouse',
            symbol: { type: 'esriSFS', color: [76, 230, 0, 132], outline: { color: [110, 110, 110, 255], width: 1 } },
          },
        ],
      },
    })
    const op = fill['fill-opacity'] as unknown[]
    expect(op[0]).toBe('match')
    expect(op).toContain(0.88)
  })
})

describe('developEliteMapLibreStructuresExtrusionPaint', () => {
  it('maps Structure_Type codes 1000–1004 to 7 m in fill-extrusion-height', () => {
    const paint = developEliteMapLibreStructuresExtrusionPaint({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueGroups: [
          {
            heading: 'Structure_Type',
            classes: [
              { label: 'Greenhouse', symbol: { type: 'esriSFS', color: [76, 230, 0, 132] }, values: [['1000']] },
              { label: 'PIVOT', symbol: { type: 'esriSFS', color: [130, 130, 130, 0] }, values: [['1006']] },
            ],
          },
        ],
      },
    })
    const height = paint['fill-extrusion-height'] as unknown[]
    expect(height[0]).toBe('match')
    expect(height).toContain(DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M)
    expect(height).toContain('1000')
    expect(height).toContain(0)
  })
})
