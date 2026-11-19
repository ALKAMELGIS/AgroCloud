export type AcpCoreMapLayerKey =
  | 'aoi'
  | 'sentinelWms'
  | 'liveChas'
  | 'liveAlertTicker'
  | 'weatherAlerts'

export type AcpMapLayerVisibility = {
  aoi: boolean
  sentinelWms: boolean
  liveChas: boolean
  /** Top weather alert ticker bar — independent of map weather layer. */
  liveAlertTicker: boolean
  weatherAlerts: boolean
  /** Portal layer id → visible (default true when absent). */
  portal: Record<string, boolean>
}

export const DEFAULT_ACP_MAP_LAYER_VISIBILITY: AcpMapLayerVisibility = {
  aoi: true,
  sentinelWms: true,
  liveChas: false,
  liveAlertTicker: true,
  weatherAlerts: false,
  portal: {},
}

export function isAcpWeatherFeedActive(_visibility: Pick<AcpMapLayerVisibility, 'liveAlertTicker' | 'weatherAlerts'>): boolean {
  // Live Alert ticker bar is always on — keep weather feed active for it.
  return true
}

export function isAcpPortalLayerVisible(visibility: AcpMapLayerVisibility, layerId: string): boolean {
  return visibility.portal[layerId] !== false
}

export function buildAcpLayerVisibilityFromDefaults(
  defaults: Pick<AcpMapLayerVisibility, AcpCoreMapLayerKey>,
  portalDefaults: Record<string, boolean> = {},
): AcpMapLayerVisibility {
  return {
    aoi: defaults.aoi,
    sentinelWms: defaults.sentinelWms,
    liveChas: defaults.liveChas,
    liveAlertTicker: true,
    weatherAlerts: defaults.weatherAlerts,
    portal: { ...portalDefaults },
  }
}
