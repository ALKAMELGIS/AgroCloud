import { describe, expect, it } from 'vitest';
import {
  buildSiImageryFieldAoiOptionGroups,
  flattenImageryFieldAoiOptions,
  isImageryFieldAoiActionKey,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAW_AOI_ACTION_KEY,
} from './siImageryTimeSeriesAoi';

describe('siImageryTimeSeriesAoi', () => {
  it('builds field and aoi groups together', () => {
    const groups = buildSiImageryFieldAoiOptionGroups(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'A4' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
            },
          },
        ],
      },
      [
        {
          id: 'fld-1',
          name: 'Saved Field 1',
          geometry: {
            type: 'Polygon',
            coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]],
          },
          style: { fillColor: '#000', strokeColor: '#000', strokeWidth: 1, fillOpacity: 0 },
          areaHa: 1,
          perimeterM: 100,
          centroid: [2.5, 2.5],
        },
      ],
      {
        type: 'Polygon',
        coordinates: [[[4, 4], [5, 4], [5, 5], [4, 4]]],
      },
    );

    expect(groups.fields.length).toBeGreaterThan(0);
    expect(groups.aoi.some(o => o.fieldKey === SI_IMAGERY_DRAW_AOI_ACTION_KEY)).toBe(true);
    expect(groups.aoi.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY && !o.disabled)).toBe(true);
    expect(groups.aoi.some(o => o.fieldKey === 'fld-1')).toBe(true);

    const flat = flattenImageryFieldAoiOptions(groups);
    expect(flat.some(o => o.fieldKey === SI_IMAGERY_DRAW_AOI_ACTION_KEY)).toBe(false);
    expect(isImageryFieldAoiActionKey(SI_IMAGERY_DRAW_AOI_ACTION_KEY)).toBe(true);
  });

  it('disables current map aoi when geometry missing', () => {
    const groups = buildSiImageryFieldAoiOptionGroups(null, [], null);
    const current = groups.aoi.find(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY);
    expect(current?.disabled).toBe(true);
  });
});
