import { useMemo } from 'react'
import type { GeoJSONOptions, PathOptions } from 'leaflet'
import { GeoJSON, useMap } from 'react-leaflet'
import { DEVELOP_ELITE_MAP_DATA_PANE } from './developEliteMapPanes'
import { createDevelopEliteMapDataSvgRenderer } from './developEliteMapRenderers'

type Props = {
  data: GeoJSON.GeoJsonObject
  layerKey: string
  style?: PathOptions | ((feature?: GeoJSON.Feature) => PathOptions)
  onEachFeature?: GeoJSONOptions['onEachFeature']
  interactive?: boolean
}

/** Agro structures and other dashboard vectors — explicit SVG on the data pane. */
export function DevelopEliteMapVectorGeoJson({
  data,
  layerKey,
  style,
  onEachFeature,
  interactive = true,
}: Props) {
  const map = useMap()
  const renderer = useMemo(() => createDevelopEliteMapDataSvgRenderer(map), [map])

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      pane={DEVELOP_ELITE_MAP_DATA_PANE}
      renderer={renderer}
      smoothFactor={1}
      style={style}
      onEachFeature={onEachFeature}
      interactive={interactive}
    />
  )
}
