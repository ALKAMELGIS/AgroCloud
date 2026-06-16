import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { GeoJSON, useMap } from 'react-leaflet'
import MapView from '../../../components/MapView'
import { useGisContentPortal } from '../../../lib/gisContentPortalStore'
import { resolveBasemapId } from '../../satellite/basemapCatalog'
import { BasemapLayer } from '../../satellite/components/BasemapGallery'
import type { GisContentMapLayerPayload } from '../../../lib/gisContentPortalStore'
import type { GisWebMapSnapshotV1 } from '../../../lib/gisWebMapPortal'
import { resolveDashboardWebMapPreview } from './agroCloudDashboardWebMapPreview'
import type { AgroCloudDashboardMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'
import { defaultMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'

const DEFAULT_CENTER: [number, number] = [2, 20]
const DEFAULT_ZOOM = 10

function boundsFromLayers(layers: GisContentMapLayerPayload[]): L.LatLngBounds | null {
  let bounds: L.LatLngBounds | null = null
  for (const layer of layers) {
    try {
      const gj = L.geoJSON(layer.geojson as GeoJSON.GeoJsonObject)
      const layerBounds = gj.getBounds()
      if (!layerBounds.isValid()) continue
      bounds = bounds ? bounds.extend(layerBounds) : layerBounds
    } catch {
      /* skip invalid layer geometry */
    }
  }
  return bounds
}

function DashboardMapViewSync({
  snapshot,
  layers,
}: {
  snapshot: GisWebMapSnapshotV1
  layers: GisContentMapLayerPayload[]
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    const hasSavedView =
      snapshot.projection !== 'globe' &&
      snapshot.center &&
      typeof snapshot.zoom === 'number' &&
      Number.isFinite(snapshot.center.lat) &&
      Number.isFinite(snapshot.center.lng)

    if (hasSavedView) {
      map.setView([snapshot.center!.lat, snapshot.center!.lng], snapshot.zoom!, { animate: false })
    } else {
      const bounds = boundsFromLayers(layers)
      if (bounds?.isValid()) {
        map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16, animate: false })
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false })
      }
    }

    window.requestAnimationFrame(() => map.invalidateSize?.())
  }, [map, snapshot, layers])

  return null
}

type Props = {
  gisContentId: string
  title?: string
  mapSettings?: AgroCloudDashboardMapWidgetSettings
  interactive?: boolean
}

function MapZoomChrome() {
  const map = useMap()
  return (
    <div
      className="agrocloud-dashboard-canvas__map-chrome agrocloud-dashboard-canvas__map-chrome--zoom"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <button type="button" aria-label="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  )
}

export function AgroCloudDashboardMapPreview({ gisContentId, title, mapSettings, interactive = false }: Props) {
  const portal = useGisContentPortal()
  const settings = mapSettings ?? defaultMapWidgetSettings(title ?? 'Map')
  const preview = useMemo(
    () => resolveDashboardWebMapPreview(gisContentId),
    [gisContentId, portal.version],
  )

  if (!preview.snapshot) {
    return (
      <div className="agrocloud-dashboard-canvas__map agrocloud-dashboard-canvas__map--empty" role="img" aria-label={title ?? 'Map'}>
        <p className="agrocloud-dashboard-canvas__map-empty-msg">No saved map view for this Web Map.</p>
      </div>
    )
  }

  const basemapId = resolveBasemapId(preview.snapshot.basemap)
  const initialCenter: [number, number] = preview.snapshot.center
    ? [preview.snapshot.center.lat, preview.snapshot.center.lng]
    : DEFAULT_CENTER
  const initialZoom =
    typeof preview.snapshot.zoom === 'number' && Number.isFinite(preview.snapshot.zoom)
      ? preview.snapshot.zoom
      : DEFAULT_ZOOM

  return (
    <div
      className="agrocloud-dashboard-canvas__map agrocloud-dashboard-canvas__map--live"
      role="img"
      aria-label={settings.accessibleName || title || 'Map'}
    >
      <MapView
        center={initialCenter}
        zoom={initialZoom}
        showBaseLayer={false}
        showZoomControl={false}
        showScaleControl={false}
      >
        <BasemapLayer selectedBasemap={basemapId} />
        {preview.layers.map(layer => (
          <GeoJSON
            key={layer.portalRowId}
            data={layer.geojson as GeoJSON.GeoJsonObject}
            style={() => ({
              color: settings.selectionColor,
              weight: 2,
              opacity: 0.92,
              fillColor: settings.followColor,
              fillOpacity: 0.28,
            })}
            pointToLayer={(_, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: settings.selectionColor,
                weight: 2,
                fillColor: settings.followColor,
                fillOpacity: 0.85,
              })
            }
          />
        ))}
        <DashboardMapViewSync snapshot={preview.snapshot} layers={preview.layers} />
        {settings.zoomInOut && interactive ? <MapZoomChrome /> : null}
      </MapView>
      {settings.scalebar !== 'none' ? (
        <div className="agrocloud-dashboard-canvas__map-chrome agrocloud-dashboard-canvas__map-chrome--scalebar" aria-hidden>
          {settings.scalebar === 'ruler' ? '0 — 5 km' : '5 km'}
        </div>
      ) : null}
    </div>
  )
}
