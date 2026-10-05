/** ArcGIS Online / Living Atlas overlays for Weather Intelligence (Settings → Data → Layers). */

export type WeatherArcgisDataLayerId =
  | 'noaa_metar_wind'
  | 'era5_annual_temp'
  | 'viirs_cloud_cover'
  | 'world_countries'
  | 'world_cities'

export type WeatherArcgisDataLayerKind = 'feature' | 'image'

export type WeatherArcgisDataLayerDef = {
  id: WeatherArcgisDataLayerId
  label: string
  description: string
  group: 'weather' | 'climate' | 'satellite' | 'reference'
  kind: WeatherArcgisDataLayerKind
  /** FeatureServer/0 or ImageServer endpoint */
  serviceUrl: string
  /** Hot spot style (METAR / live conditions emphasis) */
  hotspot?: boolean
  zIndex: number
  minZoom?: number
}

export const WEATHER_ARCGIS_DATA_LAYER_GROUPS: { id: WeatherArcgisDataLayerDef['group']; label: string }[] = [
  { id: 'weather', label: 'Weather layers' },
  { id: 'climate', label: 'Climate' },
  { id: 'satellite', label: 'Satellite imagery' },
  { id: 'reference', label: 'Reference' },
]

export const WEATHER_ARCGIS_DATA_LAYERS: WeatherArcgisDataLayerDef[] = [
  {
    id: 'noaa_metar_wind',
    label: 'NOAA METAR wind speed & direction',
    description:
      'Current surface wind from METAR stations (Living Atlas). Part of the weather layer set: temperature, dew point, wind, precipitation, clouds, visibility, and pressure.',
    group: 'weather',
    kind: 'feature',
    serviceUrl:
      'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NOAA_METAR_current_wind_speed_direction_v1/FeatureServer/0',
    hotspot: true,
    zIndex: 460,
    minZoom: 3,
  },
  {
    id: 'era5_annual_temp',
    label: 'Average annual temperature (1981–2010)',
    description: 'Mean surface air temperature — ECMWF/Copernicus ERA5 essential climate variables.',
    group: 'climate',
    kind: 'feature',
    serviceUrl:
      'https://services.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/Average_Annual_Temperature/FeatureServer/0',
    hotspot: true,
    zIndex: 340,
    minZoom: 2,
  },
  {
    id: 'viirs_cloud_cover',
    label: 'Cloud cover (VIIRS true color)',
    description: 'NASA VIIRS / NOAA-20 true-color corrected reflectance (Living Atlas). Updates for the current date.',
    group: 'satellite',
    kind: 'image',
    serviceUrl: 'https://modis.arcgis.com/arcgis/rest/services/VIIRS/ImageServer',
    zIndex: 320,
    minZoom: 2,
  },
  {
    id: 'world_countries',
    label: 'World countries',
    description: 'Country boundaries for map context.',
    group: 'reference',
    kind: 'feature',
    serviceUrl:
      'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries/FeatureServer/0',
    zIndex: 300,
    minZoom: 1,
  },
  {
    id: 'world_cities',
    label: 'World cities',
    description: 'Major cities for geographic reference.',
    group: 'reference',
    kind: 'feature',
    serviceUrl: 'https://services7.arcgis.com/c5JDOKbvGHpqdj1X/arcgis/rest/services/WorldCities/FeatureServer/0',
    zIndex: 380,
    minZoom: 4,
  },
]

export function weatherArcgisDataLayerById(id: WeatherArcgisDataLayerId): WeatherArcgisDataLayerDef {
  const found = WEATHER_ARCGIS_DATA_LAYERS.find(l => l.id === id)
  if (!found) throw new Error(`Unknown weather ArcGIS data layer: ${id}`)
  return found
}
