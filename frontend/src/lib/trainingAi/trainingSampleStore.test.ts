import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRAINING_CLASSES,
  countByClass,
  distinctClassCount,
  geometryTypeOf,
  parseTrainingPointsCsv,
  parseTrainingSamplesGeoJson,
  samplesToFeatureCollection,
} from './trainingSampleStore'
import { detectOverfitting } from './trainingAiClient'

describe('trainingSampleStore', () => {
  it('counts samples by class and distinct classes', () => {
    const samples = [
      {
        sample_id: 'a',
        class_id: 1,
        class_name: 'Field Boundaries',
        geometry: { type: 'Point' as const, coordinates: [0, 0] },
        geometry_type: 'Point' as const,
        image_id: 's2',
        source: 'sentinel-2',
        created_at: new Date().toISOString(),
      },
      {
        sample_id: 'b',
        class_id: 3,
        class_name: 'Water',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        geometry_type: 'Polygon' as const,
        image_id: 's2',
        source: 'sentinel-2',
        created_at: new Date().toISOString(),
      },
    ]
    expect(distinctClassCount(samples)).toBe(2)
    expect(DEFAULT_TRAINING_CLASSES[0]?.class_name).toBe('Field Boundaries')
    const counts = countByClass(samples, DEFAULT_TRAINING_CLASSES)
    expect(counts.find(c => c.class_name === 'Field Boundaries')?.count).toBe(1)
    expect(counts.find(c => c.class_name === 'Water')?.count).toBe(1)
    const fc = samplesToFeatureCollection(samples, DEFAULT_TRAINING_CLASSES)
    expect(fc.features).toHaveLength(2)
    expect(geometryTypeOf(samples[0]!.geometry)).toBe('Point')
  })

  it('imports GeoJSON save packages and CSV points', () => {
    const geo = parseTrainingSamplesGeoJson(
      {
        type: 'FeatureCollection',
        properties: {
          classes: [{ class_id: 6, class_name: 'Tree', color: '#15803d' }],
        },
        features: [
          {
            type: 'Feature',
            properties: { sample_id: 's1', class_id: 6, class_name: 'Tree' },
            geometry: { type: 'Point', coordinates: [55.1, 24.2] },
          },
        ],
      },
      DEFAULT_TRAINING_CLASSES,
    )
    expect(geo.importedCount).toBe(1)
    expect(geo.samples[0]?.class_name).toBe('Tree')
    expect(geo.classes.some(c => c.class_id === 6 && c.class_name === 'Tree')).toBe(true)

    const csv = parseTrainingPointsCsv(
      'sample_id,class_id,class_name,lon,lat\np1,3,Water,55.2,24.1\n',
      DEFAULT_TRAINING_CLASSES,
    )
    expect(csv.importedCount).toBe(1)
    expect(csv.samples[0]?.geometry_type).toBe('Point')
    expect(csv.samples[0]?.class_name).toBe('Water')
  })

  it('imports Excel (.xlsx) point rows', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['lon', 'lat', 'class_id', 'class_name'],
      [55.2, 25.3, 6, 'Tree'],
    ])
    XLSX.utils.book_append_sheet(wb, sheet, 'samples')
    const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = new File([ab], 'samples.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const { parseTrainingPointsXlsx } = await import('./trainingSampleStore')
    const result = await parseTrainingPointsXlsx(file, DEFAULT_TRAINING_CLASSES)
    expect(result.importedCount).toBe(1)
    expect(result.samples[0]?.class_name).toBe('Tree')
    expect(result.samples[0]?.source).toBe('import-xlsx')
  })
})

describe('detectOverfitting', () => {
  it('flags train↓ val↑ pattern', () => {
    expect(
      detectOverfitting([
        { train_loss: 1.0, val_loss: 1.0 },
        { train_loss: 0.8, val_loss: 1.1 },
        { train_loss: 0.6, val_loss: 1.3 },
        { train_loss: 0.4, val_loss: 1.6 },
      ]),
    ).toBe(true)
  })
})
