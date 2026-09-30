/** OOXML helpers — compact scientific layout for Agricultural Intelligence Report. */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture'

export const DOCX_BRAND = '1F4D2C'
export const DOCX_BRAND_SOFT = '3F7D4F'
export const DOCX_MUTED = '6B6B6B'
export const DOCX_INK = '444444'

/** Half-points: 18 = 9 pt (scientific tables). */
export const DOCX_TABLE_FONT_SZ = 18
export const DOCX_BODY_FONT_SZ = 20

/** Default chart size in EMUs (~5.5" × 3.5") — taller to clear axis titles without overlap. */
export const CHART_IMAGE_CX = 5029200
export const CHART_IMAGE_CY = 3200400
/** Taller chart for horizontal bars / pies with side legend (~5.5" × 4.0"). */
export const CHART_IMAGE_CY_TALL = 3657600
/** Enterprise atlas — 12 map cards per page in a 3×4 grid (T-23 Intelligence Report). */
export const MAP_IMAGE_CX = 2057400
export const MAP_IMAGE_CY = 1543050
export const MAPS_PER_PAGE = 12
export const MAPS_PER_ROW = 3
/** Change Detection T0/T1 pair — two larger side-by-side map cards. */
export const PAIR_MAP_IMAGE_CX = 3108960
export const PAIR_MAP_IMAGE_CY = 2331720
/** Compact centered charts under Change Detection maps (fit title+maps+table+2 charts). */
export const CHANGE_CHART_IMAGE_CX = 4572000
export const CHANGE_CHART_IMAGE_CY = 2286000

const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'

/** Margins sized so a full 3×4 atlas fills the page without large gaps. */
export const DOCX_SECT_PR = `<w:sectPr w:rsidR="003D6795"><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="648" w:right="648" w:bottom="648" w:left="648" w:header="432" w:footer="432" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="320"/></w:sectPr>`

export function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type RunOpts = {
  bold?: boolean
  italic?: boolean
  color?: string
  size?: number
}

function run(text: string, opts: RunOpts = {}): string {
  const rPr: string[] = []
  if (opts.bold) rPr.push('<w:b/><w:bCs/>')
  if (opts.italic) rPr.push('<w:i/><w:iCs/>')
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''
  const space = text.startsWith(' ') || text.endsWith(' ') ? ' xml:space="preserve"' : ''
  return `<w:r>${rPrXml}<w:t${space}>${escXml(text)}</w:t></w:r>`
}

function paragraph(
  content: string,
  spacingAfter = 80,
  opts?: { keepNext?: boolean; spacingBefore?: number },
): string {
  const keep = opts?.keepNext ? '<w:keepNext/>' : ''
  const before = opts?.spacingBefore != null ? ` w:before="${opts.spacingBefore}"` : ''
  return `<w:p><w:pPr>${keep}<w:spacing${before} w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/></w:pPr>${content}</w:p>`
}

export function docxTitle(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(text, { bold: true, color: DOCX_BRAND, size: 36 })}</w:p>`
}

export function docxSubtitle(text: string): string {
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${DOCX_BRAND}"/></w:pBdr><w:spacing w:after="100"/></w:pPr>${run(text, { color: DOCX_BRAND_SOFT, size: 24 })}</w:p>`
}

export function docxMetaLine(parts: Array<{ text: string; italic?: boolean }>): string {
  const content = parts.map(p => run(p.text, { italic: p.italic ?? true, color: DOCX_MUTED, size: 17 })).join('')
  return `<w:p><w:pPr><w:spacing w:after="20"/></w:pPr>${content}</w:p>`
}

export function docxSectionHeading(
  text: string,
  keepNext = true,
  level: 1 | 2 = 1,
): string {
  const style = level === 1 ? 'Heading1' : 'Heading2'
  const size = level === 1 ? 22 : 20
  const keep = keepNext ? '<w:keepNext/>' : ''
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keep}<w:spacing w:before="${level === 1 ? 100 : 80}" w:after="40" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>${run(text, { bold: true, color: DOCX_BRAND, size })}</w:p>`
}

export function docxBodyParagraph(text: string): string {
  return paragraph(run(text, { color: DOCX_INK, size: DOCX_BODY_FONT_SZ }), 80)
}

export function docxItalicNote(text: string): string {
  return paragraph(run(text, { italic: true, color: DOCX_MUTED, size: 17 }), 60, { keepNext: true })
}

/** Professional cover page (report page 1). */
export function docxCoverPage(input: {
  projectName: string
  fieldName: string
  areaHa: string
  periodLabel: string
  layerIdsLabel: string
  generatedBy: string
  generatedStamp: string
  satelliteSource: string
  obsCount: number
  /** Override main cover title (default: Agricultural Satellite Intelligence Report). */
  reportTitle?: string
  /** Override cover subtitle (default: Imagery Time Series Analysis). */
  reportSubtitle?: string
  /** Optional extra meta row label/value (e.g. LULC years). */
  extraMeta?: { label: string; value: string }
}): string {
  const spacer = (after: number) =>
    `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}"/></w:pPr></w:p>`
  const centerRun = (text: string, opts: RunOpts) =>
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr>${run(text, opts)}</w:p>`
  const metaRow = (label: string, value: string) =>
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>${run(label + '  ', { bold: true, color: DOCX_BRAND, size: 20 })}${run(value, { color: DOCX_INK, size: 20 })}</w:p>`
  const title = input.reportTitle ?? 'Agricultural Satellite Intelligence Report'
  const subtitle = input.reportSubtitle ?? 'Imagery Time Series Analysis'

  return [
    spacer(1200),
    centerRun('AGROCLOUD', { bold: true, color: DOCX_BRAND, size: 28 }),
    centerRun('SATELLITE INTELLIGENCE', { bold: true, color: DOCX_BRAND_SOFT, size: 22 }),
    spacer(200),
    `<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="1" w:color="${DOCX_BRAND}"/></w:pBdr><w:spacing w:after="200"/></w:pPr>${run(' ', { size: 2 })}</w:p>`,
    centerRun(title, { bold: true, color: DOCX_INK, size: 36 }),
    centerRun(subtitle, { italic: true, color: DOCX_MUTED, size: 24 }),
    spacer(400),
    metaRow('Project', input.projectName),
    metaRow('AOI / Field', `${input.fieldName}  ·  ${input.areaHa}`),
    metaRow('Monitoring period', input.periodLabel),
    metaRow('Observations', String(input.obsCount)),
    metaRow('Indices', input.layerIdsLabel || '—'),
    ...(input.extraMeta ? [metaRow(input.extraMeta.label, input.extraMeta.value)] : []),
    metaRow('Satellite source', input.satelliteSource),
    spacer(600),
    centerRun(`Prepared by ${input.generatedBy}`, { color: DOCX_MUTED, size: 18 }),
    centerRun(input.generatedStamp, { color: DOCX_MUTED, size: 18 }),
    spacer(400),
    centerRun('Confidential · For professional agricultural monitoring use', {
      italic: true,
      color: DOCX_MUTED,
      size: 16,
    }),
    docxPageBreak(),
  ].join('')
}

/**
 * Table of Contents page (report page 2) — main headings only, with page numbers.
 * Word refreshes page numbers on open (`updateFields` enabled in settings).
 */
export function docxTableOfContentsPage(entries: string[]): string {
  // Outline levels 1–1 only (Heading 1). Sub-sections stay out of the TOC.
  const tocInstr = ' TOC \\o "1-1" \\h \\z \\u '
  const placeholder =
    entries.length > 0
      ? entries
          .map(
            title =>
              `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9360"/></w:tabs><w:spacing w:after="80"/></w:pPr>${run(title, { bold: true, color: DOCX_INK, size: 20 })}${run('\t', { size: 20 })}${run('—', { color: DOCX_MUTED, size: 20 })}</w:p>`,
          )
          .join('')
      : `<w:p>${run('Updating table of contents…', { italic: true, color: DOCX_MUTED, size: 18 })}</w:p>`

  return [
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run('Table of Contents', { bold: true, color: DOCX_BRAND, size: 32 })}</w:p>`,
    paragraph(
      run(
        'Main section titles only. Page numbers appear automatically when this document is opened in Microsoft Word.',
        { italic: true, color: DOCX_MUTED, size: 17 },
      ),
      160,
    ),
    `<w:p>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve">${tocInstr}</w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
</w:p>
${placeholder}
<w:p>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>`,
    docxPageBreak(),
  ].join('')
}

function tableCell(
  inner: string,
  opts: { header?: boolean; width: number; align?: 'left' | 'center' | 'right' },
): string {
  const fill = opts.header ? DOCX_BRAND : 'auto'
  const color = opts.header ? 'FFFFFF' : DOCX_INK
  const pPr =
    opts.align === 'center'
      ? '<w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>'
      : opts.align === 'right'
        ? '<w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>'
        : '<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>'
  const text = opts.header
    ? run(inner, { bold: true, color, size: DOCX_TABLE_FONT_SZ })
    : run(inner, { color, size: DOCX_TABLE_FONT_SZ })
  return `<w:tc><w:tcPr><w:tcW w:w="${opts.width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr><w:p>${pPr}${text}</w:p></w:tc>`
}

function tableRow(cells: string[], header = false): string {
  /** Keep rows with the table so statistics do not orphan a single row on the next page. */
  const trPr = header
    ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
    : '<w:trPr><w:cantSplit/></w:trPr>'
  return `<w:tr>${trPr}${cells.join('')}</w:tr>`
}

export function docxTable(
  headers: string[],
  rows: string[][],
  colWidths: number[],
): string {
  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')
  const headerRow = tableRow(
    headers.map((h, i) => tableCell(h, { header: true, width: colWidths[i]!, align: 'center' })),
    true,
  )
  const bodyRows = rows
    .map(row =>
      tableRow(
        row.map((cell, i) =>
          tableCell(cell, {
            width: colWidths[i]!,
            align: i === 0 ? 'left' : 'center',
          }),
        ),
      ),
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`
}

export function docxInlineImage(rId: string, cx: number, cy: number): string {
  return `<w:p><w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A_NS}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${PIC_NS}"><pic:pic xmlns:pic="${PIC_NS}"><pic:nvPicPr><pic:cNvPr id="0" name="Image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="${R_NS}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

/** Single-line caption under each map card (date · index · value). */
export function docxImageCaption(lines: string[]): string {
  const text = lines.map(l => String(l || '').trim()).filter(Boolean).join(' ')
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:before="0" w:line="200" w:lineRule="auto"/></w:pPr>${run(text, { color: DOCX_INK, size: 14 })}</w:p>`
}

function docxMapTableRow(images: Array<{ rId: string; date: string; label: string }>): string {
  const cellW = Math.floor(10080 / MAPS_PER_ROW)
  const cells = images
    .map(img => {
      // One caption line like the reference atlas: "2022-03-24 NDVI 0.4085"
      const caption = [img.date, img.label].filter(Boolean).join(' ')
      const cellContent = `${docxInlineImage(img.rId, MAP_IMAGE_CX, MAP_IMAGE_CY)}${docxImageCaption([caption])}`
      return `<w:tc><w:tcPr><w:tcW w:w="${cellW}" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>${cellContent}</w:tc>`
    })
    .join('')
  // Pad incomplete last rows so the 3-column grid stays aligned like the sample page.
  const pad = MAPS_PER_ROW - images.length
  const padCells =
    pad > 0
      ? Array.from({ length: pad }, () =>
          `<w:tc><w:tcPr><w:tcW w:w="${cellW}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p></w:tc>`,
        ).join('')
      : ''
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}${padCells}</w:tr>`
}

/**
 * 3×4 grid (12 map cards per page) — T-23 Enterprise Intelligence Report atlas.
 * Page breaks only between full atlas pages.
 */
export function docxMapGrid(images: Array<{ rId: string; date: string; label: string }>): string {
  if (!images.length) return ''
  const chunks: string[] = []
  for (let pageStart = 0; pageStart < images.length; pageStart += MAPS_PER_PAGE) {
    if (pageStart > 0) chunks.push(docxPageBreak())
    const page = images.slice(pageStart, pageStart + MAPS_PER_PAGE)
    const rows: string[] = []
    for (let r = 0; r < page.length; r += MAPS_PER_ROW) {
      rows.push(docxMapTableRow(page.slice(r, r + MAPS_PER_ROW)))
    }
    chunks.push(
      `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: MAPS_PER_ROW }, () => `<w:gridCol w:w="${Math.floor(10080 / MAPS_PER_ROW)}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`,
    )
  }
  return chunks.join('')
}

/**
 * Change Detection pair layout: exactly two side-by-side map cards (T0 | T1),
 * matching the sample page (larger maps, equal columns, no empty third cell).
 */
export function docxChangePairMaps(
  images: Array<{ rId: string; date: string; label: string }>,
): string {
  if (!images.length) return ''
  const pair = images.slice(0, 2)
  const cols = Math.max(pair.length, 1)
  const cellW = Math.floor(10080 / cols)
  const cells = pair
    .map(img => {
      const caption = [img.date, img.label].filter(Boolean).join(' ')
      const cellContent = `${docxInlineImage(img.rId, PAIR_MAP_IMAGE_CX, PAIR_MAP_IMAGE_CY)}${docxImageCaption([caption])}`
      return `<w:tc><w:tcPr><w:tcW w:w="${cellW}" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${cellContent}</w:tc>`
    })
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${cellW}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`
}

/** Native Office chart drawing (editable in Word like an Excel chart). */
export function docxInlineChart(
  rId: string,
  cx = CHART_IMAGE_CX,
  cy = CHART_IMAGE_CY,
  opts?: { center?: boolean },
): string {
  const jc = opts?.center ? '<w:jc w:val="center"/>' : ''
  return `<w:p><w:pPr>${jc}<w:spacing w:after="40" w:before="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Chart"/><a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${C_NS}"><c:chart xmlns:c="${C_NS}" xmlns:r="${R_NS}" r:id="${rId}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

export function docxBulletList(items: string[]): string {
  return items
    .map(item => paragraph(run(`• ${item}`, { color: DOCX_INK, size: DOCX_BODY_FONT_SZ }), 40))
    .join('')
}

export function docxPageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

export function wrapDocumentBody(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:c="${C_NS}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
<w:body>
${inner}
${DOCX_SECT_PR.replace('rIdHdr', 'rIdHdr').replace('rIdFtr', 'rIdFtr')}
</w:body>
</w:document>`
}
