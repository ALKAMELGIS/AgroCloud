import {
  buildGisContentMapLayerPayloadAsync,
  isGisContentRowInRecycle,
  refreshGisContentHostedFeatureLayerFromSource,
  registerGisContentMapLayer,
} from '../../../../lib/gisContentPortalStore'
import { isAgroStructuresPortalRow, isWorldCountriesPortalRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import type { GisContentRow } from '../../../master/gisContentPortalData'

export type AcpAddGisPortalRowResult = {
  geojson: GeoJSON.FeatureCollection | null
  message: string
  isAgroStructures: boolean
}

/** Register a GIS Content row on the ACP map and fetch live geometry when available. */
export async function addAcpGisPortalRowToMap(row: GisContentRow): Promise<AcpAddGisPortalRowResult> {
  if (isGisContentRowInRecycle(row)) {
    throw new Error('This item is in the Recycle bin — restore it from GIS Content first.')
  }
  if (isWorldCountriesPortalRow(row)) {
    throw new Error('World_Countries is not available on this map.')
  }

  registerGisContentMapLayer(row.id)
  const isAgroStructures = isAgroStructuresPortalRow(row)

  if (isAgroStructures) {
    await refreshGisContentHostedFeatureLayerFromSource(row.id)
    return {
      geojson: null,
      isAgroStructures: true,
      message: `Synced "${row.title}" from live Agro_Structures service.`,
    }
  }

  const payload = await buildGisContentMapLayerPayloadAsync(row)
  return {
    geojson: payload.geojson as GeoJSON.FeatureCollection,
    isAgroStructures: false,
    message: `Added "${row.title}" to the map.`,
  }
}
