import proj4 from 'proj4'

/** Auto UTM EPSG code from WGS84 centroid (engineering volume workflows). */
export function suggestUtmEpsgFromLngLat(lng: number, lat: number): { epsg: number; label: string } {
  const zone = Math.floor((lng + 180) / 6) + 1
  const north = lat >= 0
  const epsg = north ? 32600 + zone : 32700 + zone
  const hemi = north ? 'N' : 'S'
  return { epsg, label: `EPSG:${epsg} (UTM zone ${zone}${hemi})` }
}

export function utmProjDef(epsg: number): string | null {
  if (epsg >= 32601 && epsg <= 32660) {
    const zone = epsg - 32600
    return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`
  }
  if (epsg >= 32701 && epsg <= 32760) {
    const zone = epsg - 32700
    return `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`
  }
  return null
}

export function lngLatToProjectedM(lng: number, lat: number, epsg: number): [number, number] | null {
  const def = utmProjDef(epsg)
  if (!def) return null
  const out = proj4('EPSG:4326', def, [lng, lat])
  return [out[0]!, out[1]!]
}

/** Ground area (m²) per cell from Web-Mercator pixel size at latitude. */
export function cellAreaM2(metersPerPixel: number): number {
  const m = Math.max(0.01, metersPerPixel)
  return m * m
}
