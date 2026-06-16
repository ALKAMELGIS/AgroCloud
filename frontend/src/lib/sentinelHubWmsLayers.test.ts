import { describe, expect, it } from 'vitest'
import {
  appendSentinelHubWmsAccessToken,
  buildSentinelHubWmsGetMapUrlParts,
  getBootstrapSentinelWmsLayers,
  getSentinelHubWmsLayerCatalog,
  mergeAgroCloudCustomWmsLayers,
  parseSentinelHubWmsCapabilities,
  pickDefaultSentinelWmsLayer,
  resolveSentinelHubWmsGetMapLayerName,
  resolveSentinelHubWmsNativeIndexLayerName,
  resolveSentinelHubWmsDeltaPreviousDate,
  resolveSentinelHubWmsTimeWindow,
  sentinelHubWmsMinZoomForLatitude,
  SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL,
} from './sentinelHubWmsLayers'

describe('sentinelHubWmsLayers', () => {
  it('parses NDMI layer title as NDMI', () => {
    const xml = new DOMParser().parseFromString(
      `<?xml version="1.0"?>
      <WMS_Capabilities>
        <Capability>
          <Layer>
            <Name>NDMI</Name>
            <Title>Moisture index</Title>
          </Layer>
        </Capability>
      </WMS_Capabilities>`,
      'application/xml',
    )
    const layers = parseSentinelHubWmsCapabilities(xml)
    expect(layers).toHaveLength(1)
    expect(layers[0]?.title).toBe('NDMI')
  })

  it('appends SAVI and composite custom layers when missing from capabilities', () => {
    const merged = mergeAgroCloudCustomWmsLayers([
      { name: 'NDVI', title: 'NDVI' },
      { name: 'TRUE_COLOR', title: 'True Color' },
    ])
    expect(merged.some(l => l.name === 'SAVI')).toBe(true)
    expect(merged.some(l => l.name === 'VHS')).toBe(true)
    expect(merged.some(l => l.name === 'DVHS')).toBe(true)
  })

  it('proxies client-only layers to 1_TRUE_COLOR when no native index layer exists', () => {
    const layers = [
      { name: 'NDVI', title: 'NDVI' },
      { name: 'TRUE_COLOR', title: 'True Color' },
      { name: 'SAVI', title: 'SAVI' },
    ]
    expect(resolveSentinelHubWmsGetMapLayerName('SAVI', layers)).toBe('TRUE_COLOR')
    expect(resolveSentinelHubWmsGetMapLayerName('VHS', layers)).toBe('TRUE_COLOR')
    expect(resolveSentinelHubWmsGetMapLayerName('NDVI', layers)).toBe('TRUE_COLOR')
    expect(resolveSentinelHubWmsGetMapLayerName('TRUE_COLOR', layers)).toBe('TRUE_COLOR')
  })

  it('uses client evalscript for NDVI Layer Live (SCL 10-class, not instance 3_NDVI)', () => {
    const layers = getBootstrapSentinelWmsLayers()
    expect(resolveSentinelHubWmsNativeIndexLayerName('NDVI', layers)).toBeNull()
    expect(resolveSentinelHubWmsGetMapLayerName('NDVI', layers)).toBe('1_TRUE_COLOR')
    expect(resolveSentinelHubWmsGetMapLayerName('SAVI', layers)).toBe('1_TRUE_COLOR')
  })

  it('spans TIME window for delta layers when previous scene exists', () => {
    expect(
      resolveSentinelHubWmsTimeWindow('DIEI', '2026-06-06', '2026-05-30'),
    ).toEqual({ timeStart: '2026-05-30', timeEnd: '2026-06-06' })
    expect(
      resolveSentinelHubWmsTimeWindow('VHS', '2026-06-06', '2026-05-30'),
    ).toEqual({ timeStart: '2026-05-07', timeEnd: '2026-06-06' })
    expect(
      resolveSentinelHubWmsTimeWindow('DIEI', '2026-06-06', null),
    ).toEqual({ timeStart: '2026-05-07', timeEnd: '2026-06-06' })
  })

  it('resolves delta previous date from catalog, time series, or calendar fallback', () => {
    expect(
      resolveSentinelHubWmsDeltaPreviousDate('2026-06-06', {
        catalogSceneIsos: ['2026-06-06', '2026-05-30', '2026-05-22'],
      }),
    ).toBe('2026-05-30')
    expect(
      resolveSentinelHubWmsDeltaPreviousDate('2026-06-06', {
        timeSeriesStart: '2026-05-01',
      }),
    ).toBe('2026-05-01')
    expect(
      resolveSentinelHubWmsDeltaPreviousDate('2026-06-06', {}),
    ).toBe('2026-05-30')
  })

  it('parses leaf layers only and dedupes by title', () => {
    const xml = new DOMParser().parseFromString(
      `<?xml version="1.0"?>
      <WMS_Capabilities>
        <Capability>
          <Layer>
            <Name>ROOT</Name>
            <Title>Sentinel Hub WMS</Title>
            <Layer>
              <Name>TRUE_COLOR</Name>
              <Title>True color</Title>
            </Layer>
            <Layer>
              <Name>1-TRUE_COLOR</Name>
              <Title>True color</Title>
            </Layer>
            <Layer>
              <Name>NDVI</Name>
              <Title>NDVI</Title>
            </Layer>
          </Layer>
        </Capability>
      </WMS_Capabilities>`,
      'application/xml',
    )
    const layers = parseSentinelHubWmsCapabilities(xml)
    const names = layers.map(l => l.name)
    expect(names).toContain('TRUE_COLOR')
    expect(names).not.toContain('ROOT')
    expect(names.filter(n => /true/i.test(n) || n === 'NDVI')).toHaveLength(2)
  })

  it('computes min zoom so tile resolution stays within S2 L1C limit', () => {
    const z = sentinelHubWmsMinZoomForLatitude(0)
    const mpp = (40_075_016.685_578_49 * Math.cos(0)) / (512 * 2 ** z)
    expect(mpp).toBeLessThanOrEqual(SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL + 1)
    expect(z).toBeGreaterThanOrEqual(8)
  })

  it('pickDefaultSentinelWmsLayer prefers NDVI', () => {
    const layers = [
      { name: 'TRUE_COLOR', title: 'True color' },
      { name: 'HIGHLIGHT_NATURAL', title: 'Highlight Optimized Natural Color' },
      { name: 'NDVI', title: 'NDVI' },
    ]
    expect(pickDefaultSentinelWmsLayer(layers)).toBe('NDVI')
  })

  it('getSentinelHubWmsLayerCatalog keeps bootstrap 3_NDVI when GetCapabilities omits it', () => {
    const caps = [{ name: 'HIGHLIGHT_OPTIMIZED_NATURAL_COLOR', title: 'Highlight' }]
    const catalog = getSentinelHubWmsLayerCatalog(caps)
    expect(catalog.some(l => l.name === '3_NDVI')).toBe(true)
    expect(resolveSentinelHubWmsGetMapLayerName('NDVI', catalog)).toBe('1_TRUE_COLOR')
  })

  it('getBootstrapSentinelWmsLayers includes native 3_NDVI and 1_TRUE_COLOR proxy without GetCapabilities', () => {
    const layers = getBootstrapSentinelWmsLayers()
    const names = layers.map(l => l.name.toUpperCase())
    expect(names).toContain('3_NDVI')
    expect(names).toContain('1_TRUE_COLOR')
    expect(names).toContain('VHS')
    expect(resolveSentinelHubWmsGetMapLayerName('NDVI', layers)).toBe('1_TRUE_COLOR')
  })

  it('appends access_token query param for WMS requests', () => {
    const url = appendSentinelHubWmsAccessToken(
      'https://services.sentinel-hub.com/ogc/wms/x?SERVICE=WMS&REQUEST=GetCapabilities',
      'PUBLIC_DATA_FEATURED_COLLECTIONS',
    )
    expect(url).toContain('access_token=PUBLIC_DATA_FEATURED_COLLECTIONS')
  })

  it('requests bilinear WMS resampling for smooth index rasters', () => {
    const url = buildSentinelHubWmsGetMapUrlParts({
      baseUrl: 'https://services.sentinel-hub.com/ogc/wms/inst',
      layer: '1_TRUE_COLOR',
      timeStart: '2026-06-01',
      timeEnd: '2026-06-01',
      cloudCoverage: 20,
    })
    expect(url).toContain('UPSAMPLING=BILINEAR')
    expect(url).toContain('DOWNSAMPLING=BILINEAR')
    expect(url).toContain('TRANSPARENT=true')
    expect(url).toContain('CRS=EPSG:3857')
  })
})
