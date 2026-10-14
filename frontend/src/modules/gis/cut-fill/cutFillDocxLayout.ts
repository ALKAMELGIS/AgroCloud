import {
  PAIR_MAP_IMAGE_CX,
  PAIR_MAP_IMAGE_CY,
  docxInlineImage,
  docxMapLegendCaption,
} from '@/modules/remote-sensing/temporal-analysis/timeSeriesReport/timeSeriesDocxXml'

function run(text: string, opts: { bold?: boolean; size?: number; color?: string }): string {
  const rPr: string[] = []
  if (opts.bold) rPr.push('<w:b/><w:bCs/>')
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<w:r>${rPrXml}<w:t xml:space="preserve">${esc}</w:t></w:r>`
}

/** Bold map title under each atlas panel (reference Cut_Fill_Report layout). */
function docxMapBoldCaption(label: string): string {
  return `<w:p><w:pPr><w:spacing w:after="0" w:before="0" w:line="200" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${run(label, { bold: true, size: 22 })}</w:p>`
}

function docxMapCell(rId: string, label: string, legendCaption: string): string {
  const cellW = 5040
  const content = [
    docxInlineImage(rId, PAIR_MAP_IMAGE_CX, PAIR_MAP_IMAGE_CY),
    docxMapBoldCaption(label),
    docxMapLegendCaption(legendCaption),
  ].join('')
  return `<w:tc><w:tcPr><w:tcW w:w="${cellW}" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`
}

/** 2×2 Cut & Fill map atlas — maps only in PNG; compact legend as Word text below title. */
export function docxCutFillMapAtlas(
  maps: Array<{ rId: string; label: string; legendCaption: string }>,
): string {
  if (!maps.length) return ''
  const padded = [...maps]
  while (padded.length < 4) {
    padded.push({ rId: '', label: '', legendCaption: '' })
  }
  const row = (a: (typeof padded)[0], b: (typeof padded)[0]) => {
    const cells = [a, b]
      .map(m => (m.rId ? docxMapCell(m.rId, m.label, m.legendCaption) : `<w:tc><w:tcPr><w:tcW w:w="5040" w:type="dxa"/></w:tcPr><w:p/></w:tc>`))
      .join('')
    return `<w:tr><w:trPr><w:cantSplit/><w:jc w:val="center"/></w:trPr>${cells}</w:tr>`
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="5040"/><w:gridCol w:w="5040"/></w:tblGrid>${row(padded[0]!, padded[1]!)}${row(padded[2]!, padded[3]!)}</w:tbl>`
}

/** Profile line chart size from reference report (~6.1" × 3.8"). */
export const CUT_FILL_PROFILE_CHART_CX = 6177516
export const CUT_FILL_PROFILE_CHART_CY = 3880883
/** Wide profile PNG under Elevation Profile section. */
export const CUT_FILL_PROFILE_IMAGE_CX = 6570921
export const CUT_FILL_PROFILE_IMAGE_CY = 2331540
