import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { inspectGeoTiff } from '@/modules/ai/detection/siAiDlRasterPipeline'

function bilinearSample(
  data: Float32Array,
  w: number,
  h: number,
  u: number,
  v: number,
  nodata: number | null,
): number {
  if (u < 0 || v < 0 || u > w - 1 || v > h - 1) return NaN
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const tx = u - x0
  const ty = v - y0
  const sample = (ix: number, iy: number) => {
    const val = data[iy * w + ix]!
    if (nodata != null && val === nodata) return NaN
    return Number.isFinite(val) ? val : NaN
  }
  const v00 = sample(x0, y0)
  const v10 = sample(x1, y0)
  const v01 = sample(x0, y1)
  const v11 = sample(x1, y1)
  if (!Number.isFinite(v00 + v10 + v01 + v11)) {
    const vals = [v00, v10, v01, v11].filter(Number.isFinite)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN
  }
  const a = v00 + (v10 - v00) * tx
  const b = v01 + (v11 - v01) * tx
  return a + (b - a) * ty
}

/** Resample band 0 of a GeoTIFF onto the analysis DEM grid (WGS84 footprint). */
export async function sampleGeoTiffFileToDemGrid(file: File, dem: DemGrid): Promise<Float32Array> {
  const inspected = await inspectGeoTiff(file)
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(await file.arrayBuffer())
  const image = await tiff.getImage()
  const tw = Math.min(image.getWidth(), dem.width * 4)
  const th = Math.min(image.getHeight(), dem.height * 4)
  const rasters = await image.readRasters({ width: tw, height: th })
  const bandRaw = Array.isArray(rasters) ? rasters[0] : rasters
  const flat = Float32Array.from(bandRaw as ArrayLike<number>)
  const nodata = inspected.noDataValues[0] ?? null

  const coords = inspected.coordinatesWgs84
  const west = Math.min(coords[0]![0], coords[3]![0])
  const east = Math.max(coords[1]![0], coords[2]![0])
  const north = Math.max(coords[0]![1], coords[1]![1])
  const south = Math.min(coords[2]![1], coords[3]![1])

  const out = new Float32Array(dem.width * dem.height)
  for (let y = 0; y < dem.height; y += 1) {
    for (let x = 0; x < dem.width; x += 1) {
      const [lng, lat] = dem.pxToLngLat(x + 0.5, y + 0.5)
      if (lng < west || lng > east || lat < south || lat > north) {
        out[y * dem.width + x] = NaN
        continue
      }
      const u = ((lng - west) / Math.max(1e-9, east - west)) * (tw - 1)
      const v = ((north - lat) / Math.max(1e-9, north - south)) * (th - 1)
      out[y * dem.width + x] = bilinearSample(flat, tw, th, u, v, nodata)
    }
  }
  return out
}
