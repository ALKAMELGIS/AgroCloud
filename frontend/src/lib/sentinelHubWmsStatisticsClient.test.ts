import { describe, expect, it } from 'vitest'
import { isSentinelHubWmsClientStatisticsAvailable } from './sentinelHubWmsStatisticsClient'

describe('sentinelHubWmsStatisticsClient', () => {
  it('is available with the default WMS instance id', () => {
    expect(isSentinelHubWmsClientStatisticsAvailable()).toBe(true)
  })
})
