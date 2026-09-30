import { describe, expect, it } from 'vitest'
import {
  buildCustomSymbologyLegendRows,
  buildSymbologyContext,
  coerceNumericFieldValue,
  getNumericFields,
  normalizeSymbologyForLayer,
} from './symbologyHelpers'

describe('coerceNumericFieldValue', () => {
  it('accepts numeric strings', () => {
    expect(coerceNumericFieldValue('1.25')).toBe(1.25)
    expect(coerceNumericFieldValue('  42  ')).toBe(42)
  })

  it('rejects non-numeric strings', () => {
    expect(coerceNumericFieldValue('abc')).toBeNull()
    expect(coerceNumericFieldValue('')).toBeNull()
  })
})

describe('getNumericFields', () => {
  it('treats numeric-looking strings as numeric', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { properties: { ndvi: '0.65' } },
        { properties: { ndvi: '0.72' } },
        { properties: { ndvi: '0.58' } },
      ],
    }
    expect(getNumericFields(geojson)).toContain('ndvi')
  })
})

describe('normalizeSymbologyForLayer', () => {
  it('defaults new layers to Single symbol so outline paints without Studio Apply', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ properties: { area_ha: 12, crop: 'Wheat' } }],
    }
    const cfg = normalizeSymbologyForLayer(geojson, 'upload', undefined, false)
    expect(cfg.style).toBe('single')
    expect(cfg.useArcGisOnline).toBe(false)
    expect(cfg.field).toBe('')
  })
})

describe('inferVisualizationFromArcgisRenderer', () => {
  it('defaults to Single symbol when there is no ArcGIS renderer', async () => {
    const { inferVisualizationFromArcgisRenderer } = await import('./symbologyHelpers')
    expect(inferVisualizationFromArcgisRenderer(null).style).toBe('single')
    expect(inferVisualizationFromArcgisRenderer({ type: 'simple' }).style).toBe('single')
  })
})

describe('buildCustomSymbologyLegendRows', () => {
  it('applies class override labels and colors', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ properties: { type: 'Barn' } }, { properties: { type: 'Silo' } }],
    }
    const cfg = normalizeSymbologyForLayer(
      geojson,
      undefined,
      {
        useArcGisOnline: false,
        style: 'unique',
        field: 'type',
        classes: 8,
        classOverrides: { Barn: { color: '#112233', label: 'Farm barn' } },
      },
      false,
    )
    const ctx = buildSymbologyContext(geojson, cfg)
    const rows = buildCustomSymbologyLegendRows(cfg, ctx)
    const barn = rows.find(r => r.label === 'Farm barn')
    expect(barn?.color).toBe('#112233')
  })

  it('omits hidden unique classes from legend', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ properties: { type: 'A' } }, { properties: { type: 'B' } }],
    }
    const cfg = normalizeSymbologyForLayer(
      geojson,
      undefined,
      {
        useArcGisOnline: false,
        style: 'unique',
        field: 'type',
        classes: 8,
        classOverrides: { A: { visible: false } },
      },
      false,
    )
    const ctx = buildSymbologyContext(geojson, cfg)
    const rows = buildCustomSymbologyLegendRows(cfg, ctx)
    expect(rows.some(r => r.label === 'A')).toBe(false)
    expect(rows.some(r => r.label === 'B')).toBe(true)
  })
})
