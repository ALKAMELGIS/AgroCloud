/**
 * Sentinel-2 branch: vegetation / tree-cover *zones* from greenness (NDVI-like
 * proxy on RGB), not individual tree crowns.
 */

import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import type { TreeImageryMosaic } from './webMercatorTiles'

export type VegetationZoneStats = {
  zoneCount: number
  vegetationAreaHa: number
  coverPct: number
  aoiAreaHa: number
  kind: 'vegetation_zone'
}

function greenDom(r: number, g: number, b: number): number {
  const sum = r + g + b + 1e-6
  const dom = g / sum - Math.max(r, b) / sum
  return dom <= 0 ? 0 : Math.min(1, dom * 4)
}

/**
 * Grid-cell vegetation zones from mosaic greenness. Coarse but GIS-real polygons
 * covering canopy/vegetation masses — explicitly NOT individual trees.
 */
export function extractVegetationZones(opts: {
  mosaic: TreeImageryMosaic
  geometry: GeoJSON.Geometry
  greenThresh?: number
  cellPx?: number
}): { geojson: GeoJSON.FeatureCollection; stats: VegetationZoneStats } {
  const { mosaic, geometry } = opts
  const thresh = opts.greenThresh ?? 0.22
  const cell = Math.max(8, opts.cellPx ?? 24)
  const { width, height, imageData, metersPerPixel } = mosaic
  const rgba = imageData.data
  const features: GeoJSON.Feature[] = []
  let vegCells = 0
  let totalCells = 0

  for (let y0 = 0; y0 < height; y0 += cell) {
    for (let x0 = 0; x0 < width; x0 += cell) {
      const x1 = Math.min(width, x0 + cell)
      const y1 = Math.min(height, y0 + cell)
      let gSum = 0
      let n = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * 4
          if (rgba[i + 3]! < 8) continue
          gSum += greenDom(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
          n += 1
        }
      }
      totalCells += 1
      if (!n) continue
      const mean = gSum / n
      if (mean < thresh) continue
      vegCells += 1
      const [lng0, lat0] = mosaic.pxToLngLat(x0, y0)
      const [lng1, lat1] = mosaic.pxToLngLat(x1, y0)
      const [lng2, lat2] = mosaic.pxToLngLat(x1, y1)
      const [lng3, lat3] = mosaic.pxToLngLat(x0, y1)
      const ring: [number, number][] = [
        [lng0, lat0],
        [lng1, lat1],
        [lng2, lat2],
        [lng3, lat3],
        [lng0, lat0],
      ]
      const areaM2 = cell * cell * metersPerPixel * metersPerPixel
      features.push({
        type: 'Feature',
        properties: {
          id: `veg-zone-${features.length + 1}`,
          kind: 'vegetation_zone',
          Tree_ID: `veg-zone-${features.length + 1}`,
          confidence: Number(Math.min(1, mean).toFixed(3)),
          crown_area_m2: Number(areaM2.toFixed(2)),
          crownAreaM2: Number(areaM2.toFixed(2)),
          crown_diameter_m: Number((Math.sqrt(areaM2 / Math.PI) * 2).toFixed(2)),
          crownDiameterM: Number((Math.sqrt(areaM2 / Math.PI) * 2).toFixed(2)),
          model_name: 'sentinel2-vegetation-zones',
          image_source: 'sentinel2',
          color: '#65a30d',
          sizeClass: 'medium',
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      })
    }
  }

  const aoiAreaHa = geodesicAreaM2(geometry) / 10_000
  const vegetationAreaHa = features.reduce((s, f) => s + Number(f.properties?.crown_area_m2 || 0), 0) / 10_000
  const coverPct = aoiAreaHa > 0 ? Math.min(100, (vegetationAreaHa / aoiAreaHa) * 100) : 0

  return {
    geojson: { type: 'FeatureCollection', features },
    stats: {
      zoneCount: features.length,
      vegetationAreaHa: Number(vegetationAreaHa.toFixed(3)),
      coverPct: Number(coverPct.toFixed(1)),
      aoiAreaHa: Number(aoiAreaHa.toFixed(3)),
      kind: 'vegetation_zone',
    },
  }
}

export function isSentinelVegetationMode(imageryId: string | null | undefined): boolean {
  return String(imageryId || '').toLowerCase() === 'sentinel2'
}
