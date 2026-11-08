/**
 * Runs the importer on the farm's real 2025-2026 workbooks when they are available locally
 * (OPS_REAL_FILES_DIR, default: the session attachments folder). Company data is never committed;
 * without the files this suite is skipped.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore -- plain-JS backend module: typed under the strict config only via this test
import { FORMS } from '../../../../../backend/server/operations/formSchemas.js'
import type { OpsForm } from '../api'
import { parseWorkbookData } from './parseWorkbook'

const DIR = process.env.OPS_REAL_FILES_DIR || '/mnt/user-data/attachments/4649963b-b5a0-5df4-88c5-040867b3d78a'
const find = (re: RegExp) => (fs.existsSync(DIR) ? fs.readdirSync(DIR).find(f => re.test(f)) : undefined)
const form = (id: string) => (FORMS as unknown as OpsForm[]).find(f => f.id === id)!
const load = (re: RegExp) => {
  const f = find(re)
  return f ? new Uint8Array(fs.readFileSync(path.join(DIR, f))) : null
}

const files = {
  harvest: load(/Harvesting_record/i),
  ecph: load(/EC__PH/i),
  ppp: load(/PPP_Application/i),
  irrigation: load(/Irrigation_and_Fertigation/i),
  fertigation: load(/Fertigation_Worksheet/i),
}

describe.skipIf(!files.harvest)('real workbooks', () => {
  it('harvest: every NH/GH/Open-field sheet, summaries skipped', () => {
    const r = parseWorkbookData(form('harvest'), files.harvest!, 'Harvest.xlsx')
    const imported = r.sheets.filter(s => s.status === 'imported').map(s => s.name)
    console.info('[harvest]', r.rows.length, 'rows from', imported.length, 'sheets; skipped:', r.sheets.filter(s => s.status === 'skipped').map(s => `${s.name} (${s.reason})`).join('; '))
    expect(imported).toContain('NH 1')
    expect(imported).toContain('GH - 02')
    expect(r.sheets.find(s => s.name === 'Summary')?.status).toBe('skipped')
    const first = r.rows.find(x => x.batch_no === '25PSVF-U1V01-1200013' && x.location === 'NH 01')
    expect(first).toMatchObject({ harvest_date: '2025-12-05', start_time: '15:00', product: 'Capsicum Yellow', variety: 'Sven RZ', quantity_kg: 17, farm: 'Al Maha' })
    expect(r.rows.length).toBeGreaterThan(3000)
  })

  it('EC/pH: date filled down for the second valve', () => {
    const r = parseWorkbookData(form('ec_ph'), files.ecph!, 'EC.xlsx')
    console.info('[ec_ph]', r.rows.length, 'rows;', r.sheets.map(s => `${s.name}:${s.status}`).join(' '))
    const pair = r.rows.filter(x => x.record_date === '2025-09-18' && x.location === 'NH 14')
    expect(pair.map(x => x.valve)).toEqual(expect.arrayContaining(['1', '4']))
    expect(pair[0]).toMatchObject({ ec_in: 1.12, ph_in: 7.82, drip_volume_ml: 900, drain_volume_ml: 5700, record_time: '17:45' })
  })

  it('PPP: application record with times, product and PHI', () => {
    const r = parseWorkbookData(form('ppp'), files.ppp!, 'PPP.xlsx')
    console.info('[ppp]', r.rows.length, 'rows;', r.sheets.filter(s => s.status === 'imported').length, 'sheets')
    const row = r.rows.find(x => x.ppp_name === 'Mospilan' && x.application_date === '2025-09-10')
    expect(row).toMatchObject({ crop: 'Tomato', location: 'NURSERY', start_time: '07:00', end_time: '08:00', active_ingredient: 'Acetamiprid (acetamidin)', phi_days: 1 })
  })

  it('irrigation: wide location blocks become one row per location', () => {
    const r = parseWorkbookData(form('irrigation'), files.irrigation!, 'Irrigation.xlsx')
    console.info('[irrigation]', r.rows.length, 'rows; locations', new Set(r.rows.map(x => x.location)).size)
    expect(r.rows.find(x => x.record_date === '2025-09-09' && x.location === 'NH 01')).toMatchObject({ water_qty_m3: 119, frequency: 1, method: 'Drip', operator: 'Tara' })
    expect(r.rows.find(x => x.record_date === '2025-09-10' && x.location === 'NH 04')).toMatchObject({ water_qty_m3: 116 })
    expect(r.rows.some(x => x.record_date === '2025-09-01' && x.location === 'NH 01')).toBe(false) // NH 01 had no water that day
  })

  it('fertigation worksheet: Input File entries and Fertilizer Issue unpivoted', () => {
    const entries = parseWorkbookData(form('fertigation'), files.fertigation!, 'Fertigation.xlsx')
    console.info('[fertigation]', entries.rows.length, 'rows;', entries.sheets.map(s => `${s.name}:${s.status}`).join(' '))
    expect(entries.sheets.find(s => s.name === 'Input File')?.status).toBe('imported')
    expect(entries.sheets.find(s => s.name === 'Allocation File')?.status).toBe('skipped')
    expect(entries.rows.find(x => x.record_date === '2025-09-09' && x.location === 'NH 01')).toMatchObject({ station: 'PR-01', system: 'Netajet 01', valves: 4, crop: 'Capsicum Yellow' })

    const issues = parseWorkbookData(form('fertilizer_issue'), files.fertigation!, 'Fertigation.xlsx')
    console.info('[fertilizer_issue]', issues.rows.length, 'rows')
    const sept7 = issues.rows.filter(x => x.issue_date === '2025-09-07')
    expect(sept7.map(x => x.fertilizer)).toEqual(expect.arrayContaining(['MKP', 'MAP']))
    expect(sept7.find(x => x.fertilizer === 'MKP')).toMatchObject({ quantity: 6, pump_room: 'PR-01', farm: 'Al Maha', uom: 'Kg' })
  })
})

describe('normalisers', () => {
  it('locations and farms', async () => {
    const { normalizeLocation, normalizeFarm } = await import('./parseWorkbook')
    expect(normalizeLocation('NH 1')).toBe('NH 01')
    expect(normalizeLocation('nh-14')).toBe('NH 14')
    expect(normalizeLocation('BL 4 ( v6-v10)')).toBe('BL 04 (V6-V10)')
    expect(normalizeLocation('Open Field')).toBe('Open Field')
    expect(normalizeFarm('Al Maha NH 1')).toBe('Al Maha')
    expect(normalizeFarm('Al- Maha')).toBe('Al Maha')
    expect(normalizeFarm('Al Maha Net House')).toBe('Al Maha')
  })
})
