import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import {
  GIS_FLOAT_NODATA,
  buildGdalPamAuxXml,
  computeFloatRasterStats,
  writeFloat32GisGeoTiff,
  writeRgbGisGeoTiff,
} from '../gis/gisGeoTiffWriter'
import { downloadBlob } from '../hydroWatershed/geoTiffExport'
import type { ChirpsRasterResponse, ChirpsTimeseriesResponse } from './chirpsClient'
import {
  CHIRPS_PRECIP_RAMP,
  buildChirpsAnalytics,
  type ChirpsAnalytics,
  type ChirpsSeriesPoint,
} from './chirpsIndices'

function sampleRamp(value: number, ramp: Array<[number, number]>): [number, number, number] {
  if (!ramp.length) return [0, 0, 0]
  if (value <= ramp[0]![0]) {
    const c = ramp[0]![1]
    return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
  }
  if (value >= ramp[ramp.length - 1]![0]) {
    const c = ramp[ramp.length - 1]![1]
    return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
  }
  for (let i = 0; i < ramp.length - 1; i += 1) {
    const [v0, c0] = ramp[i]!
    const [v1, c1] = ramp[i + 1]!
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0 || 1)
      const r0 = (c0 >> 16) & 0xff
      const g0 = (c0 >> 8) & 0xff
      const b0 = c0 & 0xff
      const r1 = (c1 >> 16) & 0xff
      const g1 = (c1 >> 8) & 0xff
      const b1 = c1 & 0xff
      return [
        Math.round(r0 + (r1 - r0) * t),
        Math.round(g0 + (g1 - g0) * t),
        Math.round(b0 + (b1 - b0) * t),
      ]
    }
  }
  const c = ramp[ramp.length - 1]![1]
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
}

export async function exportChirpsGeoTiffZip(raster: ChirpsRasterResponse, aoiName = 'aoi'): Promise<string> {
  const nodata = GIS_FLOAT_NODATA
  const samples = new Float32Array(raster.values.length)
  for (let i = 0; i < raster.values.length; i += 1) {
    const v = raster.values[i]!
    samples[i] = Number.isFinite(v) && v > -9000 ? v : nodata
  }
  const rgba = new Uint8Array(samples.length * 4)
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]!
    const o = i * 4
    if (v === nodata) {
      rgba[o + 3] = 0
      continue
    }
    const [r, g, b] = sampleRamp(v, CHIRPS_PRECIP_RAMP)
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }

  const floatTif = writeFloat32GisGeoTiff({
    width: raster.width,
    height: raster.height,
    samples,
    pixelScaleX: (raster.east - raster.west) / raster.width,
    pixelScaleY: (raster.north - raster.south) / raster.height,
    tiepointX: raster.west,
    tiepointY: raster.north,
    epsg: 4326,
    geographic: true,
    nodata,
    description: `CHIRPS rainfall mm · ${raster.date}`,
  })
  const rgbTif = writeRgbGisGeoTiff({
    width: raster.width,
    height: raster.height,
    pixels: rgba,
    samplesPerPixel: 4,
    pixelScaleX: (raster.east - raster.west) / raster.width,
    pixelScaleY: (raster.north - raster.south) / raster.height,
    tiepointX: raster.west,
    tiepointY: raster.north,
    epsg: 4326,
    geographic: true,
  })
  const stats = computeFloatRasterStats(samples, nodata)
  const stem = `chirps_precip_${raster.date.replace(/-/g, '')}`
  const zip = new JSZip()
  zip.file(`${stem}.tif`, floatTif)
  zip.file(`${stem}_rgb.tif`, rgbTif)
  zip.file(
    `${stem}.tif.aux.xml`,
    buildGdalPamAuxXml({ nodata, stats, bandName: 'Rainfall_mm' }),
  )
  zip.file(
    'README.txt',
    [
      'AgroCloud — UCSB CHIRPS Precipitation GeoTIFF',
      `Date: ${raster.date}`,
      `Product: ${raster.product}`,
      'Unit: mm',
      `NoData: ${nodata}`,
      'Open *_rgb.tif in ArcGIS Pro for colour display.',
      `AOI: ${aoiName}`,
    ].join('\n'),
  )
  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `${stem}_${aoiName.replace(/[^\w.-]+/g, '_').slice(0, 32)}.zip`
  downloadBlob(blob, filename)
  return filename
}

export function exportChirpsCsv(
  points: ChirpsSeriesPoint[],
  analytics: ChirpsAnalytics,
  meta: { aoiName: string; start: string; end: string },
): string {
  const lines = [
    'date,rainfall_mm',
    ...points.map(p => `${p.date},${p.rainfallMm ?? ''}`),
    '',
    'metric,value',
    `total_mm,${analytics.totalMm ?? ''}`,
    `mean_mm,${analytics.meanMm ?? ''}`,
    `std_mm,${analytics.stdMm ?? ''}`,
    `RAI_pct,${analytics.rai ?? ''}`,
    `SPI,${analytics.spi ?? ''}`,
    `SPI_label,${analytics.spiLabel}`,
    `RTI_slope,${analytics.rti ?? ''}`,
    `RDI,${analytics.rdi ?? ''}`,
    `WAI,${analytics.wai ?? ''}`,
    `aoi,${meta.aoiName}`,
    `start,${meta.start}`,
    `end,${meta.end}`,
    'source,UCSB CHIRPS v2.0',
  ]
  const filename = `chirps_rainfall_${meta.start.replace(/-/g, '')}_${meta.end.replace(/-/g, '')}.csv`
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), filename)
  return filename
}

export function exportChirpsExcel(
  points: ChirpsSeriesPoint[],
  analytics: ChirpsAnalytics,
  meta: { aoiName: string; start: string; end: string; source?: string },
): string {
  const wb = XLSX.utils.book_new()
  const series = points.map(p => ({ Date: p.date, Rainfall_mm: p.rainfallMm }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(series), 'Rainfall Series')
  const summary = [
    ['Metric', 'Value'],
    ['AOI', meta.aoiName],
    ['Start', meta.start],
    ['End', meta.end],
    ['Source', meta.source || 'UCSB CHIRPS v2.0'],
    ['Total Precipitation P (mm)', analytics.totalMm],
    ['Mean (mm)', analytics.meanMm],
    ['Std (mm)', analytics.stdMm],
    ['RAI (%)', analytics.rai],
    ['SPI', analytics.spi],
    ['SPI class', analytics.spiLabel],
    ['RTI slope (mm/step)', analytics.rti],
    ['RDI', analytics.rdi],
    ['WAI', analytics.wai],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Analytics')
  const filename = `chirps_rainfall_analytics_${meta.start.replace(/-/g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  return filename
}

export function buildChirpsAnalyticsFromTimeseries(
  ts: ChirpsTimeseriesResponse,
  opts?: { ndmi?: number | null; ndwi?: number | null },
): ChirpsAnalytics {
  return buildChirpsAnalytics(ts.points, {
    ndmi: opts?.ndmi,
    ndwi: opts?.ndwi,
    historicalMeanMm: ts.summary.meanMm,
  })
}
