import { describe, expect, it } from 'vitest'
import {
  buildDefaultDevelopEliteGridLayouts,
  developEliteGridWidgetIds,
  alignDevelopEliteKpiCardsOnOneRow,
  normalizeDevelopEliteGridLayouts,
  rebalanceDevelopEliteKpiRow,
  stretchBodyColumnsToGridBottom,
} from './developEliteGridLayout'

describe('developEliteGridLayout', () => {
  it('includes hero, KPI cards, and body widgets in default layout', () => {
    const ids = developEliteGridWidgetIds(['total-cef', 'pivot'])
    expect(ids).toContain('kpi-hero-zone')
    expect(ids).toContain('kpi-hero')
    expect(ids).toContain('kpi-total-cef')
    expect(ids).toContain('map')

    const layouts = buildDefaultDevelopEliteGridLayouts(['total-cef', 'pivot'])
    const lgIds = layouts.lg?.map(item => item.i) ?? []
    expect(lgIds).toEqual(ids)
  })

  it('uses stacked defaults only on narrow breakpoints (ignores desktop saves)', () => {
    const kpiIds = ['total-cef']
    const defaults = buildDefaultDevelopEliteGridLayouts(kpiIds)
    const saved = {
      xs: defaults.lg?.map(item => (item.i.startsWith('kpi-') ? { ...item, y: 0, w: 4 } : item)),
    }
    const merged = normalizeDevelopEliteGridLayouts(saved, kpiIds)
    const xsKpis = merged.xs?.filter(i => i.i.startsWith('kpi-')) ?? []
    expect(new Set(xsKpis.map(i => i.y)).size).toBeGreaterThan(1)
    expect(xsKpis.every(i => i.w === (defaults.xs?.[0]?.w ?? 8))).toBe(true)
  })

  it('merges saved positions with defaults without dropping widgets', () => {
    const defaults = buildDefaultDevelopEliteGridLayouts(['total-cef'])
    const saved = {
      lg: defaults.lg?.map(item => (item.i === 'map' ? { ...item, x: 12, y: 4, w: 10, h: 8 } : item)),
    }
    const merged = normalizeDevelopEliteGridLayouts(saved, ['total-cef'])
    const map = merged.lg?.find(item => item.i === 'map')
    expect(map?.x).toBe(12)
    expect(map?.h).toBe(8)
  })

  it('keeps a shrink below the template minimum', () => {
    const defaults = buildDefaultDevelopEliteGridLayouts(['total-cef'])
    const mapDef = defaults.lg?.find(item => item.i === 'map')
    const saved = {
      lg: defaults.lg?.map(item => (item.i === 'map' ? { ...item, w: 1, h: 1 } : item)),
    }
    const merged = normalizeDevelopEliteGridLayouts(saved, ['total-cef'])
    const map = merged.lg?.find(item => item.i === 'map')
    expect(mapDef?.minH ?? 0).toBeGreaterThan(1)
    expect(map?.w).toBe(1)
    expect(map?.h).toBe(1)
    expect(merged.lg?.find(item => item.i === 'sidebar-farms')).toBeTruthy()
    expect(merged.lg?.find(item => item.i === 'sidebar-countries')).toBeTruthy()
  })

  it('uses Elite reference positions on lg breakpoint', () => {
    const kpiIds = ['total-cef', 'pivot', 'wildfelid', 'vip-farm', 'tree', 'total-projects']
    const lg = buildDefaultDevelopEliteGridLayouts(kpiIds).lg ?? []
    const farms = lg.find(i => i.i === 'sidebar-farms')
    const countries = lg.find(i => i.i === 'sidebar-countries')
    const map = lg.find(i => i.i === 'map')
    const table = lg.find(i => i.i === 'chart-table')
    expect(farms).toMatchObject({ x: 0, y: 2, w: 5 })
    expect(countries).toMatchObject({ x: 0, w: 5 })
    expect((farms?.h ?? 0) + (countries?.h ?? 0)).toBe(15)
    expect(map).toMatchObject({ x: 7, y: 2, w: 17, h: 10 })
    expect(table?.y).toBe(12)
    expect(table?.h).toBe(5)
  })

  it('gives KPI row slots equal width on lg', () => {
    const kpiIds = ['total-cef', 'pivot', 'wildfelid', 'vip-farm', 'tree', 'total-projects']
    const lg = buildDefaultDevelopEliteGridLayouts(kpiIds).lg ?? []
    const kpiWidths = lg.filter(i => i.i.startsWith('kpi-')).map(i => i.w)
    expect(new Set(kpiWidths).size).toBeLessThanOrEqual(2)
    expect(kpiWidths.reduce((a, b) => a + b, 0)).toBe(24)
  })

  it('lifts VIP Farm and Tree onto the KPI row and leaves the map', () => {
    const layout = [
      { i: 'kpi-hero', x: 0, y: 0, w: 5, h: 2 },
      { i: 'kpi-total-cef', x: 5, y: 0, w: 5, h: 2 },
      { i: 'kpi-pivot', x: 10, y: 0, w: 5, h: 2 },
      { i: 'kpi-total-projects', x: 15, y: 0, w: 5, h: 2 },
      { i: 'kpi-wildfelid', x: 20, y: 0, w: 4, h: 2 },
      { i: 'kpi-tree', x: 16, y: 2, w: 4, h: 2 },
      { i: 'kpi-vip-farm', x: 20, y: 2, w: 4, h: 2 },
      { i: 'map', x: 8, y: 2, w: 8, h: 10 },
    ]
    const out = alignDevelopEliteKpiCardsOnOneRow(layout, 24)
    const kpis = out.filter(item => item.i.startsWith('kpi-'))
    expect(new Set(kpis.map(item => item.y))).toEqual(new Set([0]))
    expect(kpis.reduce((sum, item) => sum + item.w, 0)).toBe(24)
    expect(out.find(item => item.i === 'map')).toMatchObject({ x: 8, y: 2, w: 8, h: 10 })
    expect(out.find(item => item.i === 'kpi-tree')?.x).toBeGreaterThan(
      out.find(item => item.i === 'kpi-wildfelid')?.x ?? 0,
    )
  })

  it('rebalances uneven KPI widths', () => {
    const layout = [
      { i: 'kpi-hero', x: 0, y: 0, w: 8, h: 3 },
      { i: 'kpi-total-cef', x: 8, y: 0, w: 4, h: 3 },
      { i: 'kpi-pivot', x: 12, y: 0, w: 12, h: 3 },
    ]
    const out = rebalanceDevelopEliteKpiRow(layout, 24)
    const widths = out.filter(i => i.i.startsWith('kpi-')).map(i => i.w)
    expect(widths).toEqual([8, 8, 8])
  })

  it('stretches sidebar column widgets to grid bottom for display', () => {
    const layout = [
      { i: 'sidebar-farms', x: 0, y: 3, w: 4, h: 4 },
      { i: 'sidebar-countries', x: 0, y: 7, w: 4, h: 2 },
      { i: 'structures', x: 4, y: 3, w: 2, h: 6 },
      { i: 'map', x: 6, y: 3, w: 18, h: 9 },
    ]
    const stretched = stretchBodyColumnsToGridBottom(layout, 17)
    expect(stretched.find(i => i.i === 'sidebar-farms')?.h).toBeGreaterThan(4)
    expect(stretched.find(i => i.i === 'sidebar-countries')?.h).toBeGreaterThan(2)
    expect(stretched.find(i => i.i === 'map')?.h).toBe(9)
  })
})
