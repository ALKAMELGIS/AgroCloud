import { describe, expect, it } from 'vitest'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  buildNeighborhoodAgentChartSeries,
  liftBulletBreakdownFromText,
  pickNeighborhoodAgentNumericColumn,
  shouldAutoChartNeighborhoodAgentTable,
} from './neighborhoodAgentStatsViz'

function table(partial: Partial<GeoExplorerDataTablePayload> & Pick<GeoExplorerDataTablePayload, 'columns' | 'rows'>): GeoExplorerDataTablePayload {
  return { kind: 'markdown', title: 'Summary table', ...partial }
}

describe('neighborhoodAgentStatsViz', () => {
  const dubai = table({
    title: 'Nationality share',
    columns: [
      { key: 'group', label: 'Group', align: 'left' },
      { key: 'share_', label: 'Share %', align: 'right' },
    ],
    rows: [
      { values: { group: 'Indians', share_: 28 } },
      { values: { group: 'Pakistanis', share_: 12 } },
      { values: { group: 'Bangladeshis', share_: 6 } },
      { values: { group: 'Filipinos', share_: 5 } },
      { values: { group: 'Others', share_: 49 } },
    ],
  })

  it('picks percent column and builds chart series', () => {
    const pick = pickNeighborhoodAgentNumericColumn(dubai)
    expect(pick?.valueKey).toBe('share_')
    expect(shouldAutoChartNeighborhoodAgentTable(dubai)).toBe(true)
    const series = buildNeighborhoodAgentChartSeries(dubai)
    expect(series?.labels).toEqual(['Indians', 'Pakistanis', 'Bangladeshis', 'Filipinos', 'Others'])
    expect(series?.values).toEqual([28, 12, 6, 5, 49])
    expect(series?.title).toBe('Nationality share')
  })

  it('rejects single-row or non-numeric tables', () => {
    expect(
      shouldAutoChartNeighborhoodAgentTable(
        table({
          columns: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', align: 'right' },
          ],
          rows: [{ values: { a: 'Only', b: 1 } }],
        }),
      ),
    ).toBe(true)
    expect(
      buildNeighborhoodAgentChartSeries(
        table({
          columns: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B', align: 'right' },
          ],
          rows: [{ values: { a: 'Only', b: 1 } }],
        }),
      ),
    ).toBeNull()

    expect(
      shouldAutoChartNeighborhoodAgentTable(
        table({
          columns: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'Note' },
          ],
          rows: [
            { values: { a: 'x', b: 'y' } },
            { values: { a: 'p', b: 'q' } },
          ],
        }),
      ),
    ).toBe(false)
  })

  it('lifts percent bullets into a compact table (Dubai-style)', () => {
    const raw = `You're referring to the population of Dubai!

According to Dubai Statistics Center (2020), about 3.35 million people.

- **Total population:** around 3.35 million.
- **Emiratis (native Arabs):** around 12-15% (~400,000 people).
- **Expatriates (non-Arabs):** around 85-90% (~2.9-3.1 million people).

Nationalities (approximate):
- **Indians:** around 25-30%
- **Pakistanis:** around 10-15%
- **Bangladeshis:** around 5-7%
- **Filipinos:** around 4-6%
- **Others:** around 40-50%

These are estimates.`

    const { text, table: tbl } = liftBulletBreakdownFromText(raw)
    expect(tbl).not.toBeNull()
    expect(tbl!.rows.length).toBeGreaterThanOrEqual(5)
    expect(tbl!.columns[1]?.label).toBe('Share %')
    expect(text).toMatch(/3\.35 million/)
    expect(text).not.toMatch(/\*\*Indians:\*\*/)
    const series = buildNeighborhoodAgentChartSeries(tbl!)
    expect(series?.labels).toContain('Indians')
    expect(series?.values.some(v => v >= 20 && v <= 30)).toBe(true)
  })
})
