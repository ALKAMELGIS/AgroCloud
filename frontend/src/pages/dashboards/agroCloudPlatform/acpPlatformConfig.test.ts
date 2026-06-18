import { describe, expect, it } from 'vitest'
import { DEFAULT_ACP_PLATFORM_CONFIG } from './acpPlatformConfig'
import { buildAcpLayerVisibilityFromDefaults } from './acpMapLayerVisibility'

describe('acpPlatformConfig defaults', () => {
  it('includes panel visibility and layer defaults', () => {
    expect(DEFAULT_ACP_PLATFORM_CONFIG.panels.fields).toBe(true)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility.liveChas).toBe(false)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility.liveAlertTicker).toBe(true)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility.weatherAlerts).toBe(false)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.fieldsPanel.defaultViewMode).toBe('table')
  })

  it('includes extended platform config fields', () => {
    expect(DEFAULT_ACP_PLATFORM_CONFIG.maxWmsLayers).toBe(64)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.clipMode).toBe('stable')
    expect(DEFAULT_ACP_PLATFORM_CONFIG.autoRefreshMinutes).toBe(0)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.defaultCountryFilter).toBe('all')
    expect(DEFAULT_ACP_PLATFORM_CONFIG.panels.timeSeriesChart).toBe(false)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.mapToolbar.timeSeries).toBe(true)
    expect(DEFAULT_ACP_PLATFORM_CONFIG.defaultPortalLayerVisibility).toEqual({})
  })

  it('buildAcpLayerVisibilityFromDefaults preserves core toggles', () => {
    const vis = buildAcpLayerVisibilityFromDefaults({
      aoi: false,
      sentinelWms: true,
      liveChas: false,
      liveAlertTicker: true,
      weatherAlerts: false,
    })
    expect(vis).toEqual({
      aoi: false,
      sentinelWms: true,
      liveChas: false,
      liveAlertTicker: true,
      weatherAlerts: false,
      portal: {},
    })
  })

  it('buildAcpLayerVisibilityFromDefaults merges portal defaults', () => {
    const vis = buildAcpLayerVisibilityFromDefaults(
      DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility,
      { 'layer-1': false, 'layer-2': true },
    )
    expect(vis.portal).toEqual({ 'layer-1': false, 'layer-2': true })
  })
})
