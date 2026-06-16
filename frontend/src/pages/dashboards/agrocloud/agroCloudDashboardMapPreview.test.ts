import { describe, expect, it, beforeEach } from 'vitest'
import { buildGisWebMapSnapshot } from '../../../lib/gisWebMapPortal'
import {
  getGisContentPortalRows,
  upsertGisContentPortalWebMap,
  upsertGisContentPortalHostedFeatureLayer,
} from '../../../lib/gisContentPortalStore'
import { resolveDashboardWebMapPreview } from './agroCloudDashboardWebMapPreview'

describe('resolveDashboardWebMapPreview', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads portal layers from a saved web map snapshot', () => {
    const layerRow = upsertGisContentPortalHostedFeatureLayer({
      title: 'Agro_Structures',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'A' },
            geometry: { type: 'Point', coordinates: [55.1, 25.2] },
          },
        ],
      },
      sourceMethod: 'map-viewer',
    })

    const snapshot = buildGisWebMapSnapshot({
      basemap: 'esri-imagery',
      projection: '2d',
      mapCenterZoom: { lat: 25.2, lng: 55.1, zoom: 12 },
      layers: [
        {
          id: 'l1',
          name: layerRow.title,
          type: 'geojson',
          visible: true,
          url: `gis-content://${layerRow.id}`,
          data: { type: 'FeatureCollection', features: [] },
        },
      ],
    })

    const webMap = upsertGisContentPortalWebMap({ title: 'Field map', snapshot })
    const preview = resolveDashboardWebMapPreview(webMap.id)

    expect(preview.snapshot?.portalLayerIds).toContain(layerRow.id)
    expect(preview.layers).toHaveLength(1)
    expect(preview.layers[0]?.name).toBe('Agro_Structures')
    expect(getGisContentPortalRows().some(r => r.id === webMap.id)).toBe(true)
  })
})
