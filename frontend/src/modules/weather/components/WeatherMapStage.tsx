import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flyToGeoJsonExtent, flyToLatLng } from '@/modules/dashboard/develop-elite/developEliteMapFly'
import { WeatherMapOpenMeteoPickEngine } from '../map/WeatherMapOpenMeteoPick'
import { WeatherMapInsightRail } from '../map/WeatherMapInsightRail'
import { DEFAULT_BASEMAP_ID, buildBasemapCatalog, catalogEntryById, resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { readWeatherBasemapId, writeWeatherBasemapId } from '../config/weatherBasemapPreference'
import { GeoJSON, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import MapView from '@/shared/maps/MapView'
import { getWeatherMapLayer, type WeatherMapLayerId } from '../config/weatherLayerCatalog'
import { WeatherLiveRasterOverlay } from '../map/WeatherLiveRasterOverlay'
import { WeatherOpenMeteoTileLayer } from '../map/WeatherOpenMeteoTileLayer'
import { WeatherGfsTileLayer } from '../map/WeatherGfsTileLayer'
import { WeatherFieldGridLoader } from '../map/WeatherFieldGridLoader'
import { WEATHER_OPEN_METEO_RASTER_DEFAULT_OPACITY } from '../config/weatherOpenMeteoRaster'
import { WeatherWindGridLoader } from '../map/WeatherWindGridLoader'
import { WeatherWindParticleOverlay } from '../map/WeatherWindParticleOverlay'
import { WeatherPrecipAnimationOverlay } from '../map/WeatherPrecipAnimationOverlay'
import type { FieldGridPoint, WindGridPoint } from '../map/weatherFieldGrid'
import { weatherLayerChipMeta } from '../config/weatherLayerChips'
import { WEATHER_WINDY_LAYER_IDS, isPrecipLayer } from '../config/weatherWindyLayers'
import type { WeatherFarmSite } from '../services/weatherFarmService'
import type { WeatherMapMode } from '../config/weatherMapModes'
import type { WeatherVizMode } from '../config/weatherVizModes'
import {
  getWeatherSatelliteTileUrl,
  isWeatherPhase2LayerConfigured,
  WEATHER_PHASE2_LAYERS,
} from '../config/weatherPhase2Layers'
import { WeatherAgriLocationLayer } from './WeatherAgriLocationLayer'
import { WeatherLocationLiveMarkers } from '../map/WeatherLocationLiveMarkers'
import { WeatherMapPanesInit } from '../map/WeatherMapPanesInit'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import { useMap } from 'react-leaflet'
import {
  WEATHER_MAP_PORTFOLIO_MAX_ZOOM,
  WEATHER_MAP_WORLD_CENTER,
  WEATHER_MAP_WORLD_ZOOM,
} from '../config/weatherMapView'
import { agriLocationLatLng } from '../map/weatherLocationPoint'
import { pulseWeatherMapLocation } from '../map/weatherMapLocationPulse'
import { WeatherMapSourceTabs, type WeatherMapSourceTab } from './WeatherMapSourceTabs'
import { WeatherWindyEmbed } from './WeatherWindyEmbed'

type Props = {
  site: WeatherFarmSite | null
  farmId: string
  portfolio: GeoJSON.FeatureCollection | null
  agriLocations?: GeoJSON.FeatureCollection | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  activeLayerId: WeatherMapLayerId
  onLayerChange: (id: WeatherMapLayerId) => void
  mapTimeIso?: string
  mapTimeIsoNext?: string
  rasterBlend?: number
  gfsRasterActive?: boolean
  gfsCycleLabel?: string | null
  mapMode: WeatherMapMode
  vizMode: WeatherVizMode
  onFieldSelect?: (feature: GeoJSON.Feature) => void
  locationRows?: WeatherLocationRow[]
  onLocationSelect?: (id: WeatherLocationId) => void
  onApplyMapPick?: (point: { lat: number; lng: number; label: string }) => void
  /** Emoji layer strip across the top of the map (off for ArcGIS-style layout). */
  showLayerStrip?: boolean
  /** Map vs Windy.com embed tabs (ArcGIS layout). */
  showMapSourceTabs?: boolean
  locationLabel?: string
  /** Open-Meteo viewport grid + IDW canvas/WebGL raster (Windy-style). */
  openMeteoInterpolatedRaster?: boolean
  mapForecastTimeline?: ReactNode
}

/** Leaflet needs invalidateSize after mobile panel swaps / grid relayout. */
function WeatherMapLayoutSync() {
  const map = useMap()
  useEffect(() => {
    const bump = () => {
      try {
        map.invalidateSize({ animate: false })
      } catch {
        /* map mid-teardown */
      }
    }
    bump()
    const raf = requestAnimationFrame(bump)
    const t1 = window.setTimeout(bump, 120)
    const t2 = window.setTimeout(bump, 450)
    const onVis = () => {
      if (document.visibilityState === 'visible') bump()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('orientationchange', bump)
    const el = map.getContainer()?.parentElement
    const ro =
      el && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => bump())
        : null
    if (ro && el) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('orientationchange', bump)
      ro?.disconnect()
    }
  }, [map])
  return null
}

function FitFarmBounds({
  site,
  farmId,
  agriLocations,
}: {
  site: WeatherFarmSite | null
  farmId: string
  agriLocations?: GeoJSON.FeatureCollection | null
}) {
  const map = useMap()
  const agriFeatureCount = agriLocations?.features?.length ?? 0
  const prevFarmIdRef = useRef(farmId)
  useEffect(() => {
    const apply = () => {
      try {
        map.invalidateSize()
      } catch {
        /* map mid-teardown */
      }

      const selectionChanged = prevFarmIdRef.current !== farmId
      prevFarmIdRef.current = farmId

      if (farmId === 'all') {
        const locFeatures = agriLocations?.features ?? []
        if (locFeatures.length) {
          const layer = L.geoJSON({ type: 'FeatureCollection', features: locFeatures })
          const bounds = layer.getBounds()
          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              padding: [48, 48],
              maxZoom: WEATHER_MAP_PORTFOLIO_MAX_ZOOM,
            })
            return
          }
        }
        map.setView(WEATHER_MAP_WORLD_CENTER, WEATHER_MAP_WORLD_ZOOM)
        return
      }

      const locationId = farmId as WeatherLocationId
      const pin = agriLocationLatLng(agriLocations, locationId)
      const focusLat = pin?.[0] ?? site?.lat
      const focusLng = pin?.[1] ?? site?.lng

      if (pin) {
        flyToLatLng(map, pin[0], pin[1], 16)
        if (selectionChanged) pulseWeatherMapLocation(map, pin[0], pin[1])
        return
      }

      if (!site) {
        map.setView(WEATHER_MAP_WORLD_CENTER, WEATHER_MAP_WORLD_ZOOM)
        return
      }

      if (site.featureCollection.features.length) {
        const flew = flyToGeoJsonExtent(map, site.featureCollection, {
          padding: [40, 40],
          maxZoom: 14,
        })
        if (flew && selectionChanged && Number.isFinite(focusLat) && Number.isFinite(focusLng)) {
          pulseWeatherMapLocation(map, focusLat!, focusLng!)
        }
        if (flew) return
      }

      if (Number.isFinite(site.lat) && Number.isFinite(site.lng)) {
        flyToLatLng(map, site.lat, site.lng, 14)
        if (selectionChanged) pulseWeatherMapLocation(map, site.lat, site.lng)
      }
    }

    map.whenReady(() => {
      window.requestAnimationFrame(apply)
    })
  }, [map, site, farmId, agriFeatureCount, agriLocations])
  return null
}

export function WeatherMapStage({
  site,
  farmId,
  portfolio,
  agriLocations = null,
  agriLocationDrawingInfo = null,
  activeLayerId,
  onLayerChange,
  mapTimeIso,
  mapMode,
  vizMode,
  onFieldSelect,
  locationRows = [],
  onLocationSelect,
  onApplyMapPick,
  showLayerStrip = true,
  showMapSourceTabs = false,
  locationLabel,
  mapTimeIsoNext,
  rasterBlend = 0,
  gfsRasterActive = false,
  gfsCycleLabel = null,
  openMeteoInterpolatedRaster = false,
  mapForecastTimeline = null,
}: Props) {
  const [mapSourceTab, setMapSourceTab] = useState<WeatherMapSourceTab>('map')
  const [openMeteoPickActive, setOpenMeteoPickActive] = useState(false)
  const [basemapId, setBasemapId] = useState(() => readWeatherBasemapId())
  const onBasemapChange = useCallback((id: string) => {
    const resolved = resolveBasemapId(id)
    setBasemapId(resolved)
    writeWeatherBasemapId(resolved)
  }, [])
  const layerDef = getWeatherMapLayer(activeLayerId)
  const [fieldGrid, setFieldGrid] = useState<FieldGridPoint[]>([])
  const [fieldGridNext, setFieldGridNext] = useState<FieldGridPoint[]>([])
  const [windGrid, setWindGrid] = useState<WindGridPoint[]>([])
  const showWeatherField = mapMode !== 'climate'
  const showInterpolatedRaster =
    showWeatherField && openMeteoInterpolatedRaster && vizMode !== 'points'
  const showWindParticles =
    showWeatherField &&
    (showInterpolatedRaster
      ? activeLayerId === 'wind_speed' || activeLayerId === 'wind_direction'
      : activeLayerId === 'wind_speed' ||
        activeLayerId === 'wind_direction' ||
        vizMode === 'wind' ||
        vizMode === 'animated')
  const showPrecipAnimation =
    showWeatherField &&
    !showInterpolatedRaster &&
    isPrecipLayer(activeLayerId) &&
    vizMode !== 'points'
  const fieldOpacity = showInterpolatedRaster ? WEATHER_OPEN_METEO_RASTER_DEFAULT_OPACITY : 0.76
  const showRasterTiles = showWeatherField && vizMode !== 'points' && !showInterpolatedRaster
  const useGfsTiles = showRasterTiles && gfsRasterActive

  const center = WEATHER_MAP_WORLD_CENTER

  const basemapLayers = useMemo(() => {
    const customSatellite = String(import.meta.env.VITE_WEATHER_VIIRS_IMAGE_SERVER ?? '').trim()
    const resolved = resolveBasemapId(basemapId)
    if (customSatellite && (resolved === 'satellite' || resolved === DEFAULT_BASEMAP_ID)) {
      return [{ url: getWeatherSatelliteTileUrl(), attribution: 'Tiles © Esri', opacity: 1 }]
    }
    const entry = catalogEntryById(buildBasemapCatalog(), resolved)
    if (entry?.leafletLayers?.length) return entry.leafletLayers
    return [{ url: getWeatherSatelliteTileUrl(), attribution: 'Tiles © Esri', opacity: 1 }]
  }, [basemapId])

  const farmStyle = useMemo(
    () => ({
      color: '#4ade80',
      weight: 2.5,
      fillColor: '#22c55e',
      fillOpacity: mapMode === 'agriculture' ? 0.14 : 0.1,
    }),
    [mapMode],
  )

  const portfolioData = mapMode === 'agriculture' ? portfolio : null

  const climateLayer = WEATHER_PHASE2_LAYERS.find(l => l.id === 'climate_era5_annual_temp')
  const climateUrl = climateLayer && isWeatherPhase2LayerConfigured(climateLayer)
    ? String(import.meta.env.VITE_WEATHER_CLIMATE_LAYER_URL ?? '')
    : ''

  const windyLayers = WEATHER_WINDY_LAYER_IDS.map(id => getWeatherMapLayer(id))

  const windyLat = site?.lat ?? center[0]
  const windyLng = site?.lng ?? center[1]
  const showLeaflet = !showMapSourceTabs || mapSourceTab === 'map'
  const showWindy = showMapSourceTabs && mapSourceTab === 'windy'

  return (
    <div className="weather-map-stage">
      <div className="weather-map-stage__map">
        {showMapSourceTabs ? (
          <WeatherMapSourceTabs value={mapSourceTab} onChange={setMapSourceTab} />
        ) : null}
        {showLayerStrip ? (
          <div className="weather-map-stage__layers-top" role="tablist" aria-label="Weather layers">
            {windyLayers.map((l, index) => {
              const chip = weatherLayerChipMeta(l.id)
              const active = l.id === activeLayerId
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={l.label}
                  title={`${l.label} (${l.unit})`}
                  className={`weather-map-stage__chip weather-map-stage__chip--icon weather-map-stage__layer-chip${active ? ' is-active' : ''}`}
                  style={{ ['--layer-chip-i' as string]: index }}
                  onClick={() => onLayerChange(l.id)}
                >
                  <span
                    className={`weather-map-stage__chip-emoji weather-map-stage__chip-emoji--${chip.anim}${active ? ' is-active' : ''}`}
                    aria-hidden
                  >
                    {chip.emoji}
                  </span>
                  <span className="weather-map-stage__chip-hint">{l.unit}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="weather-map-stage__map-body">
        {showWindy ? (
          <WeatherWindyEmbed
            lat={windyLat}
            lng={windyLng}
            farmId={farmId}
            locationLabel={locationLabel}
            activeLayerId={activeLayerId}
          />
        ) : null}
        {showLeaflet ? (
        <MapView
          center={center}
          zoom={WEATHER_MAP_WORLD_ZOOM}
          showBaseLayer={false}
          showZoomControl
          zoomControlPosition="bottomright"
          showScaleControl={false}
          attributionControl={false}
          developEliteMap
          smoothInteraction
        >
          <WeatherMapPanesInit />
          <WeatherMapLayoutSync />
          {basemapLayers.map((layer, index) => (
            <TileLayer
              key={`${layer.url}-${index}`}
              url={layer.url}
              attribution={layer.attribution}
              opacity={layer.opacity ?? 1}
              pane="tilePane"
              zIndex={1}
            />
          ))}
          {showInterpolatedRaster && fieldGrid.length < 10 ? (
            <WeatherOpenMeteoTileLayer
              layer={layerDef}
              mapTimeIso={mapTimeIso}
              opacity={Math.min(0.92, fieldOpacity + 0.08)}
            />
          ) : null}
          {showRasterTiles ? (
            useGfsTiles ? (
              <WeatherGfsTileLayer
                layer={layerDef}
                mapTimeIso={mapTimeIso}
                nextTimeIso={mapTimeIsoNext}
                blend={rasterBlend}
                opacity={0.9}
              />
            ) : (
              <WeatherOpenMeteoTileLayer layer={layerDef} mapTimeIso={mapTimeIso} opacity={0.9} />
            )
          ) : null}
          {showWeatherField ? (
            <WeatherLiveRasterOverlay
              samples={fieldGrid}
              samplesNext={fieldGridNext}
              frameBlend={rasterBlend}
              layer={layerDef}
              geographicCanvas={showInterpolatedRaster}
              enabled={
                showInterpolatedRaster
                  ? fieldGrid.length >= 3
                  : fieldGrid.length >= 3 && vizMode !== 'heatmap'
              }
              opacity={fieldOpacity}
            />
          ) : null}
          {showWindParticles ? (
            <WeatherWindParticleOverlay samples={windGrid} enabled={windGrid.length >= 4} particleCount={1800} />
          ) : null}
          {showPrecipAnimation ? (
            <WeatherPrecipAnimationOverlay
              precipSamples={fieldGrid}
              windSamples={windGrid}
              layer={layerDef}
              enabled={fieldGrid.length >= 4}
            />
          ) : null}
          {mapMode === 'climate' && climateUrl ? (
            <TileLayer url={climateUrl} opacity={0.7} zIndex={210} />
          ) : null}
          {portfolioData?.features?.length ? (
            <GeoJSON key="portfolio" data={portfolioData} style={farmStyle as L.PathOptions} />
          ) : null}
          {site ? (
            <GeoJSON
              key={farmId}
              data={site.featureCollection}
              style={farmStyle as L.PathOptions}
              onEachFeature={(feature, layer) => {
                layer.on('click', () => onFieldSelect?.(feature))
              }}
            />
          ) : null}
          <WeatherAgriLocationLayer
            geojson={agriLocations}
            drawingInfo={agriLocationDrawingInfo}
          />
          <WeatherLocationLiveMarkers
            geojson={agriLocations}
            rows={locationRows}
            selectedId={farmId as WeatherLocationId}
            onSelect={onLocationSelect}
            enabled={mapMode !== 'climate'}
          />
          <WeatherMapOpenMeteoPickEngine active={openMeteoPickActive} onApplyPick={onApplyMapPick} />
          <FitFarmBounds site={site} farmId={farmId} agriLocations={agriLocations} />
          <WeatherFieldGridLoader
            layer={layerDef}
            mapTimeIso={mapTimeIso}
            mapTimeIsoNext={mapTimeIsoNext}
            enabled={showWeatherField}
            onSamples={({ current, next }) => {
              setFieldGrid(current)
              setFieldGridNext(next)
            }}
          />
          <WeatherWindGridLoader
            mapTimeIso={mapTimeIso}
            enabled={showWeatherField && (showWindParticles || showPrecipAnimation)}
            onSamples={setWindGrid}
          />
          {mapMode !== 'climate' ? (
            <WeatherMapInsightRail
              openMeteoActive={openMeteoPickActive}
              onOpenMeteoActiveChange={setOpenMeteoPickActive}
              basemapId={basemapId}
              onBasemapChange={onBasemapChange}
            />
          ) : null}
        </MapView>
        ) : null}
        {showLeaflet && mapMode === 'climate' && climateUrl ? (
          <div className="weather-map-stage__banner">Historical climate — NOT LIVE WEATHER</div>
        ) : null}
        {showLeaflet && mapMode !== 'climate' && useGfsTiles && gfsCycleLabel ? (
          <div className="weather-map-stage__gfs-badge" title="NOAA GFS forecast cycle">
            {gfsCycleLabel}
          </div>
        ) : null}
        {showLeaflet ? mapForecastTimeline : null}
        </div>
      </div>
    </div>
  )
}
