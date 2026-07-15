/** OOXML helpers matching Agricultural_Satellite_Intelligence_Report template styling. */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture'

export const DOCX_BRAND = '1F4D2C'
export const DOCX_BRAND_SOFT = '3F7D4F'
export const DOCX_MUTED = '6B6B6B'
export const DOCX_INK = '444444'

export const CHART_IMAGE_CX = 4000500
export const CHART_IMAGE_CY = 2076450
export const MAP_IMAGE_CX = 1123950
export const MAP_IMAGE_CY = 838200

export const DOCX_SECT_PR = `<w:sectPr w:rsidR="003D6795"><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`

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

function paragraph(content: string, spacingAfter = 120): string {
  return `<w:p><w:pPr><w:spacing w:after="${spacingAfter}" w:line="276" w:lineRule="auto"/></w:pPr>${content}</w:p>`
}

export function docxTitle(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${run(text, { bold: true, color: DOCX_BRAND, size: 40 })}</w:p>`
}

export function docxSubtitle(text: string): string {
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="14" w:space="6" w:color="${DOCX_BRAND}"/></w:pBdr><w:spacing w:after="200"/></w:pPr>${run(text, { color: DOCX_BRAND_SOFT, size: 28 })}</w:p>`
}

export function docxMetaLine(parts: Array<{ text: string; italic?: boolean }>): string {
  const content = parts.map(p => run(p.text, { italic: p.italic ?? true, color: DOCX_MUTED, size: 19 })).join('')
  return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${content}</w:p>`
}

export function docxSectionHeading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr>${run(text, { bold: true, color: DOCX_BRAND, size: 24 })}</w:p>`
}

export function docxBodyParagraph(text: string): string {
  return paragraph(run(text, { color: DOCX_INK, size: 21 }), 160)
}

export function docxItalicNote(text: string): string {
  return paragraph(run(text, { italic: true, color: DOCX_MUTED, size: 19 }), 160)
}

function tableCell(
  inner: string,
  opts: { header?: boolean; width: number; align?: 'left' | 'center' | 'right' },
): string {
  const fill = opts.header ? DOCX_BRAND : 'auto'
  const color = opts.header ? 'FFFFFF' : DOCX_INK
  const jc = opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left'
  const pPr = opts.header ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''
  const text = opts.header
    ? run(inner, { bold: true, color, size: 18 })
    : run(inner, { color, size: 20 })
  return `<w:tc><w:tcPr><w:tcW w:w="${opts.width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr><w:p>${pPr}${text}</w:p></w:tc>`
}

function tableRow(cells: string[], header = false): string {
  const trPr = header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
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
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`
}

export function docxInlineImage(rId: string, cx: number, cy: number): string {
  return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A_NS}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${PIC_NS}"><pic:pic xmlns:pic="${PIC_NS}"><pic:nvPicPr><pic:cNvPr id="0" name="Image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="${R_NS}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

export function docxImageCaption(lines: string[]): string {
  const content = lines.map(line => run(line, { color: DOCX_MUTED, size: 18 })).join('')
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>${content}</w:p>`
}

export function docxMapGrid(images: Array<{ rId: string; date: string; label: string }>): string {
  const chunks: string[] = []
  for (let i = 0; i < images.length; i += 4) {
    const slice = images.slice(i, i + 4)
    const cells = slice
      .map(img => {
        const cellContent = `${docxInlineImage(img.rId, MAP_IMAGE_CX, MAP_IMAGE_CY)}${docxImageCaption([img.date, img.label])}`
        return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9300 / slice.length)}" w:type="dxa"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${cellContent}</w:tc>`
      })
      .join('')
    chunks.push(`<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tr>${cells}</w:tr></w:tbl>`)
  }
  return chunks.join('')
}

export function docxBulletList(items: string[]): string {
  return items
    .map(item => paragraph(run(`• ${item}`, { color: DOCX_INK, size: 21 }), 80))
    .join('')
}

export function docxPageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

export function wrapDocumentBody(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
<w:body>
${inner}
${DOCX_SECT_PR.replace('rIdHdr', 'rIdHdr').replace('rIdFtr', 'rIdFtr')}
</w:body>
</w:document>`
}
