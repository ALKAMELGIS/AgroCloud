import { describe, expect, it, vi } from 'vitest'
import {
  ACP_AOI_SYNC_EVENT,
  buildAcpAoiSyncSignature,
  emitAcpAoiSync,
  subscribeAcpAoiSync,
} from './acpAoiSyncBus'

describe('acpAoiSyncBus', () => {
  it('dedupes identical sync payloads', () => {
    const fn = vi.fn()
    subscribeAcpAoiSync(fn)
    emitAcpAoiSync({ reason: 'engine', signature: 'a|empty' })
    emitAcpAoiSync({ reason: 'engine', signature: 'a|empty' })
    expect(fn).toHaveBeenCalledTimes(1)
    emitAcpAoiSync({ reason: 'engine', signature: 'b|empty', force: true })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('dispatches window custom event', () => {
    const handler = vi.fn()
    window.addEventListener(ACP_AOI_SYNC_EVENT, handler)
    emitAcpAoiSync({ reason: 'map', signature: 'sig', force: true })
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener(ACP_AOI_SYNC_EVENT, handler)
  })

  it('buildAcpAoiSyncSignature combines mask and outline', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    }
    expect(buildAcpAoiSyncSignature(fc, fc)).toContain('1:')
  })
})
