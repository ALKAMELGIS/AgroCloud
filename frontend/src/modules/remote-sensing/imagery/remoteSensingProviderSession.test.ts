import { describe, expect, it } from 'vitest'
import {
  createDefaultRemoteSensingProviderSession,
  providerUsesStaticLayerCatalog,
  resolveRemoteSensingProviderSession,
  snapshotRemoteSensingProviderSession,
} from './remoteSensingProviderSession'

const defaults = {
  imageryIso: '2026-07-28',
  timeSeriesStart: '2026-01-01',
  timeSeriesEnd: '2026-07-28',
}

describe('remoteSensingProviderSession', () => {
  it('treats ASTER and dedicated Collection catalogues as static layer catalogs', () => {
    expect(providerUsesStaticLayerCatalog('aster', 'aster-l1t')).toBe(true)
    expect(providerUsesStaticLayerCatalog('sentinel-hub', 'copernicus-dem')).toBe(true)
    expect(providerUsesStaticLayerCatalog('sentinel-hub', 'sentinel-5p')).toBe(true)
    expect(providerUsesStaticLayerCatalog('sentinel-hub', 'sentinel-2-l2a')).toBe(false)
  })

  it('defaults ASTER to VNIR and Sentinel Hub to NDVI-class layer', () => {
    const aster = createDefaultRemoteSensingProviderSession('aster', defaults)
    expect(aster.collection).toBe('aster-l1t')
    expect(aster.layerId).toBe('VNIR')
    expect(aster.imageryDateAutoFollow).toBe(true)

    const sh = createDefaultRemoteSensingProviderSession('sentinel-hub', defaults)
    expect(sh.collection).toBe('sentinel-2-l2a')
    expect(sh.layerId).toBe('NDVI')
  })

  it('restores isolated per-provider sessions including imagery date', () => {
    const store = new Map()
    store.set(
      'sentinel-hub',
      snapshotRemoteSensingProviderSession({
        collection: 'sentinel-2-l2a',
        layerId: 'NDMI',
        imageryIso: '2026-06-01',
        imageryDateAutoFollow: false,
        timeSeriesStart: '2026-03-01',
        timeSeriesEnd: '2026-06-01',
      }),
    )
    store.set(
      'aster',
      snapshotRemoteSensingProviderSession({
        collection: 'aster-l1t',
        layerId: 'IOI',
        imageryIso: '2025-11-15',
        imageryDateAutoFollow: false,
        timeSeriesStart: '2025-01-01',
        timeSeriesEnd: '2025-11-15',
      }),
    )

    const sh = resolveRemoteSensingProviderSession(store, 'sentinel-hub', defaults)
    expect(sh.layerId).toBe('NDMI')
    expect(sh.imageryIso).toBe('2026-06-01')
    expect(sh.imageryDateAutoFollow).toBe(false)

    const aster = resolveRemoteSensingProviderSession(store, 'aster', defaults)
    expect(aster.layerId).toBe('IOI')
    expect(aster.imageryIso).toBe('2025-11-15')
  })
})
