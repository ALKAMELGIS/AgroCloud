import { describe, expect, it } from 'vitest'
import { DEFAULT_DEVELOP_ELITE_KPI_CARDS } from './developEliteDashboardConfig'
import {
  developEliteFiltersWithStructureSideType,
  developEliteKpiCardIsActive,
  developEliteKpiCardSpatialPatch,
  DEVELOP_ELITE_SIDE_STRUCTURE_TYPE_CODES,
} from './developEliteSpatialScope'
import type { DevelopEliteFilters } from './developEliteKpiEngine'

const baseFilters: DevelopEliteFilters = {
  country: 'all',
  zoneId: 'all',
  selectedFieldKey: null,
  locationSearch: '',
  structureTypeCode: null,
  structureTypeCodes: null,
  activeKpiCardId: null,
}

describe('developEliteSpatialScope', () => {
  it('maps CEF card to structure type codes patch', () => {
    const cef = DEFAULT_DEVELOP_ELITE_KPI_CARDS.find(c => c.id === 'total-cef')!
    expect(developEliteKpiCardSpatialPatch(cef)).toEqual({
      structureTypeCode: null,
      structureTypeCodes: cef.structureTypeCodes,
      activeKpiCardId: null,
    })
  })

  it('toggles side structure type filter', () => {
    const code = DEVELOP_ELITE_SIDE_STRUCTURE_TYPE_CODES.greenhouse
    const on = developEliteFiltersWithStructureSideType(baseFilters, code)
    expect(on.structureTypeCode).toBe(code)
    const off = developEliteFiltersWithStructureSideType(on, code)
    expect(off.structureTypeCode).toBeNull()
  })

  it('detects active KPI card selection', () => {
    const pivot = DEFAULT_DEVELOP_ELITE_KPI_CARDS.find(c => c.id === 'pivot')!
    const active = {
      ...baseFilters,
      structureTypeCode: 1006,
    }
    expect(developEliteKpiCardIsActive(pivot, active)).toBe(true)
  })
})
