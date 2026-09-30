import { describe, expect, it } from 'vitest';
import {
  arcgisDrawingInfoToCirclePaint,
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  buildArcgisUniqueValueLegendItems,
  collectUniqueValueMatchKeys,
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  resolveLayerArcgisDrawingInfo,
  sanitizeArcgisDrawingInfoForClient,
} from './arcgisDrawingInfoMapbox';

describe('flattenArcgisUniqueValueInfos', () => {
  it('returns uniqueValueInfos when present', () => {
    const renderer = {
      type: 'uniqueValue',
      uniqueValueInfos: [{ value: '1', symbol: { type: 'esriSMS', size: 8, color: [255, 0, 0, 255] } }],
    };
    expect(flattenArcgisUniqueValueInfos(renderer)).toHaveLength(1);
  });

  it('flattens uniqueValueGroups into uniqueValueInfos', () => {
    const renderer = {
      type: 'uniqueValue',
      field1: 'Structure_Type',
      uniqueValueGroups: [
        {
          heading: 'Structure_Type',
          classes: [
            {
              label: 'Greenhouse',
              symbol: { type: 'esriSMS', size: 10, color: [76, 230, 0, 255] },
              values: [['1000']],
            },
            {
              label: 'Nethouse',
              symbol: { type: 'esriSMS', size: 10, color: [168, 168, 0, 255] },
              values: [['1001']],
            },
          ],
        },
      ],
    };
    const flat = flattenArcgisUniqueValueInfos(renderer);
    expect(flat).toHaveLength(2);
    expect(flat[0]?.value).toBe('1000');
    expect(flat[1]?.value).toBe('1001');
  });
});

describe('arcgisDrawingInfoToCirclePaint', () => {
  it('builds match paint for uniqueValue without defaultSymbol', () => {
    const drawingInfo = {
      renderer: {
        type: 'uniqueValue',
        field1: 'Class',
        uniqueValueInfos: [
          { value: 1, symbol: { type: 'esriSMS', size: 10, color: [255, 0, 0, 255], outline: { color: [0, 0, 0, 255], width: 1 } } },
          { value: 2, symbol: { type: 'esriSMS', size: 12, color: [0, 255, 0, 255], outline: { color: [0, 0, 0, 255], width: 1 } } },
        ],
      },
    };
    const paint = arcgisDrawingInfoToCirclePaint(drawingInfo);
    expect(paint).not.toBeNull();
    expect(Array.isArray(paint?.['circle-color'])).toBe(true);
    const match = paint?.['circle-color'] as unknown[];
    expect(match?.[0]).toBe('match');
    expect(match).toContain('1');
    expect(match).toContain('2');
  });

  it('sanitizes uniqueValueGroups for client storage', () => {
    const di = sanitizeArcgisDrawingInfoForClient({
      renderer: {
        type: 'uniqueValue',
        field1: 'Type',
        uniqueValueGroups: [
          {
            classes: [{ label: 'A', symbol: { type: 'esriSMS', size: 8, color: [1, 2, 3, 255] }, values: [['1']] }],
          },
        ],
      },
    });
    const infos = (di?.renderer as any)?.uniqueValueInfos;
    expect(Array.isArray(infos)).toBe(true);
    expect(infos[0]?.value).toBe('1');
  });
});

describe('arcgisDrawingInfoToFillPaint', () => {
  it('matches unique values by code and label', () => {
    const paint = arcgisDrawingInfoToFillPaint({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueInfos: [
          {
            value: '1000',
            label: 'Greenhouse',
            symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [76, 230, 0, 255] },
          },
        ],
      },
    });
    const match = paint?.['fill-color'] as unknown[];
    expect(match).toContain('1000');
    expect(match).toContain('Greenhouse');
  });

  it('uses literal field names in has checks (expression args crash Mapbox on numeric values)', () => {
    const paint = arcgisDrawingInfoToFillPaint({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueInfos: [
          {
            value: '1000',
            label: 'Greenhouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [76, 230, 0, 132],
              outline: { color: [0, 0, 0, 255], width: 1 },
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(paint);
    expect(serialized).not.toContain('["has",["');
    expect(serialized).toContain('["has","Structure_Type"]');
    expect(paint?.['fill-outline-color']).toBeUndefined();
  });

  it('preserves ArcGIS fill rgb and alpha separately (no double-opacity)', () => {
    const paint = arcgisDrawingInfoToFillPaint({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueInfos: [
          {
            value: '1000',
            label: 'Greenhouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [76, 230, 0, 132],
              outline: { color: [110, 110, 110, 255], width: 0.7 },
            },
          },
        ],
      },
    });
    const colorMatch = paint?.['fill-color'] as unknown[];
    const opMatch = paint?.['fill-opacity'] as unknown[];
    expect(colorMatch).toContain('rgb(76,230,0)');
    expect(opMatch).toContain(132 / 255);
  });
});

describe('collectUniqueValueMatchKeys', () => {
  it('includes code, label, trimmed label, and lowercase variants', () => {
    const keys = collectUniqueValueMatchKeys('1006', 'PIVOT');
    expect(keys).toContain('1006');
    expect(keys).toContain('PIVOT');
    expect(keys).toContain('pivot');
  });

  it('trims trailing spaces in labels (Cravo subtype)', () => {
    const keys = collectUniqueValueMatchKeys('1004', 'Cravo ');
    expect(keys).toContain('1004');
    expect(keys).toContain('Cravo');
    expect(keys).not.toContain('Cravo ');
  });
});

describe('buildArcgisUniqueValueLegendItems', () => {
  it('returns all uniqueValueGroups subtypes for Agro_Structures-style renderer', () => {
    const items = buildArcgisUniqueValueLegendItems({
      renderer: {
        type: 'uniqueValue',
        field1: 'Structure_Type',
        uniqueValueGroups: [
          {
            heading: 'Structure_Type',
            classes: [
              { label: 'Greenhouse', symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [76, 230, 0, 132], outline: { color: [0, 0, 0, 255], width: 1 } }, values: [['1000']] },
              { label: 'PIVOT', symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [130, 130, 130, 0], outline: { color: [0, 0, 0, 255], width: 2 } }, values: [['1006']] },
            ],
          },
        ],
      },
    });
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(['Greenhouse', 'PIVOT']);
    expect(items.find(i => i.label === 'PIVOT')?.hollow).toBe(true);
  });
});

describe('arcgisDrawingInfoToLinePaint', () => {
  it('maps outline-only PIVOT subtype via line layer keys', () => {
    const paint = arcgisDrawingInfoToLinePaint(
      {
        renderer: {
          type: 'uniqueValue',
          field1: 'Structure_Type',
          uniqueValueInfos: [
            {
              value: '1006',
              label: 'PIVOT',
              symbol: {
                type: 'esriSFS',
                style: 'esriSFSSolid',
                color: [130, 130, 130, 0],
                outline: { color: [0, 0, 0, 255], width: 2 },
              },
            },
          ],
        },
      },
      '#94a3b8',
    );
    const match = paint?.['line-color'] as unknown[];
    expect(match).toContain('1006');
    expect(match).toContain('PIVOT');
    expect(match).toContain('pivot');
    expect(match).toContain('rgb(0,0,0)');
  });
});

describe('normalizeUniqueValueKey', () => {
  it('stringifies integers consistently', () => {
    expect(normalizeUniqueValueKey(1)).toBe('1');
    expect(normalizeUniqueValueKey('1')).toBe('1');
  });
});

describe('resolveLayerArcgisDrawingInfo', () => {
  const renderer = {
    type: 'uniqueValue',
    field1: 'Structure_Type',
    uniqueValueInfos: [
      {
        value: '1000',
        label: 'Greenhouse',
        symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [76, 230, 0, 255] },
      },
    ],
  };
  const bakedRenderer = {
    type: 'uniqueValue',
    field1: 'Structure_Type',
    uniqueValueInfos: [
      {
        value: '1000',
        label: 'Greenhouse',
        symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [255, 0, 0, 255] },
      },
    ],
  };

  it('prefers cached arcgisDrawingInfo on the layer', () => {
    const di = resolveLayerArcgisDrawingInfo({
      arcgisDrawingInfo: { renderer },
    });
    expect((di?.renderer as any)?.type).toBe('uniqueValue');
  });

  it('falls back to embedded definition drawingInfo', () => {
    const di = resolveLayerArcgisDrawingInfo({
      arcgisLayerDefinition: { drawingInfo: { renderer } },
    });
    expect((di?.renderer as any)?.field1).toBe('Structure_Type');
  });

  it('ignores baked arcgisDrawingInfo when useArcGisOnline is true', () => {
    const di = resolveLayerArcgisDrawingInfo({
      symbology: { useArcGisOnline: true },
      arcgisDrawingInfo: { renderer: bakedRenderer },
    });
    expect(di).toBeNull();
  });

  it('prefers arcgisDrawingInfoService when useArcGisOnline is true', () => {
    const di = resolveLayerArcgisDrawingInfo({
      symbology: { useArcGisOnline: true },
      arcgisDrawingInfo: { renderer: bakedRenderer },
      arcgisDrawingInfoService: { renderer },
    });
    expect(((di?.renderer as any)?.uniqueValueInfos?.[0]?.symbol?.color as number[])?.[0]).toBe(76);
  });
});

const AGRO_STRUCTURES_RENDERER_FIXTURE = {
  renderer: {
    type: 'uniqueValue',
    field1: 'Structure_Type',
    uniqueValueGroups: [
      {
        heading: 'Structure_Type',
        classes: [
          {
            label: 'Greenhouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [76, 230, 0, 132],
              outline: { color: [110, 110, 110, 255], width: 0.7 },
            },
            values: [['1000']],
          },
          {
            label: 'Nethouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [168, 168, 0, 163],
              outline: { color: [110, 110, 110, 255], width: 0.7 },
            },
            values: [['1001']],
          },
          {
            label: 'Glasshouse',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [255, 255, 255, 255],
              outline: { color: [255, 255, 115, 255], width: 0.7 },
            },
            values: [['1002']],
          },
          {
            label: 'Retractable Roof Houses',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [204, 204, 204, 200],
              outline: { color: [204, 204, 204, 255], width: 0.7 },
            },
            values: [['1003']],
          },
          {
            label: 'Cravo',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [209, 255, 115, 255],
              outline: { color: [0, 0, 0, 255], width: 0.7 },
            },
            values: [['1004']],
          },
          {
            label: 'Dates Farm',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [130, 130, 130, 0],
              outline: { color: [169, 0, 230, 255], width: 2 },
            },
            values: [['1005']],
          },
          {
            label: 'PIVOT',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [130, 130, 130, 0],
              outline: { color: [0, 0, 0, 255], width: 2 },
            },
            values: [['1006']],
          },
          {
            label: 'Farm Plots',
            symbol: {
              type: 'esriSFS',
              style: 'esriSFSSolid',
              color: [130, 130, 130, 0],
              outline: { color: [76, 230, 0, 255], width: 2 },
            },
            values: [['1007']],
          },
        ],
      },
    ],
  },
};

describe('Agro_Structures 8-subtype symbology', () => {
  const drawingInfo = AGRO_STRUCTURES_RENDERER_FIXTURE;

  it('builds legend for all 8 Structure_Type subtypes', () => {
    const items = buildArcgisUniqueValueLegendItems(drawingInfo);
    expect(items).toHaveLength(8);
    expect(items.find(i => i.value === '1005')?.hollow).toBe(true);
    expect(items.find(i => i.value === '1006')?.hollow).toBe(true);
    expect(items.find(i => i.value === '1007')?.hollow).toBe(true);
  });

  it('maps fill colors and opacities for filled subtypes', () => {
    const fill = arcgisDrawingInfoToFillPaint(drawingInfo);
    const colorMatch = fill?.['fill-color'] as unknown[];
    const opMatch = fill?.['fill-opacity'] as unknown[];
    expect(colorMatch).toContain('rgb(76,230,0)');
    expect(opMatch).toContain(132 / 255);
    expect(colorMatch).toContain('rgb(168,168,0)');
    expect(opMatch).toContain(163 / 255);
    expect(colorMatch).toContain('rgb(255,255,255)');
    expect(colorMatch).toContain('rgb(209,255,115)');
  });

  it('maps hollow subtypes with zero fill opacity', () => {
    const fill = arcgisDrawingInfoToFillPaint(drawingInfo);
    const opMatch = fill?.['fill-opacity'] as unknown[];
    expect(opMatch).toContain(0);
  });

  it('maps outline colors for all subtypes including hollow', () => {
    const line = arcgisDrawingInfoToLinePaint(drawingInfo, '#94a3b8');
    const colorMatch = line?.['line-color'] as unknown[];
    expect(colorMatch).toContain('rgb(169,0,230)');
    expect(colorMatch).toContain('rgb(0,0,0)');
    expect(colorMatch).toContain('rgb(76,230,0)');
    expect(colorMatch).toContain('1005');
    expect(colorMatch).toContain('1006');
    expect(colorMatch).toContain('1007');
  });
});
