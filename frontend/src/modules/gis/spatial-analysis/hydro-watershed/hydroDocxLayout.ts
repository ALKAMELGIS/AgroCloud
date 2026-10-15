import {
  DOCX_BRAND,
  docxBodyParagraph,
  docxInlineImage,
  docxItalicNote,
  docxTable,
} from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxXml'

/** ~4.9″ × 3.7″ — matches reference Hydro report map frames. */
export const HYDRO_REPORT_FIGURE_CX = 4476750
export const HYDRO_REPORT_FIGURE_CY = 3343275

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function run(text: string, opts: { bold?: boolean; italic?: boolean; color?: string; size?: number }): string {
  const rPr: string[] = []
  if (opts.bold) rPr.push('<w:b/><w:bCs/>')
  if (opts.italic) rPr.push('<w:i/><w:iCs/>')
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  return `<w:r><w:rPr>${rPr.join('')}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

export function docxHydroCoverLocationLine(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="40" w:before="80"/></w:pPr>${run(text.toUpperCase(), { bold: true, color: '3F7D4F', size: 22 })}</w:p>`
}

/** Cover metadata table (STUDY AREA NAME, LOCATION, …). */
export function docxHydroCoverKpiTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/></w:tcMar></w:tcPr><w:p>${run(label, { bold: true, color: '1F6F8B', size: 17 })}</w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6300" w:type="dxa"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/></w:tcMar></w:tcPr><w:p>${run(value, { size: 25 })}</w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2900"/><w:gridCol w:w="6300"/></w:tblGrid>${body}</w:tbl>`
}

export function docxHydroKeyIndicators(rows: Array<[string, string]>): string {
  const tableRows: string[][] = []
  for (let i = 0; i < rows.length; i += 2) {
    const a = rows[i]
    const b = rows[i + 1]
    tableRows.push([a?.[0] ?? '', a?.[1] ?? '', b?.[0] ?? '', b?.[1] ?? ''])
  }
  return docxTable(['', '', '', ''], tableRows, [1800, 2800, 1800, 2800])
}

export function docxHydroFigureCaption(figureNum: number, title: string): string {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="20" w:before="20"/></w:pPr>${run(`Figure ${figureNum}. ${title}`, { bold: true, size: 22 })}</w:p>`
}

export function docxHydroTableCaption(tableNum: number, title: string): string {
  return `<w:p><w:pPr><w:spacing w:after="40" w:before="40"/></w:pPr>${run(`Table ${tableNum}. ${title}`, { bold: true, size: 22 })}</w:p>`
}

export function docxHydroFigureBlock(
  rId: string | null,
  figureNum: number,
  title: string,
  opts?: { notes?: string; legend?: string; missingNote?: string },
): string {
  const chunks: string[] = []
  if (rId) {
    chunks.push(docxInlineImage(rId, HYDRO_REPORT_FIGURE_CX, HYDRO_REPORT_FIGURE_CY))
  } else {
    chunks.push(docxItalicNote(opts?.missingNote ?? 'Map not available — run the required analysis steps first.'))
  }
  chunks.push(docxHydroFigureCaption(figureNum, title))
  if (opts?.notes?.trim()) {
    chunks.push(docxItalicNote(`Notes: ${opts.notes.trim()}`))
  }
  if (opts?.legend?.trim()) {
    chunks.push(docxItalicNote(`Legend: ${opts.legend.trim()}`))
  }
  return chunks.join('')
}

export function docxHydroSubHeading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="40" w:before="60"/></w:pPr>${run(text, { bold: true, color: DOCX_BRAND, size: 22 })}</w:p>`
}

export function docxHydroTableSection(tableNum: number, title: string, headers: string[], rows: string[][]): string {
  const colW = Math.floor(9300 / headers.length)
  return `${docxHydroTableCaption(tableNum, title)}${docxTable(headers, rows, headers.map(() => colW))}`
}

export function docxHydroAtlasIntro(): string {
  return docxBodyParagraph(
    'High-resolution GIS maps with satellite basemap, AOI boundary, legend, north arrow, scale bar, and coordinate reference. Generated from cached Hydro Watershed Workflow outputs.',
  )
}

export function docxHydroReportFooterLine(projectName: string, stamp: string): string {
  return docxItalicNote(`Generated ${stamp} · ${projectName} · Hydro Watershed Workflow — enterprise GIS reporting.`)
}
