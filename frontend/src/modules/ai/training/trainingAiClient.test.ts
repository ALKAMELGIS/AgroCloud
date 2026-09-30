import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBestEpochHistory, pickLongestEpochHistory } from './trainingAiClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('pickLongestEpochHistory', () => {
  it('selects the longest curve and keeps the first on ties', () => {
    const short = [
      { epoch: 1, train_loss: 0.9, val_loss: 0.8 },
      { epoch: 2, train_loss: 0.7, val_loss: 0.6 },
    ]
    const longA = [
      { epoch: 1, train_loss: 1, val_loss: 0.9 },
      { epoch: 2, train_loss: 0.8, val_loss: 0.7 },
      { epoch: 3, train_loss: 0.5, val_loss: 0.4 },
    ]
    const longB = [
      { epoch: 1, train_loss: 2, val_loss: 1.9 },
      { epoch: 2, train_loss: 1.8, val_loss: 1.7 },
      { epoch: 3, train_loss: 1.5, val_loss: 1.4 },
    ]
    expect(pickLongestEpochHistory([short, longA, longB])).toBe(longA)
    expect(pickLongestEpochHistory([null, [], undefined])).toEqual([])
  })
})

describe('fetchBestEpochHistory', () => {
  it('returns the longest loss_history across listed models, not models[0]', async () => {
    const short = [
      { epoch: 1, train_loss: 0.9, val_loss: 0.8 },
      { epoch: 2, train_loss: 0.7, val_loss: 0.6 },
    ]
    const long = [
      { epoch: 1, train_loss: 1.0, val_loss: 0.95 },
      { epoch: 2, train_loss: 0.8, val_loss: 0.7 },
      { epoch: 3, train_loss: 0.5, val_loss: 0.45 },
      { epoch: 4, train_loss: 0.4, val_loss: 0.38 },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/training/models')) {
        return jsonResponse({
          models: [
            { model_id: 'newest-short', model_name: 'SegFormer' },
            { model_id: 'older-long', model_name: 'SegFormer' },
            { model_id: 'empty', model_name: 'SegFormer' },
          ],
        })
      }
      if (url.includes('/api/training/models/newest-short')) {
        return jsonResponse({ model_id: 'newest-short', loss_history: short })
      }
      if (url.includes('/api/training/models/older-long')) {
        return jsonResponse({ model_id: 'older-long', loss_history: long })
      }
      if (url.includes('/api/training/models/empty')) {
        return jsonResponse({ model_id: 'empty', loss_history: [] })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const history = await fetchBestEpochHistory()
    expect(history).toHaveLength(4)
    expect(history.map(r => r.epoch)).toEqual([1, 2, 3, 4])
    expect(history[3]?.val_loss).toBe(0.38)
    expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/api/training/models'))).toBe(true)
  })

  it('returns [] when the model list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ models: [], count: 0 })),
    )
    await expect(fetchBestEpochHistory()).resolves.toEqual([])
  })
})
