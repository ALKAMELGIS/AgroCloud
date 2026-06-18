import type { CropAlertEngineSettings } from '../../../lib/siCropAlertEngine'
import {
  DEFAULT_ACP_PLATFORM_CONFIG,
  mergeKpiCardsWithDefaults,
  type AcpPlatformConfig,
  loadAcpPlatformConfig,
  persistAcpPlatformConfig,
  loadAcpAlertEngineSettings,
  persistAcpAlertEngineSettings,
} from './acpPlatformConfig'
import { applyCropAlertEngineDefaultOperatingState } from '../../../lib/siCropAlertEngine'

export const ACP_SETTINGS_BUNDLE_VERSION = 1 as const

export type AcpSettingsBundle = {
  version: typeof ACP_SETTINGS_BUNDLE_VERSION
  exportedAt: string
  config: AcpPlatformConfig
  alertSettings: CropAlertEngineSettings
}

export function buildAcpSettingsBundle(
  config: AcpPlatformConfig,
  alertSettings: CropAlertEngineSettings,
): AcpSettingsBundle {
  return {
    version: ACP_SETTINGS_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    config,
    alertSettings,
  }
}

export function serializeAcpSettingsBundle(bundle: AcpSettingsBundle): string {
  return JSON.stringify(bundle, null, 2)
}

export function parseAcpSettingsBundle(raw: string): AcpSettingsBundle {
  const parsed = JSON.parse(raw) as Partial<AcpSettingsBundle>
  if (parsed.version !== ACP_SETTINGS_BUNDLE_VERSION) {
    throw new Error('Unsupported settings bundle version.')
  }
  if (!parsed.config || !parsed.alertSettings) {
    throw new Error('Invalid settings bundle: missing config or alert settings.')
  }
  return {
    version: ACP_SETTINGS_BUNDLE_VERSION,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    config: {
      ...DEFAULT_ACP_PLATFORM_CONFIG,
      ...parsed.config,
      kpiCards: parsed.config.kpiCards?.length
        ? mergeKpiCardsWithDefaults(parsed.config.kpiCards)
        : DEFAULT_ACP_PLATFORM_CONFIG.kpiCards,
    },
    alertSettings: applyCropAlertEngineDefaultOperatingState(parsed.alertSettings),
  }
}

export function downloadAcpSettingsBundle(bundle: AcpSettingsBundle, filename?: string): void {
  const blob = new Blob([serializeAcpSettingsBundle(bundle)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `acp-settings-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function persistAcpSettingsBundle(bundle: AcpSettingsBundle): void {
  persistAcpPlatformConfig(bundle.config)
  persistAcpAlertEngineSettings(bundle.alertSettings)
}

export function loadPersistedAcpSettingsBundle(): AcpSettingsBundle {
  return buildAcpSettingsBundle(loadAcpPlatformConfig(), loadAcpAlertEngineSettings())
}

export function resolveGeodashApiBase(configUrl: string): string {
  const trimmed = configUrl.trim().replace(/\/+$/, '')
  if (trimmed) return trimmed
  const env = (import.meta.env.VITE_GEODASH_API_URL as string | undefined)?.trim().replace(/\/+$/, '')
  return env ?? ''
}

export async function pingGeodashApi(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (!base) return { ok: false, message: 'No GeoDash API URL configured.' }
  try {
    const res = await fetch(`${base}/`, { method: 'GET' })
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
    const body = (await res.json()) as { ok?: boolean; service?: string }
    if (body.ok) return { ok: true, message: body.service ?? 'GeoDash API reachable' }
    return { ok: true, message: 'GeoDash API reachable' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' }
  }
}

export function acpDefaultLayerIdsFromChartSeries(
  chartSeries: AcpPlatformConfig['chartSeries'],
): string[] {
  const map: Record<(typeof chartSeries)[number], string> = {
    ndvi: 'NDVI',
    chas: 'CHAS',
    ndmi: 'NDMI',
  }
  return chartSeries.map(s => map[s])
}
