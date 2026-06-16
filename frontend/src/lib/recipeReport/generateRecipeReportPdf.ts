import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RecipeColumn } from '../formFieldColumns'
import type { RecipeRow } from './loadRecipeRows'
import {
  bboxFromPts,
  collectLngLats,
  findLayerGeoJson,
  loadStoredLayers,
  primaryLayerSourceId,
} from './layerGeo'
import { getGeminiApiKey } from '../geminiApiKey'
import { getMapboxAccessToken } from '../mapboxAccessToken'
import { fetchRecipeReportInsightsFromGemini } from './recipeReportGemini'

const ACCENT: [number, number, number] = [4, 120, 87]
const ACCENT_DARK: [number, number, number] = [6, 78, 59]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const PAGE_MARGIN_MM = 12
const ELITE_LOGO_URL = 'https://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png'

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return n.toExponential(2)
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

function parseNumericValues(rows: RecipeRow[], colId: string): number[] {
  const nums: number[] = []
  for (const r of rows) {
    const t = String(r.cells[colId] ?? '').trim().replace(/,/g, '')
    if (!t) continue
    const n = Number(t)
    if (Number.isFinite(n)) nums.push(n)
  }
  return nums
}

function computeNumericSummaries(columns: RecipeColumn[], rows: RecipeRow[]) {
  const summaries: Array<{
    column: string
    field: string
    count: number
    sum: number
    avg: number
    min: number
    max: number
  }> = []
  for (const col of columns) {
    const vals = parseNumericValues(rows, col.id)
    if (vals.length === 0) continue
    const sum = vals.reduce((a, b) => a + b, 0)
    const avg = sum / vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    summaries.push({
      column: col.header.replace(/_/g, ' '),
      field: col.fieldName,
      count: vals.length,
      sum,
      avg,
      min,
      max,
    })
  }
  return summaries
}

function padBBox(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  padRatio: number,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  const w = Math.max(bbox.maxLng - bbox.minLng, 1e-9)
  const h = Math.max(bbox.maxLat - bbox.minLat, 1e-9)
  const px = w * padRatio
  const py = h * padRatio
  return {
    minLng: bbox.minLng - px,
    minLat: bbox.minLat - py,
    maxLng: bbox.maxLng + px,
    maxLat: bbox.maxLat + py,
  }
}

function pickFarmCodeColumn(columns: RecipeColumn[]): RecipeColumn | null {
  const re = /farm\s*code/i
  for (const c of columns) {
    if (re.test(c.header) || re.test(c.fieldName)) return c
  }
  return null
}

function farmCodeFromRows(rows: RecipeRow[], col: RecipeColumn | null): string | null {
  if (!col || !rows.length) return null
  const v = String(rows[0]?.cells[col.id] ?? '').trim()
  return v || null
}

function filterFcByFarmCode(fc: { features?: unknown[] }, code: string): { type: 'FeatureCollection'; features: unknown[] } {
  const c = code.trim().toLowerCase()
  if (!c) return fc as { type: 'FeatureCollection'; features: unknown[] }
  const feats = (fc.features ?? []).filter((f: any) => {
    const p = f?.properties
    if (!p || typeof p !== 'object') return false
    return Object.values(p).some(val => {
      const s = String(val ?? '').trim().toLowerCase()
      return s === c || s.includes(c)
    })
  })
  return feats.length ? { type: 'FeatureCollection', features: feats } : (fc as { type: 'FeatureCollection'; features: unknown[] })
}

async function fetchUrlAsImageDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || ''
    const fmt: 'PNG' | 'JPEG' = mime.includes('png') ? 'PNG' : 'JPEG'
    const buf = await blob.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const b64 = typeof btoa !== 'undefined' ? btoa(binary) : ''
    if (!b64) return null
    return { dataUrl: `data:${mime || 'image/jpeg'};base64,${b64}`, format: fmt }
  } catch {
    return null
  }
}

async function fetchMapboxSatelliteStatic(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  token: string,
  widthPx: number,
  heightPx: number,
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  const t = token.trim()
  if (!t) return null
  const { minLng, minLat, maxLng, maxLat } = bbox
  const bboxPath = `[${minLng},${minLat},${maxLng},${maxLat}]`
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${bboxPath}/${widthPx}x${heightPx}@2x` +
    `?padding=32&logo=false&attribution=false&access_token=${encodeURIComponent(t)}`
  return fetchUrlAsImageDataUrl(url)
}

function mapLngLatToPdf(
  lng: number,
  lat: number,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  x: number,
  yTop: number,
  w: number,
  h: number,
): [number, number] {
  const { minLng, minLat, maxLng, maxLat } = bbox
  const dlng = Math.max(maxLng - minLng, 1e-9)
  const dlat = Math.max(maxLat - minLat, 1e-9)
  const px = x + ((lng - minLng) / dlng) * w
  const py = yTop + h - ((lat - minLat) / dlat) * h
  return [px, py]
}

function drawExtentSketch(
  doc: jsPDF,
  fc: { features?: unknown[] },
  x: number,
  yTop: number,
  w: number,
  h: number,
  bboxOverride: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null,
): void {
  const pts = collectLngLats(fc as any)
  const bbox = bboxOverride ?? bboxFromPts(pts)
  doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2])
  doc.setLineWidth(0.35)
  doc.rect(x, yTop, w, h)

  if (!bbox || pts.length === 0) {
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('No drawable geometry for this snapshot.', x + 2, yTop + h / 2)
    doc.setTextColor(INK[0], INK[1], INK[2])
    return
  }

  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.setLineWidth(0.55)

  const ringDraw = (coords: unknown): void => {
    const ringPts: [number, number][] = []
    const collect = (c: unknown): void => {
      if (!c) return
      if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
        ringPts.push(mapLngLatToPdf((c as number[])[0], (c as number[])[1], bbox, x, yTop, w, h))
        return
      }
      if (Array.isArray(c)) c.forEach(collect)
    }
    collect(coords)
    if (ringPts.length < 2) return
    for (let i = 0; i < ringPts.length; i++) {
      const a = ringPts[i]
      const b = ringPts[(i + 1) % ringPts.length]
      doc.line(a[0], a[1], b[0], b[1])
    }
  }

  for (const f of fc.features ?? []) {
    const geom = (f as any)?.geometry
    if (!geom) continue
    const g = geom
    if (g.type === 'Polygon') ringDraw(g.coordinates)
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates ?? []) ringDraw(poly?.[0])
    } else if (g.type === 'LineString') ringDraw(g.coordinates)
    else if (g.type === 'MultiLineString') {
      for (const ls of g.coordinates ?? []) ringDraw(ls)
    } else if (g.type === 'Point') {
      const coord = mapLngLatToPdf(g.coordinates[0], g.coordinates[1], bbox, x, yTop, w, h)
      doc.setFillColor(219, 244, 232)
      doc.circle(coord[0], coord[1], 1.4, 'FD')
    }
  }

  doc.setFontSize(6.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(
    `W ${bbox.minLng.toFixed(4)}  E ${bbox.maxLng.toFixed(4)}  S ${bbox.minLat.toFixed(4)}  N ${bbox.maxLat.toFixed(4)}`,
    x + 1,
    yTop + h - 1.8,
  )
  doc.setTextColor(INK[0], INK[1], INK[2])
}

function buildFallbackExecutiveLines(opts: {
  workflowTitle: string
  rowCount: number
  columnCount: number
  summaries: ReturnType<typeof computeNumericSummaries>
  periodLabel?: string
  farmCode: string | null
  lang: 'en' | 'ar'
}): string[] {
  const { workflowTitle, rowCount, columnCount, summaries, periodLabel, farmCode, lang } = opts
  const lines: string[] = []
  const period = periodLabel ? (lang === 'ar' ? `الفترة: ${periodLabel}. ` : `Period: ${periodLabel}. `) : ''
  if (rowCount === 0) {
    return [
      lang === 'ar'
        ? 'لا توجد سجلات مطابقة للتصدير ضمن الإعدادات الحالية.'
        : 'No records matched the current export filters.',
    ]
  }
  lines.push(
    lang === 'ar'
      ? `${period}التقرير يخص "${workflowTitle}" — ${rowCount} سجل، ${columnCount} حقل مختار.`
      : `${period}This export covers "${workflowTitle}" — ${rowCount} record(s), ${columnCount} selected field(s).`,
  )
  if (farmCode) {
    lines.push(
      lang === 'ar'
        ? `رمز المزرعة للتركيز المكاني: ${farmCode}.`
        : `Farm code used for map framing: ${farmCode}.`,
    )
  }
  if (summaries.length === 0) {
    lines.push(
      lang === 'ar'
        ? 'البيانات غالباً نوعية؛ راجع جدول التفاصيل للمقارنة بين السجلات.'
        : 'Values are mostly categorical; see the detailed table for row-level comparison.',
    )
  } else {
    const top = summaries.slice().sort((a, b) => b.count - a.count)[0]!
    lines.push(
      lang === 'ar'
        ? `أبرز حقل كمي: "${top.column}" — المتوسط ${fmtNum(top.avg)} (من ${fmtNum(top.min)} إلى ${fmtNum(top.max)}، عبر ${top.count} خلايا رقمية).`
        : `Strongest numeric signal: "${top.column}" — mean ${fmtNum(top.avg)} (range ${fmtNum(top.min)}–${fmtNum(top.max)}, ${top.count} numeric cells).`,
    )
    const sums = summaries.filter(s => Math.abs(s.sum) > 1e-9).sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))[0]
    if (sums) {
      lines.push(
        lang === 'ar'
          ? `أكبر إجمالي: "${sums.column}" = ${fmtNum(sums.sum)}.`
          : `Largest summed field: "${sums.column}" = ${fmtNum(sums.sum)}.`,
      )
    }
  }
  lines.push(
    lang === 'ar'
      ? 'الأرقام محلية من المتصفح؛ راجع خط أنابيب الشركة قبل أي استخدام رسمي.'
      : 'Figures are browser-local; validate against enterprise pipelines before formal use.',
  )
  return lines.slice(0, 6)
}

function buildFallbackKeyMetrics(
  rows: RecipeRow[],
  summaries: ReturnType<typeof computeNumericSummaries>,
): Array<{ metric: string; value: string }> {
  const out: Array<{ metric: string; value: string }> = [{ metric: 'Records in export', value: String(rows.length) }]
  const nRows = Math.max(rows.length, 1)
  let added = 0
  for (const s of summaries) {
    if (added >= 10) break
    out.push({ metric: `${s.column} · responses`, value: String(s.count) })
    out.push({ metric: `${s.column} · share of rows`, value: `${((s.count / nRows) * 100).toFixed(1)}%` })
    out.push({ metric: `${s.column} · average`, value: fmtNum(s.avg) })
    added += 3
  }
  return out.slice(0, 14)
}

function drawPdfHeaderBand(doc: jsPDF, pw: number, workflowTitle: string, subtitle: string): number {
  const bandH = 30
  doc.setFillColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2])
  doc.rect(0, 0, pw, bandH, 'F')
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.rect(0, bandH - 3, pw, 3, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Recipes · Executive summary report', pw - PAGE_MARGIN_MM, 11, { align: 'right' })
  doc.setFontSize(13)
  const titleLines = doc.splitTextToSize(workflowTitle.replace(/_/g, ' '), pw - PAGE_MARGIN_MM * 2 - 52)
  doc.text(titleLines, pw - PAGE_MARGIN_MM, 17, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(subtitle, pw - PAGE_MARGIN_MM, 26, { align: 'right' })
  doc.setTextColor(INK[0], INK[1], INK[2])
  return bandH + 6
}

export async function generateRecipeReportPdf(opts: {
  workflowTitle: string
  formSlug: string
  columns: RecipeColumn[]
  rows: RecipeRow[]
  periodLabel?: string
  /** Narrative + metric labels language */
  reportLang?: 'en' | 'ar'
}): Promise<void> {
  const { workflowTitle, formSlug, columns, rows, periodLabel } = opts
  const lang = opts.reportLang === 'ar' ? 'ar' : 'en'
  const generatedAt = new Date()
  const dateIso = generatedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const summaries = computeNumericSummaries(columns, rows)
  const layers = await loadStoredLayers()
  const primId = primaryLayerSourceId(columns)
  const fcFull = primId ? findLayerGeoJson(layers, primId) : null

  const farmCol = pickFarmCodeColumn(columns)
  const farmCode = farmCodeFromRows(rows, farmCol)
  const fcFiltered =
    fcFull && farmCode ? filterFcByFarmCode(fcFull, farmCode) : fcFull

  const ptsForMap = fcFiltered ? collectLngLats(fcFiltered as any) : []
  const bboxRaw = bboxFromPts(ptsForMap)
  const bboxPadded = bboxRaw ? padBBox(bboxRaw, 0.22) : null

  const geminiKey = getGeminiApiKey()
  const mapboxToken = getMapboxAccessToken()

  let executiveLines = buildFallbackExecutiveLines({
    workflowTitle,
    rowCount: rows.length,
    columnCount: columns.length,
    summaries,
    periodLabel,
    farmCode,
    lang,
  })
  let keyMetrics = buildFallbackKeyMetrics(rows, summaries)

  if (geminiKey.trim() && rows.length > 0) {
    try {
      const sampleRows = rows.slice(0, 5).map(r => {
        const o: Record<string, string> = {}
        for (const c of columns) {
          o[c.header.replace(/_/g, ' ')] = String(r.cells[c.id] ?? '').slice(0, 200)
        }
        return o
      })
      const ai = await fetchRecipeReportInsightsFromGemini({
        apiKey: geminiKey,
        lang,
        workflowTitle,
        periodLabel,
        rowCount: rows.length,
        columnLabels: columns.map(c => c.header.replace(/_/g, ' ')),
        numericSummariesForPrompt: summaries.map(s => ({
          column: s.column,
          count: s.count,
          sum: s.sum,
          avg: s.avg,
          min: s.min,
          max: s.max,
        })),
        sampleRows,
      })
      if (ai) {
        if (ai.executiveLines.length) executiveLines = ai.executiveLines
        if (ai.keyMetrics.length) keyMetrics = ai.keyMetrics
      }
    } catch {
      /* keep deterministic fallback */
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const m = PAGE_MARGIN_MM

  const subtitleMeta =
    lang === 'ar'
      ? `أُنشئ ${dateIso}${periodLabel ? ` · ${periodLabel}` : ''}`
      : `Generated ${dateIso}${periodLabel ? ` · ${periodLabel}` : ''}`

  let logoAdded = false
  const logoImg = await fetchUrlAsImageDataUrl(ELITE_LOGO_URL)
  const headerBottomY = drawPdfHeaderBand(doc, pw, workflowTitle, subtitleMeta)
  if (logoImg) {
    try {
      const lw = 42
      const lh = 11
      doc.addImage(logoImg.dataUrl, logoImg.format, m, 8, lw, lh)
      logoAdded = true
    } catch {
      logoAdded = false
    }
  }
  if (!logoAdded) {
    doc.setFontSize(9)
    doc.setTextColor(220, 252, 231)
    doc.setFont('helvetica', 'bold')
    doc.text('ELITE AGRO', m, 14)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('PROJECTS', m, 18)
    doc.setTextColor(INK[0], INK[1], INK[2])
  }

  let y = headerBottomY + 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(lang === 'ar' ? 'ملخص تنفيذي' : 'Executive narrative', m, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const line of executiveLines) {
    const lines = doc.splitTextToSize(line, pw - m * 2)
    doc.text(lines, m, y)
    y += lines.length * 4.4 + 1
    if (y > ph - m - 50) {
      doc.addPage()
      y = m
    }
  }

  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text(lang === 'ar' ? 'مؤشرات رئيسية' : 'Key aggregate metrics', m, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [[lang === 'ar' ? 'المؤشر' : 'Metric', lang === 'ar' ? 'القيمة' : 'Value']],
    body: keyMetrics.map(k => [k.metric, k.value]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      textColor: INK,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    theme: 'plain',
    margin: { left: m, right: m },
    tableWidth: pw - m * 2,
  })
  y = (doc as any).lastAutoTable.finalY + 8

  const mapW = pw - m * 2
  const mapH = 64

  if (fcFiltered && columns.length && ptsForMap.length && bboxPadded) {
    if (y > ph - m - mapH - 42) {
      doc.addPage()
      y = m
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(lang === 'ar' ? 'خريطة مكانية' : 'Spatial Map', m, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    const layerNote =
      lang === 'ar'
        ? `طبقة GIS: ${String(primId)} · تراكب الحقول بنفس حدود الطبقة المحفوظة محلياً${farmCode ? ` · رمز المزرعة ${farmCode}` : ''}.`
        : `GIS layer: ${String(primId)} · vectors aligned to locally cached layer footprint${farmCode ? ` · farm code ${farmCode}` : ''}.`
    doc.text(doc.splitTextToSize(layerNote, mapW), m, y)
    y += 7
    doc.setTextColor(INK[0], INK[1], INK[2])

    const staticPxW = 780
    const staticPxH = Math.round((staticPxW * mapH) / mapW)
    let drewBasemap = false
    const staticImg = await fetchMapboxSatelliteStatic(bboxPadded, mapboxToken, staticPxW, staticPxH)
    if (staticImg) {
      try {
        doc.addImage(staticImg.dataUrl, staticImg.format, m, y, mapW, mapH)
        drewBasemap = true
      } catch {
        drewBasemap = false
      }
    }
    if (!drewBasemap) {
      doc.setFillColor(241, 245, 249)
      doc.rect(m, y, mapW, mapH, 'F')
      doc.setFontSize(7)
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.text(
        lang === 'ar'
          ? 'أضف رمز Mapbox في الإعدادات لعرض الصور الجوية في التقرير؛ يظهر أدناه تخطيط الحدود.'
          : 'Add a Mapbox token under API Tokens for satellite basemap in this frame; footprint sketch follows.',
        m + 2,
        y + mapH / 2 - 2,
      )
      doc.setTextColor(INK[0], INK[1], INK[2])
    }

    drawExtentSketch(doc, fcFiltered as any, m, y, mapW, mapH, bboxPadded)
    y += mapH + 10
  }

  if (columns.length && rows.length) {
    if (y > ph - m - 36) {
      doc.addPage()
      y = m
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text(lang === 'ar' ? 'إرساليات تفصيلية' : 'Detailed submissions', m, y)
    y += 4

    const head = [columns.map(c => c.header.replace(/_/g, ' '))]
    const body = rows.map(r => columns.map(c => String(r.cells[c.id] ?? '').slice(0, 280)))

    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: {
        font: 'helvetica',
        fontSize: 6,
        cellPadding: 1.1,
        valign: 'top',
        overflow: 'linebreak',
        cellWidth: 'wrap',
      },
      headStyles: {
        fillColor: ACCENT,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.5,
      },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      theme: 'striped',
      margin: { left: m, right: m },
      tableWidth: pw - m * 2,
    })
  }

  const footPrefix =
    lang === 'ar' ? 'لقطة تشغيلية سرية · ' : 'Confidential operational snapshot · '
  const foot = `${footPrefix}${workflowTitle} · `
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(`${foot}${lang === 'ar' ? 'صفحة' : 'Page'} ${i} / ${totalPages}`, m, ph - 7)
  }

  const safeSlug = formSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  doc.save(`recipe-report-${safeSlug}-${generatedAt.toISOString().slice(0, 10)}.pdf`)
}
