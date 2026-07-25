import { describe, expect, it } from 'vitest'
import {
  buildEsriD8FlowDirectionLegend,
  ESRI_D8_FLOW_DIRECTIONS,
  esriD8CodeFromDirIndex,
  esriD8RgbFromCode,
  esriD8RgbFromDirIndex,
} from './hydroFlowDirectionStyle'

describe('ESRI D8 flow direction style', () => {
  it('maps dir index 0…7 to ESRI power-of-two codes', () => {
    expect(esriD8CodeFromDirIndex(0)).toBe(1)
    expect(esriD8CodeFromDirIndex(6)).toBe(64)
    expect(esriD8CodeFromDirIndex(7)).toBe(128)
  })

  it('uses distinct colours for North (red) and East (green)', () => {
    const north = esriD8RgbFromCode(64)
    const east = esriD8RgbFromCode(1)
    expect(north[0]).toBeGreaterThan(200)
    expect(east[1]).toBeGreaterThan(150)
  })

  it('builds a legend with direction arrows and names', () => {
    const legend = buildEsriD8FlowDirectionLegend()
    expect(legend.swatches).toHaveLength(ESRI_D8_FLOW_DIRECTIONS.length + 1)
    expect(legend.swatches[0]?.label).toMatch(/→ East \(1\)/)
    expect(legend.swatches.some(s => s.label.includes('North'))).toBe(true)
    expect(legend.swatches.at(-1)?.label).toMatch(/Flat \/ sink/)
  })

  it('keeps dir-index and code colour lookups aligned', () => {
    for (const d of ESRI_D8_FLOW_DIRECTIONS) {
      expect(esriD8RgbFromDirIndex(d.dirIndex)).toEqual(d.rgb)
      expect(esriD8RgbFromCode(d.code)).toEqual(d.rgb)
    }
  })
})
