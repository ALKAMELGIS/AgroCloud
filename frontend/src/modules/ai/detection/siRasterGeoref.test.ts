import { describe, expect, it } from 'vitest'
import {
  boundsFromWorldFile,
  findRasterSidecars,
  imageCornersInSourceCrs,
  mapboxCoordinatesFromSourceCorners,
  parseEpsgFromPrjWkt,
  parseWorldFile,
  validateWorldFileTransform,
} from './siRasterGeoref'

describe('siRasterGeoref', () => {
  it('parses EPSG from WKT authority', () => {
    const wkt =
      'PROJCS["WGS_1984_UTM_Zone_38N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",45],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1],AUTHORITY["EPSG","32638"]]'
    expect(parseEpsgFromPrjWkt(wkt)).toBe('EPSG:32638')
  })

  it('finds world file and prj sidecars by stem', () => {
    const image = new File(['img'], 'scene.jpg')
    const jgw = new File(['wf'], 'scene.jgw')
    const prj = new File(['prj'], 'scene.prj')
    const sidecars = findRasterSidecars([image, jgw, prj], image)
    expect(sidecars?.worldFile?.name).toBe('scene.jgw')
    expect(sidecars?.prjFile?.name).toBe('scene.prj')
  })

  it('pairs a lone world sidecar when stems differ but only one sidecar is selected', () => {
    const image = new File(['img'], 'PREVIEW_PNEO4_STD_2.jpg')
    const jgw = new File(['wf'], 'export.jgw')
    const sidecars = findRasterSidecars([image, jgw], image)
    expect(sidecars?.worldFile?.name).toBe('export.jgw')
  })

  it('finds GDAL aux.xml sidecars by full raster filename', () => {
    const image = new File(['img'], 'scene.jpg')
    const aux = new File(
      ['<PAMDataset><GeoTransform>0.5,0,0,-0.5,500000,4000000</GeoTransform></PAMDataset>'],
      'scene.jpg.aux.xml',
    )
    const sidecars = findRasterSidecars([image, aux], image)
    expect(sidecars?.auxXmlFile?.name).toBe('scene.jpg.aux.xml')
    expect(sidecars?.worldFile).toBeNull()
  })

  it('projects UTM world-file corners to WGS84 using .prj', () => {
    const wf = parseWorldFile(`0.5\n0\n0\n-0.5\n500000\n3000000\n`)
    expect(wf).not.toBeNull()
    if (!wf) return
    const corners = imageCornersInSourceCrs(wf, 200, 200)
    const wgs = mapboxCoordinatesFromSourceCorners(corners, 'EPSG:32638')
    expect(wgs[0][0]).toBeGreaterThan(44)
    expect(wgs[0][0]).toBeLessThan(46)
    expect(wgs[2][1]).toBeGreaterThan(26)
    expect(wgs[2][1]).toBeLessThan(28)
  })

  it('computes axis-aligned source bounds from world file', () => {
    const wf = parseWorldFile(`0.5\n0\n0\n-0.5\n500000\n4000000\n`)
    expect(wf).not.toBeNull()
    if (!wf) return
    const bounds = boundsFromWorldFile(wf, 1000, 1000)
    expect(bounds.east - bounds.west).toBeCloseTo(500, 3)
    expect(bounds.north - bounds.south).toBeCloseTo(500, 3)
  })

  it('rejects world files with zero pixel size', () => {
    const wf = parseWorldFile(`0\n0\n0\n0\n500000\n4000000\n`)
    expect(wf).not.toBeNull()
    if (!wf) return
    expect(() => validateWorldFileTransform(wf, 1000, 1000)).toThrow(/zero/)
  })

  it('rejects world files with invalid raster dimensions', () => {
    const wf = parseWorldFile(`0.5\n0\n0\n-0.5\n500000\n4000000\n`)
    expect(wf).not.toBeNull()
    if (!wf) return
    expect(() => validateWorldFileTransform(wf, 0, 1000)).toThrow(/invalid dimensions/)
  })
})
