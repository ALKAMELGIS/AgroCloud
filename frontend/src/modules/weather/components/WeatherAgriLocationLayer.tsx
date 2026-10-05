import { DevelopEliteMapArcgisLayer } from '@/modules/dashboard/develop-elite/DevelopEliteMapArcgisLayer'

type Props = {
  geojson: GeoJSON.FeatureCollection | null
  drawingInfo: Record<string, unknown> | null
}

/** Agri_Location points with ArcGIS picture/simple symbology — enlarged for weather map. */
export function WeatherAgriLocationLayer({ geojson, drawingInfo }: Props) {
  if (!geojson?.features?.length) return null
  return (
    <DevelopEliteMapArcgisLayer
      layerKey="agri-location"
      layerLabel="Agri Location"
      geojson={geojson}
      drawingInfo={drawingInfo}
      interactive={false}
      pointSymbolScaleMultiplier={1.85}
    />
  )
}
