import { describe, expect, it } from 'vitest';
import { buildVectorPreview, buildValidationIssues, buildStubPreview } from '../../../lib/gisIngest/gisPreview';
import { isShapefilePart } from '../../../lib/gisIngest/shapefileBundle';
import { detectTileServiceKind, normalizeXyzTemplate } from '../../../lib/gisIngest/cogPmtiles';
import { planLidarIngest, detectLidarFormat } from '../../../lib/gisIngest/bimLidar';
import { toRegistryCard, GIS_LAYER_CONTEXT_ACTIONS } from '../../../lib/gisLayerRegistry';
import { VECTOR_ACCEPT, RASTER_ACCEPT } from '../../../lib/gisIngest/formats';
import { suggestServiceKindFromUrl } from '../../../lib/gisConnections/webServiceStore';
import { parseWfsGetCapabilities, buildWfsGetFeatureUrl } from '../../../lib/gisConnections/ogcWfsClient';

describe('gisPreview', () => {
  it('summarizes a FeatureCollection', () => {
    const preview = buildVectorPreview(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'a' },
            geometry: { type: 'Point', coordinates: [31.2, 30.1] },
          },
        ],
      },
      'test.geojson',
      1200,
      'EPSG:4326',
    );
    expect(preview.featureCount).toBe(1);
    expect(preview.geometryTypes).toContain('Point');
    expect(preview.crsHint).toBe('EPSG:4326');
    expect(preview.bbox?.[0]).toBeCloseTo(31.2);
  });

  it('flags missing features', () => {
    const issues = buildValidationIssues(buildStubPreview({ filename: 'x', bytes: 1, geometryType: 'table' }));
    expect(issues.some(i => i.code === 'missing_features')).toBe(true);
  });
});

describe('shapefileBundle', () => {
  it('detects shapefile parts', () => {
    expect(isShapefilePart('parcels.shp')).toBe(true);
    expect(isShapefilePart('parcels.dbf')).toBe(true);
    expect(isShapefilePart('parcels.geojson')).toBe(false);
  });
});

describe('cogPmtiles', () => {
  it('detects service kinds', () => {
    expect(detectTileServiceKind('https://x.com/tiles/{z}/{x}/{y}.png')).toBe('xyz');
    expect(detectTileServiceKind('https://x.com/data.pmtiles')).toBe('pmtiles');
    expect(detectTileServiceKind('https://x.com/scene.tif')).toBe('cog');
  });

  it('normalizes xyz templates', () => {
    expect(normalizeXyzTemplate('https://a/{zoom}/{x}/{y}.png')).toContain('{z}');
  });
});

describe('bimLidar', () => {
  it('plans lidar ingest', () => {
    expect(detectLidarFormat('cloud.laz')).toBe('laz');
    expect(planLidarIngest('cloud.laz').strategy).toBe('gateway-convert');
  });
});

describe('gisLayerRegistry', () => {
  it('maps layers to cards and exposes context actions', () => {
    const card = toRegistryCard({
      id: '1',
      name: 'Fields',
      visible: true,
      mapOpacity: 0.8,
      importMetadata: { geometryType: 'polygon', featureCount: 12, crs: 'EPSG:4326' },
    });
    expect(card.kind).toBe('vector');
    expect(card.opacity).toBe(0.8);
    expect(GIS_LAYER_CONTEXT_ACTIONS.length).toBeGreaterThan(8);
  });
});

describe('formats accept lists', () => {
  it('includes honest vector/raster extensions', () => {
    expect(VECTOR_ACCEPT).toContain('.geojson');
    expect(VECTOR_ACCEPT).toContain('.xlsx');
    expect(RASTER_ACCEPT).toContain('.tif');
    expect(VECTOR_ACCEPT).not.toContain('.ecw');
  });
});

describe('web / wfs helpers', () => {
  it('suggests service kinds from URL', () => {
    expect(suggestServiceKindFromUrl('https://example.com/wfs?service=WFS')).toBe('wfs');
  });

  it('parses WFS capabilities and builds GetFeature URL', () => {
    const xml = `<?xml version="1.0"?>
      <WFS_Capabilities>
        <FeatureTypeList>
          <FeatureType><Name>ns:roads</Name><Title>Roads</Title></FeatureType>
        </FeatureTypeList>
      </WFS_Capabilities>`;
    const caps = parseWfsGetCapabilities(xml);
    expect(caps.layers[0]?.name).toContain('roads');
    const url = buildWfsGetFeatureUrl('https://example.com/geoserver/wfs', 'ns:roads', { count: 10 });
    expect(url).toContain('GetFeature');
    expect(url).toContain('roads');
  });
});
