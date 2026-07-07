import JSZip from 'jszip'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { WellSuitabilityResult } from '../../../lib/hydroWatershed/wellSuitabilityMcdaEngine'
import { downloadTreeShapefile } from '../../../lib/treeDetection/shapefileExport'

/** Re-use tree point shapefile writer with well-suitability attribute schema. */
export async function exportWellSuitabilityShapefile(fc: GeoJSON.FeatureCollection): Promise<void> {
  const mapped: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fc.features.map((f, i) => {
      const p = (f.properties ?? {}) as Record<string, unknown>
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: String(p.rank ?? i + 1),
          sizeClass: String(p.potential_class ?? ''),
          vigor: String(p.confidence_pct ?? ''),
          confidence: Number(p.potential_score ?? 0) / 100,
          crownDiameterM: Number(p.drilling_depth_m ?? 0),
          crownAreaM2: Number(p.recharge_pct ?? 0),
          speciesLabel: String(p.aquifer_type ?? ''),
        },
      }
    }),
  }
  await downloadTreeShapefile(mapped, 'well-suitability-sites')
}

export async function exportWellSuitabilityKmz(fc: GeoJSON.FeatureCollection): Promise<void> {
  const placemarks = fc.features
    .map(f => {
      if (!f.geometry || f.geometry.type !== 'Point') return ''
      const [lng, lat] = f.geometry.coordinates as [number, number]
      const p = (f.properties ?? {}) as Record<string, unknown>
      const name = `Site #${p.rank ?? ''}`
      const desc =
        String(p.narrative ?? '') ||
        `Potential ${p.potential_score}% · Confidence ${p.confidence_pct}%`
      return (
        `<Placemark><name>${escapeXml(name)}</name>` +
        `<description><![CDATA[${desc}]]></description>` +
        `<Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>`
      )
    })
    .join('')
  const kml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>Well Suitability (MCDA)</name>${placemarks}</Document></kml>`
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'well-suitability-sites.kmz'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function exportWellSuitabilityWorkbook(result: WellSuitabilityResult): boolean {
  const wb = XLSX.utils.book_new()
  const rows = result.points.map(p => ({
    Rank: p.rank,
    Longitude: p.lng,
    Latitude: p.lat,
    'Potential %': p.potentialScore,
    'Confidence %': p.confidencePct,
    Class: p.potentialClass,
    'Drilling depth (m)': p.drillingDepthM,
    'Static WL (m)': p.staticWaterLevelM,
    'Stream dist (m)': p.streamDistM,
    'Recharge %': p.rechargePotential,
    'Slope (°)': p.slopeDeg,
    'Geology %': p.geologicalSuitability,
    'Aquifer type': p.aquiferType,
    Narrative: p.narrative,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Ranked sites')
  const wRows = Object.entries(result.weightsUsed).map(([k, v]) => ({
    Criterion: k,
    Weight: v,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wRows), 'MCDA weights')
  XLSX.writeFile(wb, 'well-suitability-mcda.xlsx')
  return true
}

export function exportWellSuitabilityPdf(result: WellSuitabilityResult): boolean {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFontSize(14)
  doc.text('Groundwater Potential Analysis (MCDA)', 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(
    'Multi-criteria weighted overlay — terrain, hydrology, geology, land surface, climate, satellite proxies.',
    14,
    22,
  )
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 28,
    head: [['Criterion', 'Weight']],
    body: Object.entries(result.weightsUsed).map(([k, v]) => [k, `${(v * 100).toFixed(0)}%`]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 64, 120] },
  })

  const tableRows = result.points.map(p => [
    String(p.rank),
    `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    `${p.potentialScore}%`,
    `${p.confidencePct}%`,
    p.potentialClass,
    `${p.drillingDepthM} m`,
    p.aquiferType,
  ])

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      : 40,
    head: [['#', 'Lat, Lon', 'Potential', 'Conf.', 'Class', 'Depth', 'Aquifer']],
    body: tableRows,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [22, 101, 52] },
  })

  let y =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50) + 10
  doc.setFontSize(10)
  doc.text('Site narratives', 14, y)
  y += 6
  doc.setFontSize(8)
  for (const p of result.points.slice(0, 8)) {
    const lines = doc.splitTextToSize(p.narrative, 182)
    if (y + lines.length * 4 > 285) {
      doc.addPage()
      y = 16
    }
    doc.text(lines, 14, y)
    y += lines.length * 4 + 3
  }

  doc.save('well-suitability-report.pdf')
  return true
}
