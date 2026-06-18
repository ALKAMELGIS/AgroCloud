import { describe, expect, it } from 'vitest'
import { applyCropAlertEngineDefaultOperatingState } from '../../../lib/siCropAlertEngine'
import { DEFAULT_ACP_PLATFORM_CONFIG } from './acpPlatformConfig'
import {
  ACP_SETTINGS_BUNDLE_VERSION,
  buildAcpSettingsBundle,
  parseAcpSettingsBundle,
  serializeAcpSettingsBundle,
} from './acpSettingsBundle'

describe('acpSettingsBundle', () => {
  it('builds and serializes a versioned bundle', () => {
    const alertSettings = applyCropAlertEngineDefaultOperatingState()
    const bundle = buildAcpSettingsBundle(DEFAULT_ACP_PLATFORM_CONFIG, alertSettings)
    expect(bundle.version).toBe(ACP_SETTINGS_BUNDLE_VERSION)
    expect(bundle.config.title).toBe(DEFAULT_ACP_PLATFORM_CONFIG.title)
    expect(bundle.alertSettings.enabled).toBe(alertSettings.enabled)

    const raw = serializeAcpSettingsBundle(bundle)
    expect(raw).toContain('"version": 1')
    expect(raw).toContain('"title": "AgroCloud Platform"')
  })

  it('parses exported JSON and merges with defaults', () => {
    const alertSettings = applyCropAlertEngineDefaultOperatingState({ refreshMinutes: 42 })
    const bundle = buildAcpSettingsBundle(
      { ...DEFAULT_ACP_PLATFORM_CONFIG, title: 'Imported Dashboard', maxWmsLayers: 4 },
      alertSettings,
    )
    const parsed = parseAcpSettingsBundle(serializeAcpSettingsBundle(bundle))
    expect(parsed.config.title).toBe('Imported Dashboard')
    expect(parsed.config.maxWmsLayers).toBe(4)
    expect(parsed.config.basemapId).toBe(DEFAULT_ACP_PLATFORM_CONFIG.basemapId)
    expect(parsed.alertSettings.refreshMinutes).toBe(42)
  })

  it('rejects unsupported bundle versions', () => {
    const raw = JSON.stringify({
      version: 99,
      config: DEFAULT_ACP_PLATFORM_CONFIG,
      alertSettings: applyCropAlertEngineDefaultOperatingState(),
    })
    expect(() => parseAcpSettingsBundle(raw)).toThrow(/Unsupported settings bundle version/)
  })
})
