export type AgroCloudMapScalebarMode = 'none' | 'line' | 'ruler'

export type AgroCloudDashboardMapWidgetSettings = {
  /** Settings tab — map UI tools */
  scalebar: AgroCloudMapScalebarMode
  measurement: boolean
  search: boolean
  legend: boolean
  initialViewBookmarks: boolean
  layerVisibility: boolean
  basemapSwitcher: boolean
  compass: boolean
  findMyLocation: boolean
  zoomInOut: boolean
  pointZoomScale: number
  /** General tab */
  headerTitle: string
  name: string
  headerTextColor: string
  headerForegroundColor: string
  textColor: string
  foregroundColor: string
  selectionColor: string
  followColor: string
  followRadius: number
  /** Layer actions tab */
  showPopup: boolean
  selectFeature: boolean
  rectangleSelect: boolean
  lassoSelect: boolean
  circleSelect: boolean
  lineSelect: boolean
  /** Accessibility tab */
  accessibleName: string
}

export type AgroCloudMapWidgetConfigTab = 'settings' | 'general' | 'mapActions' | 'layerActions' | 'accessibility'

export function defaultMapWidgetSettings(layerName: string): AgroCloudDashboardMapWidgetSettings {
  return {
    scalebar: 'none',
    measurement: false,
    search: false,
    legend: false,
    initialViewBookmarks: false,
    layerVisibility: false,
    basemapSwitcher: false,
    compass: false,
    findMyLocation: false,
    zoomInOut: false,
    pointZoomScale: 10000,
    headerTitle: '{}',
    name: layerName,
    headerTextColor: '#000000',
    headerForegroundColor: '#ffffff',
    textColor: '#000000',
    foregroundColor: '#ffffff',
    selectionColor: '#0079c1',
    followColor: '#0079c1',
    followRadius: 60,
    showPopup: true,
    selectFeature: true,
    rectangleSelect: false,
    lassoSelect: false,
    circleSelect: false,
    lineSelect: false,
    accessibleName: 'Map',
  }
}

export function mergeMapWidgetSettings(
  base: AgroCloudDashboardMapWidgetSettings,
  patch: Partial<AgroCloudDashboardMapWidgetSettings>,
): AgroCloudDashboardMapWidgetSettings {
  return { ...base, ...patch }
}
