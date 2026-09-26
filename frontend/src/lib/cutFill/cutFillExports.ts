import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { buildAoiGeoTiff, downloadBlob, type GeoBand } from '../hydroWatershed/geoTiffExport'
import { downloadTreeShapefile } from '../treeDetection/shapefileExport'
import type { CutFillAnalysisResult, CutFillTableRow } from './cutFillTypes'

function downloadText(filename: string, text: string, mime: string) {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

function metaHeader(result: CutFillAnalysisResult): string[] {
  const p = result.parameters
  return [
    `# Cut & Fill Analysis export`,
    `# CRS: ${p.crsLabel}`,
    `# Vertical datum: ${p.verticalDatumLabel}`,
    `# Tolerance (m): ${p.verticalToleranceM}`,
    `# Contour interval (m): ${p.contourIntervalM}`,
    `# Generated: ${new Date().toISOString()}`,
  ]
}

export function exportCutFillCsv(result: CutFillAnalysisResult, filename = 'cut-fill-detail.csv') {
  const lines = [
    ...metaHeader(result),
    'ID,X,Y,ExistingZ,DesignZ,Difference,Type,Area_m2,Volume_m3',
    ...result.rows.map(r =>
      [
        r.id,
        r.lng.toFixed(6),
        r.lat.toFixed(6),
        r.existingZ.toFixed(3),
        r.designZ.toFixed(3),
        r.difference.toFixed(3),
        r.type,
        r.areaM2.toFixed(2),
        r.volumeM3.toFixed(2),
      ].join(','),
    ),
  ]
  downloadText(filename, lines.join('\n'), 'text/csv;charset=utf-8')
}

export async function exportCutFillExcel(result: CutFillAnalysisResult, filename = 'cut-fill-analysis.xlsx') {
  const wb = new ExcelJS.Workbook()
  const kpi = wb.addWorksheet('KPIs')
  const s = result.summary
  kpi.addRows([
    ['Metric', 'Value'],
    ['Cut volume (m³)', s.cutVolumeM3],
    ['Fill volume (m³)', s.fillVolumeM3],
    ['Net volume (m³)', s.netVolumeM3],
    ['Cut area (m²)', s.cutAreaM2],
    ['Fill area (m²)', s.fillAreaM2],
    ['No-change area (m²)', s.noChangeAreaM2],
    ['Max cut (m)', s.maxCutM],
    ['Max fill (m)', s.maxFillM],
    ['Avg |ΔZ| (m)', s.avgAbsDiffM],
    ['CRS', result.parameters.crsLabel],
    ['Vertical datum', result.parameters.verticalDatumLabel],
  ])
  const detail = wb.addWorksheet('Detail')
  detail.addRow(['ID', 'X', 'Y', 'Existing Z', 'Design Z', 'Difference', 'Type', 'Area m²', 'Volume m³'])
  for (const r of result.rows) {
    detail.addRow([r.id, r.lng, r.lat, r.existingZ, r.designZ, r.difference, r.type, r.areaM2, r.volumeM3])
  }
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf]), filename)
}

export function exportCutFillGeoJson(result: CutFillAnalysisResult, filename = 'cut-fill-cells.geojson') {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: result.rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        existingZ: r.existingZ,
        designZ: r.designZ,
        difference: r.difference,
        type: r.type,
        areaM2: r.areaM2,
        volumeM3: r.volumeM3,
      },
    })),
  }
  downloadText(filename, JSON.stringify(fc), 'application/geo+json')
}

export function exportCutFillGeoTiffDifference(
  result: CutFillAnalysisResult,
  aoiMask: Uint8Array | null,
  filename = 'cut-fill-difference.tif',
) {
  const band: GeoBand = {
    values: result.difference,
    width: result.dem.width,
    height: result.dem.height,
    zoom: result.dem.zoom,
    originWorldPxX: result.dem.originWorldPxX,
    originWorldPxY: result.dem.originWorldPxY,
    nodata: -9999,
    name: 'CutFillDifference',
  }
  const out = buildAoiGeoTiff(band, aoiMask)
  downloadBlob(out.blob, filename)
}

export async function exportCutFillShapefile(result: CutFillAnalysisResult, baseName = 'cut-fill-cells') {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: result.rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        sizeClass: r.type,
        vigor: r.type,
        confidence: r.volumeM3,
        crownDiameterM: r.areaM2,
        crownAreaM2: r.areaM2,
        species: `${r.difference.toFixed(2)}m`,
      },
    })),
  }
  await downloadTreeShapefile(fc, baseName)
}

/** Minimal ASCII DXF — points + layer by CUT/FILL. */
export function exportCutFillDxf(result: CutFillAnalysisResult, filename = 'cut-fill-points.dxf') {
  const lines: string[] = ['0', 'SECTION', '2', 'ENTITIES']
  for (const r of result.rows) {
    const layer = r.type === 'CUT' ? 'CUT' : r.type === 'FILL' ? 'FILL' : 'NO_CHANGE'
    lines.push('0', 'POINT', '8', layer, '10', String(r.lng), '20', String(r.lat), '30', String(r.existingZ))
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  downloadText(filename, lines.join('\n'), 'application/dxf')
}

export function exportCutFillPdfReport(result: CutFillAnalysisResult, filename = 'cut-fill-report.pdf') {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Cut & Fill Analysis Report', 14, 18)
  doc.setFontSize(10)
  doc.text(`CRS: ${result.parameters.crsLabel}`, 14, 26)
  doc.text(`Datum: ${result.parameters.verticalDatumLabel}`, 14, 32)
  doc.text(`Tolerance: ${result.parameters.verticalToleranceM} m`, 14, 38)
  const s = result.summary
  autoTable(doc, {
    startY: 44,
    head: [['Metric', 'Value']],
    body: [
      ['Cut volume (m³)', s.cutVolumeM3.toFixed(1)],
      ['Fill volume (m³)', s.fillVolumeM3.toFixed(1)],
      ['Net volume (m³)', s.netVolumeM3.toFixed(1)],
      ['Cut area (m²)', s.cutAreaM2.toFixed(0)],
      ['Fill area (m²)', s.fillAreaM2.toFixed(0)],
      ['Max cut (m)', s.maxCutM.toFixed(2)],
      ['Max fill (m)', s.maxFillM.toFixed(2)],
    ],
  })
  doc.setFontSize(8)
  doc.text(
    'Grid-based surface volume (ArcGIS Surface Volume equivalent). Terrarium DEM is ~10–30 m; use survey GeoTIFF for engineering grade.',
    14,
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
    { maxWidth: 180 },
  )
  doc.save(filename)
}

export type CutFillExportKind = 'csv' | 'xlsx' | 'geojson' | 'geotiff' | 'shp' | 'dxf' | 'pdf'

export async function runCutFillExport(kind: CutFillExportKind, result: CutFillAnalysisResult, aoiMask: Uint8Array | null) {
  switch (kind) {
    case 'csv':
      exportCutFillCsv(result)
      break
    case 'xlsx':
      await exportCutFillExcel(result)
      break
    case 'geojson':
      exportCutFillGeoJson(result)
      break
    case 'geotiff':
      exportCutFillGeoTiffDifference(result, aoiMask)
      break
    case 'shp':
      await exportCutFillShapefile(result)
      break
    case 'dxf':
      exportCutFillDxf(result)
      break
    case 'pdf':
      exportCutFillPdfReport(result)
      break
    default:
      break
  }
}
