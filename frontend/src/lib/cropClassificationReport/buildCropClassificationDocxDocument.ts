import {
  DOCX_BRAND,
  DOCX_TABLE_FONT_SZ,
  MAP_IMAGE_CX,
  MAP_IMAGE_CY,
  docxBodyParagraph,
  docxBulletList,
  docxCoverPage,
  docxInlineChart,
  docxInlineImage,
  docxItalicNote,
  docxSectionHeading,
  docxTable,
  docxTableOfContentsPage,
  wrapDocumentBody,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxXml'
import type { CropClassificationDocxModel } from './cropClassificationReportDocxModel'

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function keyValueTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="${DOCX_TABLE_FONT_SZ}"/><w:szCs w:val="${DOCX_TABLE_FONT_SZ}"/></w:rPr><w:t>${escape(k)}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6880" w:type="dxa"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="${DOCX_TABLE_FONT_SZ}"/><w:szCs w:val="${DOCX_TABLE_FONT_SZ}"/></w:rPr><w:t>${escape(v)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6880"/></w:tblGrid>${body}</w:tbl>`
}

function chartCaption(text: string): string {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="${DOCX_BRAND}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(text)}</w:t></w:r></w:p>`
}

/**
 * Page 1 cover · Page 2 TOC · then summary, tables, charts, maps, recommendations.
 */
export function buildCropClassificationDocxDocumentXml(model: CropClassificationDocxModel): string {
  const tocEntries: string[] = []
  const pushHeading = (title: string, level: 1 | 2 = 1, keepNext = true): string => {
    tocEntries.push(title)
    return docxSectionHeading(title, keepNext, level)
  }

  const parts: string[] = []
  parts.push(
    docxCoverPage({
      projectName: model.projectName,
      fieldName: model.aoiName,
      areaHa: model.areaHa,
      periodLabel: model.periodLabel,
      layerIdsLabel: `Crop Type · ${model.engine} · ${model.classCount} classes`,
      generatedBy: model.generatedBy,
      generatedStamp: model.generatedStamp,
      satelliteSource: 'Sentinel / HLS · Prithvi Crop Classification',
      obsCount: model.classCount,
    }),
  )

  const body: string[] = []

  body.push(pushHeading('Executive Summary'))
  body.push(docxBodyParagraph(model.executiveOverview))
  body.push(pushHeading('Composition Summary', 2))
  body.push(docxBodyParagraph(model.executiveComposition))
  body.push(pushHeading('Methodology Summary', 2))
  body.push(docxBodyParagraph(model.executiveMethodology))
  body.push(pushHeading('Assessment Conclusion', 2))
  body.push(docxBodyParagraph(model.executiveConclusion))

  body.push(pushHeading('Project & AOI Information'))
  body.push(keyValueTable(model.metaRows))

  body.push(pushHeading('Crop Composition Table'))
  body.push(
    docxItalicNote(
      'Class share (%) and area (ha) within the AOI. Area is derived from geodesic AOI area × class share when backend hectares are not provided.',
    ),
  )
  if (model.classTableRows.length) {
    body.push(
      docxTable(model.classTableHeaders, model.classTableRows, [4200, 1800, 2200]),
    )
  } else {
    body.push(docxBodyParagraph('No class statistics were available for this run.'))
  }

  if (model.chartRIds.length) {
    body.push(pushHeading('Crop Composition Charts'))
    body.push(
      docxItalicNote(
        'Native editable Office charts (Excel-style). Click a chart in Word to edit series, colours, and labels. Includes pie (share %) and bar (area/share).',
      ),
    )
    for (const chart of model.chartRIds) {
      body.push(chartCaption(chart.title))
      body.push(docxInlineChart(chart.rId))
    }
  }

  const mapsWithImages = model.mapTiles.filter(m => m.rId)
  if (mapsWithImages.length) {
    body.push(pushHeading('Map Atlas — AOI · Scenes · Crop Type'))
    body.push(
      docxItalicNote(
        'Professional map composites with basemap, AOI outline, north arrow, scale bar, and legend. T1–T3 are multi-temporal optical scenes; Crop Type is the classified prediction.',
      ),
    )
    for (const tile of model.mapTiles) {
      body.push(pushHeading(tile.title, 2))
      body.push(docxItalicNote(tile.subtitle))
      if (tile.rId) {
        body.push(docxInlineImage(tile.rId, MAP_IMAGE_CX, MAP_IMAGE_CY))
      } else {
        body.push(docxBodyParagraph('Map image unavailable for this layer.'))
      }
      if (tile.note) body.push(docxItalicNote(tile.note))
    }
  }

  body.push(pushHeading('Processing Methodology'))
  body.push(docxBulletList(model.methodologyNotes))

  body.push(pushHeading('Data Quality & Limitations'))
  body.push(docxBulletList(model.dataQualityNotes))

  body.push(pushHeading('Recommendations'))
  body.push(docxBulletList(model.recommendations))

  body.push(docxItalicNote(model.footerNote))

  parts.push(docxTableOfContentsPage(tocEntries))
  parts.push(...body)

  return wrapDocumentBody(parts.join(''))
}