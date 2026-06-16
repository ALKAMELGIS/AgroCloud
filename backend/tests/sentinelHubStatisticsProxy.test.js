import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeSentinelHubStatisticsConfig } from '../server/sentinelHubStatisticsProxy.js'

describe('sentinelHubStatisticsProxy public WMS config', () => {
  it('treats PUBLIC_DATA + WMS instance as configured via wms-zonal mode', () => {
    const prevToken = process.env.SENTINEL_HUB_ACCESS_TOKEN
    const prevInstance = process.env.SENTINEL_HUB_WMS_INSTANCE_ID
    const prevCdseId = process.env.CDSE_CLIENT_ID
    const prevCdseSecret = process.env.CDSE_CLIENT_SECRET
    try {
      process.env.SENTINEL_HUB_ACCESS_TOKEN = 'PUBLIC_DATA_FEATURED_COLLECTIONS'
      process.env.SENTINEL_HUB_WMS_INSTANCE_ID = '60de79ca-16a7-4afd-bcbd-0261bf0156fa'
      delete process.env.CDSE_CLIENT_ID
      delete process.env.CDSE_CLIENT_SECRET

      const status = describeSentinelHubStatisticsConfig('/tmp/missing-secrets.json')
      assert.equal(status.configured, true)
      assert.equal(status.mode, 'wms-zonal')
      assert.equal(status.publicWmsOnly, true)
    } finally {
      if (prevToken === undefined) delete process.env.SENTINEL_HUB_ACCESS_TOKEN
      else process.env.SENTINEL_HUB_ACCESS_TOKEN = prevToken
      if (prevInstance === undefined) delete process.env.SENTINEL_HUB_WMS_INSTANCE_ID
      else process.env.SENTINEL_HUB_WMS_INSTANCE_ID = prevInstance
      if (prevCdseId === undefined) delete process.env.CDSE_CLIENT_ID
      else process.env.CDSE_CLIENT_ID = prevCdseId
      if (prevCdseSecret === undefined) delete process.env.CDSE_CLIENT_SECRET
      else process.env.CDSE_CLIENT_SECRET = prevCdseSecret
    }
  })
})
