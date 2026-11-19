/**
 * Renders a ReportModel to PDF (jsPDF + autotable), Excel (ExcelJS) and Word (docx), and exports
 * raw records to Excel / CSV. Libraries are loaded on demand so the forms pages stay light.
 */
import type { OpsForm, OpsRecord } from '../api'
import type { ReportCell, ReportModel } from './reportModel'

const BRAND = { r: 22, g: 101, b: 52 } // deep green
const BRAND_HEX = '166534'
const SOFT_HEX = 'ECFDF3'

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const cellText = (v: ReportCell) => (v == null ? '' : typeof v === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v) : String(v))

/* ------------------------------------------------------------------ PDF */

export async function renderPdf(model: ReportModel): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default
  const wide = model.tables.some(t => t.columns.length > 8)
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 12

  // Header band
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(model.company, M, 10)
  doc.setFontSize(10)
  doc.text(model.docTitle, M, 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(model.docCode, W - M, 10, { align: 'right' })
  doc.text(model.issue, W - M, 17, { align: 'right' })

  doc.setTextColor(30, 41, 59)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(model.rtl ? model.docTitle : model.title, M, 33)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  const filterLines = doc.splitTextToSize(`Filters: ${model.filterText}`, W - 2 * M) as string[]
  doc.text(filterLines, M, 39)
  let y = 39 + filterLines.length * 4 + 2

  // Total tiles
  const tileW = (W - 2 * M - (model.totals.length - 1) * 4) / Math.max(1, model.totals.length)
  model.totals.forEach((t, i) => {
    const x = M + i * (tileW + 4)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, tileW, 16, 2, 2, 'FD')
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7.5)
    doc.text(t.label.toUpperCase(), x + 3, y + 5.5)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(t.value, x + 3, y + 12.5)
    doc.setFont('helvetica', 'normal')
  })
  y += 22

  for (const table of model.tables) {
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 16
    }
    doc.text(table.title, M, y)
    autoTable(doc, {
      startY: y + 2,
      margin: { left: M, right: M, top: 14 },
      head: [table.columns.map(c => c.label)],
      body: table.rows.map(r => r.map(cellText)),
      foot: table.totalRow ? [table.totalRow.map(cellText)] : undefined,
      showFoot: 'lastPage',
      styles: { fontSize: table.columns.length > 12 ? 6.5 : 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [236, 253, 243], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(table.columns.map((c, i) => [i, { halign: c.numeric ? 'right' : 'left' }])),
      // Header / total cells follow their column's alignment.
      didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
        if (data.section !== 'body' && table.columns[data.column.index]?.numeric) data.cell.styles.halign = 'right'
      },
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(226, 232, 240)
    doc.line(M, H - 10, W - M, H - 10)
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(`Generated ${model.generatedAt} by ${model.generatedBy || '—'} · AgroCloud`, M, H - 5.5)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 5.5, { align: 'right' })
  }
  return doc.output('blob')
}

/* ------------------------------------------------------------------ Excel */

export async function renderXlsx(model: ReportModel): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AgroCloud'
  wb.created = new Date()
  const used = new Set<string>()
  const sheetName = (s: string) => {
    let n = s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Sheet'
    while (used.has(n)) n = `${n.slice(0, 26)}_${used.size}`
    used.add(n)
    return n
  }

  const summary = wb.addWorksheet(sheetName(model.rtl ? 'الملخص' : 'Summary'), { views: [{ rightToLeft: model.rtl }] })
  summary.columns = [{ width: 34 }, { width: 28 }]
  summary.mergeCells('A1:B1')
  summary.getCell('A1').value = model.company
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } }
  summary.addRow([model.docTitle, model.docCode]).font = { bold: true }
  summary.addRow([model.title, model.issue])
  summary.addRow([model.rtl ? 'الفلاتر' : 'Filters', model.filterText])
  summary.addRow([model.rtl ? 'أُنشئ' : 'Generated', `${model.generatedAt} · ${model.generatedBy}`])
  summary.addRow([])
  for (const t of model.totals) {
    const row = summary.addRow([t.label, t.value])
    row.getCell(1).font = { bold: true }
    row.getCell(2).alignment = { horizontal: 'right' }
  }

  for (const table of model.tables) {
    const ws = wb.addWorksheet(sheetName(table.title), { views: [{ state: 'frozen', ySplit: 1, rightToLeft: model.rtl }] })
    const header = ws.addRow(table.columns.map(c => c.label))
    header.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } }
      c.alignment = { vertical: 'middle', wrapText: true }
    })
    for (const r of table.rows) ws.addRow(r.map(v => (v == null ? null : v)))
    if (table.totalRow) {
      const tr = ws.addRow(table.totalRow.map(v => (v == null ? null : v)))
      tr.eachCell(c => {
        c.font = { bold: true }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SOFT_HEX}` } }
      })
    }
    table.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1)
      const longest = Math.max(c.label.length, ...table.rows.slice(0, 300).map(r => cellText(r[i] ?? null).length))
      col.width = Math.min(40, Math.max(10, longest + 2))
      if (c.numeric) col.numFmt = '#,##0.##'
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/* ------------------------------------------------------------------ Word */

export async function renderDocx(model: ReportModel): Promise<Blob> {
  const d = await import('docx')
  const { AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = d
  const wide = model.tables.some(t => t.columns.length > 8)
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = (text: string, opts: { bold?: boolean; fill?: string; color?: string; right?: boolean } = {}) =>
    new TableCell({
      borders,
      shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: model.rtl,
          children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 17, rightToLeft: model.rtl })],
        }),
      ],
    })

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ bidirectional: model.rtl, children: [new TextRun({ text: model.docTitle, bold: true, size: 30, color: BRAND_HEX })] }),
    new Paragraph({ bidirectional: model.rtl, spacing: { after: 80 }, children: [new TextRun({ text: model.title, size: 22 })] }),
    new Paragraph({
      bidirectional: model.rtl,
      spacing: { after: 200 },
      children: [new TextRun({ text: `${model.rtl ? 'الفلاتر' : 'Filters'}: ${model.filterText}`, size: 18, color: '64748B' })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: model.totals.map(t => cell(t.label, { bold: true, fill: SOFT_HEX })) }),
        new TableRow({ children: model.totals.map(t => cell(t.value, { bold: true })) }),
      ],
    }),
  ]
  for (const table of model.tables) {
    children.push(new Paragraph({ bidirectional: model.rtl, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: table.title, bold: true, size: 24 })] }))
    const rows = [
      new TableRow({ tableHeader: true, children: table.columns.map(c => cell(c.label, { bold: true, fill: BRAND_HEX, color: 'FFFFFF' })) }),
      ...table.rows.map(r => new TableRow({ children: r.map((v, i) => cell(cellText(v), { right: table.columns[i]?.numeric })) })),
      ...(table.totalRow ? [new TableRow({ children: table.totalRow.map((v, i) => cell(cellText(v), { bold: true, fill: SOFT_HEX, right: table.columns[i]?.numeric })) })] : []),
    ]
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }))
  }

  const doc = new Document({
    creator: 'AgroCloud',
    title: `${model.docTitle} — ${model.title}`,
    sections: [
      {
        properties: { page: { size: { orientation: wide ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 1000, bottom: 900, left: 800, right: 800 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: model.company, bold: true, color: BRAND_HEX, size: 20 }),
                  new TextRun({ text: `    ${model.docCode} · ${model.issue}`, color: '64748B', size: 16 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `Generated ${model.generatedAt} by ${model.generatedBy || '—'} · Page `, size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                  new TextRun({ text: ' / ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}

/* ------------------------------------------------------------------ raw exports */

export async function exportRecordsXlsx(form: OpsForm, rows: OpsRecord[], lang: 'en' | 'ar', fileBase: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(form.title.en.slice(0, 28), { views: [{ state: 'frozen', ySplit: 1, rightToLeft: lang === 'ar' }] })
  const fields = form.fields
  const header = ws.addRow([...fields.map(f => f.label[lang] || f.label.en), lang === 'ar' ? 'المعرّف' : 'ID'])
  header.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } }
  })
  for (const r of rows) ws.addRow([...fields.map(f => r[f.key] ?? null), r.id])
  fields.forEach((f, i) => {
    ws.getColumn(i + 1).width = Math.min(36, Math.max(10, (f.label[lang] || f.label.en).length + 2))
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length + 1 } }
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`)
}

export function exportRecordsCsv(form: OpsForm, rows: OpsRecord[], lang: 'en' | 'ar', fileBase: string): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [form.fields.map(f => esc(f.label[lang] || f.label.en)).join(',')]
  for (const r of rows) lines.push(form.fields.map(f => esc(r[f.key])).join(','))
  // BOM so Excel opens UTF-8 (Arabic) correctly.
  downloadBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`)
}
