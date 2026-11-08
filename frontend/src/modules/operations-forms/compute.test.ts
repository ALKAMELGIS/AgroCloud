import { describe, expect, it } from 'vitest'

import type { OpsForm } from './api'
import { applyComputed, isoWeek } from './compute'

const form = (fields: OpsForm['fields'], dateField = 'record_date') => ({ dateField, fields }) as unknown as OpsForm

/** Same fixtures as backend/tests/operationsRoutes.test.js — the two copies must agree. */
describe('computed columns (mirror of the server formulas)', () => {
  it('EC/pH drip total, drain % and total water', () => {
    const f = form([
      { key: 'drip_total_ml', computed: 'ecDripTotal' },
      { key: 'drain_pct', computed: 'ecDrainPct' },
      { key: 'total_water_m3', computed: 'ecTotalWater' },
    ] as OpsForm['fields'])
    expect(applyComputed(f, { drip_volume_ml: 900, drain_volume_ml: 5700, water_qty_m3: 4, cycles: 5 })).toMatchObject({
      drip_total_ml: 10800,
      drain_pct: 52.78,
      total_water_m3: 20,
    })
  })

  it('PPP cost and clear-to-harvest date', () => {
    const f = form([
      { key: 'cost', computed: 'pppCost' },
      { key: 'clear_to_harvest_date', computed: 'pppClearDate' },
    ] as OpsForm['fields'], 'application_date')
    expect(applyComputed(f, { application_date: '2025-09-10', phi_days: 1, rate_per_ha: 36, unit_price: 724.5 })).toMatchObject({
      cost: 26.082,
      clear_to_harvest_date: '2025-09-11',
    })
  })

  it('fertigation daily total and ISO week', () => {
    const f = form([
      { key: 'daily_total_m3', computed: 'fertigationDailyTotal' },
      { key: 'week_no', computed: 'weekNo' },
    ] as OpsForm['fields'])
    expect(applyComputed(f, { record_date: '2025-09-01', valves: 5, water_per_valve_m3: 80, frequency: 1 })).toMatchObject({
      daily_total_m3: 400,
      week_no: 36,
    })
    expect(isoWeek('2025-11-24')).toBe(48)
  })
})
