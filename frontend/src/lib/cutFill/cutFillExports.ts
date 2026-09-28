import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { buildAoiGeoTiff, downloadBlob, type GeoBand } from '../hydroWatershed/geoTiffExport'
import { downloadTreeShapefile } from '../treeDetection/shapefileExport'
import { readCurrentUser } from '../auth'
import type { CutFillAnalysisResult, CutFillSummary, CutFillTableRow } from './cutFillTypes'

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

export type CutFillReportVolumes = {
  areaSqM: number
  cutCuM: number
  fillCuM: number
  netLabel: string
  cutFactorLabel: string
  fillFactorLabel: string
}

function fmt2(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

function fmt3(n: number): string {
  return (Number.isFinite(n) ? n : 1).toFixed(3)
}

/** `6399943.57<-Cut->` when cut exceeds fill, otherwise `<-Fill->`. */
export function formatCutFillNetCuM(cutCuM: number, fillCuM: number): string {
  const net = (Number.isFinite(cutCuM) ? cutCuM : 0) - (Number.isFinite(fillCuM) ? fillCuM : 0)
  if (Math.abs(net) < 0.005) return '0.00'
  if (net > 0) return `${net.toFixed(2)}<-Cut->`
  return `${(-net).toFixed(2)}<-Fill->`
}

export function formatCutFillReportStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

/** Volume Summary / Totals figures. Factors default to 1.000 (unadjusted). */
export function cutFillReportVolumes(
  summary: CutFillSummary,
  cutFactor = 1,
  fillFactor = 1,
): CutFillReportVolumes {
  const cf = Number.isFinite(cutFactor) && cutFactor > 0 ? cutFactor : 1
  const ff = Number.isFinite(fillFactor) && fillFactor > 0 ? fillFactor : 1
  const cutCuM = summary.cutVolumeM3 * cf
  const fillCuM = summary.fillVolumeM3 * ff
  return {
    areaSqM: summary.cutAreaM2 + summary.fillAreaM2 + summary.noChangeAreaM2,
    cutCuM,
    fillCuM,
    netLabel: formatCutFillNetCuM(cutCuM, fillCuM),
    cutFactorLabel: fmt3(cf),
    fillFactorLabel: fmt3(ff),
  }
}

export type CutFillPdfReportMeta = {
  generatedAt?: Date
  userName?: string
  drawing?: string
  cutFactor?: number
  fillFactor?: number
}

function blackBar(doc: jsPDF, label: string, y: number, x: number, width: number, centered: boolean): number {
  const height = centered ? 10 : 8
  doc.setFillColor(0, 0, 0)
  doc.rect(x, y, width, height, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(centered ? 14 : 11)
  doc.text(label, centered ? x + width / 2 : x + 3, y + height / 2 + 1.2, { align: centered ? 'center' : 'left' })
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  return y + height
}

export function exportCutFillPdfReport(
  result: CutFillAnalysisResult,
  filename = 'Cut-Fill-Report.pdf',
  meta: CutFillPdfReportMeta = {},
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: 'Cut/Fill Report', subject: 'Cut and fill volume summary' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12
  const contentW = pageW - margin * 2
  const volumes = cutFillReportVolumes(result.summary, meta.cutFactor, meta.fillFactor)
  const generated = formatCutFillReportStamp(meta.generatedAt ?? new Date())
  const userName = meta.userName?.trim() || readCurrentUser()?.name?.trim() || 'User'
  const drawing =
    meta.drawing?.trim() ||
    `AgroCloud Cut/Fill · ${result.parameters.crsLabel} · ${result.parameters.verticalDatumLabel}`

  let y = blackBar(doc, 'Cut/Fill Report', 10, margin, contentW, true) + 8
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  const metaRows: Array<[string, string]> = [
    ['Generated:', generated],
    ['By user:', userName],
    ['Drawing:', drawing],
  ]
  for (const [label, value] of metaRows) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 42, y)
    y += 6
  }

  y = blackBar(doc, 'Volume Summary', y + 4, margin, contentW, false)
  const head = [
    ['Name', 'Type', 'Cut Factor', 'Fill Factor', '2d Area\n(sq.m)', 'Cut\n(Cu. M.)', 'Fill\n(Cu. M.)', 'Net\n(Cu. M.)'],
  ]
  const summaryRow = [
    'Cut and Fill',
    'full',
    volumes.cutFactorLabel,
    volumes.fillFactorLabel,
    fmt2(volumes.areaSqM),
    fmt2(volumes.cutCuM),
    fmt2(volumes.fillCuM),
    volumes.netLabel,
  ]
  const tableStyles = {
    font: 'helvetica',
    fontSize: 9,
    textColor: [0, 0, 0] as [number, number, number],
    lineColor: [160, 160, 160] as [number, number, number],
    lineWidth: 0.15,
    halign: 'center' as const,
    valign: 'middle' as const,
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    head,
    body: [summaryRow],
    styles: tableStyles,
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
    },
    bodyStyles: { fillColor: [255, 255, 255] },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  y = blackBar(doc, 'Totals', y, margin, contentW, false)
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    head: [['', '', '', '', '2d Area\n(sq.m)', 'Cut\n(Cu. M.)', 'Fill\n(Cu. M.)', 'Net\n(Cu. M.)']],
    body: [['Total', '', '', '', fmt2(volumes.areaSqM), fmt2(volumes.cutCuM), fmt2(volumes.fillCuM), volumes.netLabel]],
    styles: tableStyles,
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    didParseCell: data => {
      if (data.section === 'head' && data.column.index < 4) {
        data.cell.styles.fillColor = [255, 255, 255]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.lineWidth = 0
      }
    },
  })

  const footY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('* Value adjusted by cut or fill factor other than 1.0', pageW - margin, footY, { align: 'right' })
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
