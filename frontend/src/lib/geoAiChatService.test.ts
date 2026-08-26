import { afterEach, describe, expect, it, vi } from 'vitest'
import { askGeoAI, checkGeoAiChatHealth, clearGeoAiChatHealthCache } from './geoAiChatService'

describe('geoAiChatService', () => {
  afterEach(() => {
    clearGeoAiChatHealthCache()
    vi.restoreAllMocks()
  })

  it('checkGeoAiChatHealth returns true when proxy is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', reachable: true }),
      }),
    )
    await expect(checkGeoAiChatHealth(true)).resolves.toBe(true)
  })

  it('checkGeoAiChatHealth returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(checkGeoAiChatHealth(true)).resolves.toBe(false)
  })

  it('askGeoAI posts message and context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'AOI area is 12.4 ha.', statistics: { areaHa: 12.4 } }),
      }),
    )

    const res = await askGeoAI('area of AOI', {
      selectedAOI: null,
      activeLayer: null,
      visibleLayers: [],
      map: { center: null, zoom: null },
    })

    expect(res.answer).toContain('12.4')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/geoai-chat/chat'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
