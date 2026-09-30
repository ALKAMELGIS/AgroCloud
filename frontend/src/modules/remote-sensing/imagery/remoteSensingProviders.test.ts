import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMOTE_SENSING_PROVIDER,
  REMOTE_SENSING_PROVIDER_CATALOG,
  remoteSensingProviderDef,
  remoteSensingProviderMapStatus,
  resolveEoStacCollectionsForProvider,
  resolveRemoteSensingMapBackend,
} from './remoteSensingProviders'
import {
  getSentinelHubWmsBaseUrl,
  SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID,
  SENTINEL_HUB_WMS_HOST_CDSE,
  SENTINEL_HUB_WMS_HOST_COMMERCIAL,
} from './sentinelHubWmsInstance'

describe('remoteSensingProviders map backends', () => {
  it('keeps every catalogued satellite provider (does not drop vendors)', () => {
    expect(REMOTE_SENSING_PROVIDER_CATALOG.length).toBeGreaterThanOrEqual(14)
    expect(REMOTE_SENSING_PROVIDER_CATALOG.map(p => p.id)).toContain('esa-sentinel')
    expect(REMOTE_SENSING_PROVIDER_CATALOG.map(p => p.id)).toContain('sentinel-hub')
    expect(REMOTE_SENSING_PROVIDER_CATALOG.map(p => p.id)).toContain('maxar')
    expect(REMOTE_SENSING_PROVIDER_CATALOG.map(p => p.id)).toContain('aster')
  })

  it('registers ASTER L1T without inline toolbox hint text', () => {
    const aster = remoteSensingProviderDef('aster')
    expect(aster.label).toBe('ASTER')
    expect(aster.integrated).toBe(false)
    expect(aster.hint).toBeUndefined()
    expect(aster.collections).toEqual([{ id: 'aster-l1t', label: 'ASTER L1T (Planetary Computer)' }])
    expect(resolveEoStacCollectionsForProvider('aster', 'aster-l1t').collections).toEqual(['aster-l1t'])
  })

  it('routes Sentinel Hub and ESA to distinct map backends', () => {
    expect(resolveRemoteSensingMapBackend('sentinel-hub')).toBe('sentinel-hub')
    expect(resolveRemoteSensingMapBackend('esa-sentinel')).toBe('cdse')
    expect(remoteSensingProviderDef('esa-sentinel').integrated).toBe(true)
  })

  it('builds commercial WMS URL for Sentinel Hub backend', () => {
    const url = getSentinelHubWmsBaseUrl('sentinel-hub')
    expect(url).toBe(`${SENTINEL_HUB_WMS_HOST_COMMERCIAL}/${SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID}`)
  })

  it('falls back to commercial SH when CDSE instance is unset', () => {
    const url = getSentinelHubWmsBaseUrl('cdse')
    expect(url.startsWith(SENTINEL_HUB_WMS_HOST_COMMERCIAL)).toBe(true)
    expect(url.includes(SENTINEL_HUB_WMS_HOST_CDSE)).toBe(false)
  })

  it('reports map status for the active provider/collection', () => {
    expect(remoteSensingProviderMapStatus(DEFAULT_REMOTE_SENSING_PROVIDER, 'sentinel-2-l2a')).toContain(
      'Sentinel Hub',
    )
    expect(remoteSensingProviderMapStatus('esa-sentinel', 'sentinel-2-l2a')).toContain('ESA Sentinel')
    expect(remoteSensingProviderMapStatus('esa-sentinel')).toContain('CDSE')
  })

  it('maps provider/collection to STAC scene calendars', () => {
    expect(resolveEoStacCollectionsForProvider('sentinel-hub', 'sentinel-2-l2a').collections).toEqual([
      'sentinel-2-l2a',
    ])
    expect(resolveEoStacCollectionsForProvider('nasa-landsat', 'landsat-8-9').collections).toEqual([
      'landsat-c2-l2',
    ])
    expect(resolveEoStacCollectionsForProvider('esa-sentinel', 'sentinel-1-grd').collections).toEqual([
      'sentinel-1-grd',
    ])
    expect(resolveEoStacCollectionsForProvider('nasa-landsat').lookbackDays).toBeGreaterThanOrEqual(300)
  })
})
