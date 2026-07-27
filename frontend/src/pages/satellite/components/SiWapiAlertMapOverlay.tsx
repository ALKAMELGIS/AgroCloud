import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { SiMapDockAwareMarker } from './SiMapDockAwareMarker'
import {
  wapiAlertResultsToGeoJson,
  type WapiAlertFieldResult,
} from '../../../lib/siWapiAlertEngine'
import { SiWapiAlertMapPopup } from './SiWapiAlertMapPopup'
import { SiWapiAlertMapMarker } from './SiWapiAlertMapMarker'
import './SiWapiAlertMapMarker.css'

export type SiWapiAlertMapOverlayProps = {
  results: WapiAlertFieldResult[]
  selectedFieldKey: string | null
  popupFieldKey: string | null
  showMapIcons?: boolean
  onSelectField?: (fieldKey: string) => void
  onClosePopup: () => void
}

export const SI_WAPI_ALERT_FILL_LAYER_ID = 'si-wapi-alert-fill'
export const SI_WAPI_ALERT_LINE_LAYER_ID = 'si-wapi-alert-line'
export const SI_WAPI_ALERT_SOURCE_ID = 'si-wapi-alert-polygons'
export const SI_WAPI_ALERT_MAP_LAYER_IDS = [
  SI_WAPI_ALERT_FILL_LAYER_ID,
  SI_WAPI_ALERT_LINE_LAYER_ID,
] as const

export function SiWapiAlertMapOverlay({
  results,
  selectedFieldKey,
  popupFieldKey,
  showMapIcons = true,
  onSelectField,
  onClosePopup,
}: SiWapiAlertMapOverlayProps) {
  const geojson = useMemo(() => wapiAlertResultsToGeoJson(results), [results])
  const popupResult = useMemo(
    () => results.find(r => r.fieldKey === popupFieldKey) ?? null,
    [results, popupFieldKey],
  )

  if (!geojson.features.length) return null

  return (
    <>
      <Source id={SI_WAPI_ALERT_SOURCE_ID} type="geojson" data={geojson as any}>
        <Layer
          id={SI_WAPI_ALERT_FILL_LAYER_ID}
          type="fill"
          paint={{
            'fill-color': ['coalesce', ['get', 'color'], '#1565c0'],
            'fill-opacity': [
              'case',
              ['==', ['get', 'fieldKey'], selectedFieldKey ?? ''],
              0.55,
              0.32,
            ],
          }}
        />
        <Layer
          id={SI_WAPI_ALERT_LINE_LAYER_ID}
          type="line"
          paint={{
            'line-color': ['coalesce', ['get', 'color'], '#1565c0'],
            'line-width': [
              'case',
              ['==', ['get', 'fieldKey'], selectedFieldKey ?? ''],
              2.75,
              1.4,
            ],
            'line-opacity': 0.95,
          }}
        />
      </Source>

      {showMapIcons
        ? results.map(result => (
            <SiMapDockAwareMarker
              key={`si-iss-alert-pin-${result.fieldKey}`}
              longitude={result.centroid[0]}
              latitude={result.centroid[1]}
              anchor="bottom"
              className="si-iss-alert-pin-marker"
              popupWidth={0}
            >
              <SiWapiAlertMapMarker
                result={result}
                selected={selectedFieldKey === result.fieldKey}
                onSelect={fieldKey => onSelectField?.(fieldKey)}
              />
            </SiMapDockAwareMarker>
          ))
        : null}

      {popupResult ? (
        <SiMapDockAwareMarker
          longitude={popupResult.centroid[0]}
          latitude={popupResult.centroid[1]}
          anchor="bottom"
          className="si-wapi-alert-popup-marker"
          popupWidth={272}
        >
          <div
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            role="presentation"
          >
            <SiWapiAlertMapPopup result={popupResult} onClose={onClosePopup} />
          </div>
        </SiMapDockAwareMarker>
      ) : null}
    </>
  )
}
