import { describe, expect, it } from 'vitest'
import {
  computeClassAreaRows,
  layerSupportsClassArea,
  pixelAreaM2ForResolution,
} from './siLayerClassAreaEngine'
import {
  isLulcTimeSeriesSelection,
  sampleLulcClassAreaDates,
  buildLulcClassCompositionStats,
  lulcCompositionTotalPixels,
} from './siLulcClassAreaLive'
import {
  LULC_CLASS_AREA_MAX_DATES,
  LULC_MAP_CLASSES,
  LULC_NATIVE_GSD_M,
} from './siLulcClassification'
import {
  LULC_HISTOGRAM_BIN_EDGES,
  buildLulcHistogramEvalscript,
} from './siLulcClassificationEvalscript'

describe('LULC class-area math', () => {
  it('uses 10 m native GSD → 100 m² per pixel', () => {
    expect(pixelAreaM2ForResolution(LULC_NATIVE_GSD_M)).toBe(100)
  })

  it('converts histogram bin counts to ha and m² by class', () => {
    const classCount = LULC_MAP_CLASSES.length
    const bins = Array.from({ length: classCount }, (_, i) => ({
      lowEdge: i,
      highEdge: i + 1,
      count: i === 3 ? 250 : i === 0 ? 50 : 0, // crops=3, water=0
    }))
    const { rows, totalCount, analyzedAreaM2 } = computeClassAreaRows(
      { bins, underflow: 0, overflow: 0, sampleCount: 300 },
      classCount,
      100,
    )
    expect(totalCount).toBe(300)
    expect(analyzedAreaM2).toBe(30_000)
    const water = rows[0]!
    const crops = rows[3]!
    expect(water.count).toBe(50)
    expect(water.areaM2).toBe(5_000)
    expect(water.areaHa).toBe(0.5)
    expect(crops.count).toBe(250)
    expect(crops.areaM2).toBe(25_000)
    expect(crops.areaHa).toBe(2.5)
    expect(LULC_MAP_CLASSES[3]!.key).toBe('crops')
  })

  it('samples observation dates evenly up to the max', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      return d.toISOString().slice(0, 10)
    })
    const sampled = sampleLulcClassAreaDates(dates, LULC_CLASS_AREA_MAX_DATES)
    expect(sampled.length).toBe(LULC_CLASS_AREA_MAX_DATES)
    expect(sampled[0]).toBe(dates[0])
    expect(sampled[sampled.length - 1]).toBe(dates[dates.length - 1])
    expect(sampleLulcClassAreaDates(dates, 1)).toEqual([dates[dates.length - 1]])
    expect(isLulcTimeSeriesSelection(['LULC'])).toBe(true)
    expect(isLulcTimeSeriesSelection(['NDVI'])).toBe(false)
    expect(layerSupportsClassArea('LULC')).toBe(true)
  })
  it('builds class composition stats with pixel count and % of total', () => {
    const series = [
      { layerId: 'LULC:water', label: 'Water', color: '#419BDF', values: [0.5] },
      { layerId: 'LULC:trees', label: 'Trees', color: '#397D49', values: [12.75] },
      { layerId: 'LULC:crops', label: 'Crops', color: '#F5C518', values: [7.25] },
      { layerId: 'LULC:built', label: 'Built Area', color: '#E53935', values: [1.75] },
      { layerId: 'LULC:rangeland', label: 'Rangeland', color: '#C4A574', values: [2.75] },
    ]
    const present = buildLulcClassCompositionStats(series, 0, { includeAllClasses: false })
    expect(present).toHaveLength(5)
    const trees = present.find(s => s.key === 'trees')!
    expect(trees.shortLabel).toBe('Trees')
    expect(trees.pctOfTotal).toBeCloseTo(51, 0)
    expect(trees.pixelCount).toBe(1275)
    expect(lulcCompositionTotalPixels(present)).toBe(2500)

    const all = buildLulcClassCompositionStats(series, 0, { includeAllClasses: true })
    expect(all).toHaveLength(LULC_MAP_CLASSES.length)
    expect(all.map(r => r.key)).toEqual(LULC_MAP_CLASSES.map(c => c.key))
    expect(all.find(r => r.key === 'flooded')?.pctOfTotal).toBe(0)
  })

  it('maps sparse histogram bins by lowEdge (not array order)', () => {
    const { rows, totalCount } = computeClassAreaRows(
      {
        date: '2026-07-01',
        bins: [
          { lowEdge: 0, highEdge: 1, count: 50 },
          { lowEdge: 3, highEdge: 4, count: 250 },
          { lowEdge: 8, highEdge: 9, count: 100 },
        ],
        underflow: 999,
        overflow: 999,
        sampleCount: 400,
      },
      LULC_MAP_CLASSES.length,
      100,
      { matchByLowEdge: true, foldExtremes: false },
    )
    expect(totalCount).toBe(400)
    expect(rows[0]!.count).toBe(50) // water — underflow ignored
    expect(rows[3]!.count).toBe(250) // crops
    expect(rows[8]!.count).toBe(100) // rangeland
    expect(rows[1]!.count).toBe(0)
  })
})

describe('LULC histogram evalscript', () => {
  it('emits FLOAT32 idx output with contiguous class bins', () => {
    const script = buildLulcHistogramEvalscript()
    expect(script).toContain('//VERSION=3')
    expect(script).toContain('AGRO_CLASS_HISTOGRAM')
    expect(script).toContain('"mode":"lulc"')
    expect(script).toContain('sampleType: "FLOAT32"')
    expect(script).toContain('classifyLulc')
    expect(script).toContain('mosaicking: "ORBIT"')
    expect(LULC_HISTOGRAM_BIN_EDGES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
