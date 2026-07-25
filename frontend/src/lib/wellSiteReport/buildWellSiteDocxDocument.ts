import {
  DOCX_BRAND,
  DOCX_TABLE_FONT_SZ,
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
import type { WellSiteDocxModel } from './wellSiteReportDocxModel'

/** Wider map frame so legend strip under basemap stays readable. */
const WELL_MAP_CX = 5200380
const WELL_MAP_CY = 3680000

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
export function buildWellSiteDocxDocumentXml(model: WellSiteDocxModel): string {
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
      periodLabel: `Best score ${model.bestScore} · ${model.siteCount} sites`,
      layerIdsLabel: `Well Site Hydro-AI · Suitability heatmap · Ranked wells`,
      generatedBy: model.generatedBy,
      generatedStamp: model.generatedStamp,
      satelliteSource: 'DEM terrain · Hydro-AI drilling suitability',
      obsCount: model.siteCount,
    }),
  )

  const body: string[] = []

  body.push(pushHeading('Executive Summary'))
  body.push(docxBodyParagraph(model.executiveOverview))
  body.push(pushHeading('Suitability Summary', 2))
  body.push(docxBodyParagraph(model.executiveSuitability))
  body.push(pushHeading('Methodology Summary', 2))
  body.push(docxBodyParagraph(model.executiveMethodology))
  body.push(pushHeading('Assessment Conclusion', 2))
  body.push(docxBodyParagraph(model.executiveConclusion))

  body.push(pushHeading('Project & AOI Information'))
  body.push(keyValueTable(model.metaRows))

  body.push(pushHeading('Summary Statistics'))
  body.push(
    docxItalicNote(
      'Key metrics from the Hydro-AI well-site run: recommended site count, best/mean suitability, slope, and grid resolution.',
    ),
  )
  body.push(docxTable(model.summaryTableHeaders, model.summaryTableRows, [4200, 4000]))

  body.push(pushHeading('Recommended Wells Table'))
  body.push(
    docxItalicNote(
      'Ranked drilling candidates with coordinates, terrain, aquifer proxy, water-table estimate, yield proxy, confidence, and risk.',
    ),
  )
  if (model.wellTableRows.length) {
    body.push(
      docxTable(model.wellTableHeaders, model.wellTableRows, [
        620, 1280, 720, 980, 980, 780, 720, 980, 720, 900, 700, 700,
      ]),
    )
  } else {
    body.push(docxBodyParagraph('No recommended well sites were available for this run.'))
  }

  if (model.chartRIds.length) {
    body.push(pushHeading('Charts — Scores & Terrain'))
    body.push(
      docxItalicNote(
        'Native editable Office charts. Click a chart in Word to edit series, colours, and labels.',
      ),
    )
    for (const chart of model.chartRIds) {
      body.push(chartCaption(chart.title))
      body.push(docxInlineChart(chart.rId))
    }
  }

  const mapsWithImages = model.mapTiles.filter(m => m.rId)
  if (mapsWithImages.length) {
    body.push(pushHeading('Map Atlas — AOI · Suitability · Wells'))
    body.push(
      docxItalicNote(
        'Professional map composites with Esri World Imagery basemap, AOI outline, north arrow, scale bar, and legend key. Heatmap shows drilling suitability (Low→High); numbered markers are ranked recommended wells.',
      ),
    )
    for (const tile of model.mapTiles) {
      body.push(pushHeading(tile.title, 2))
      body.push(docxItalicNote(tile.subtitle))
      if (tile.rId) {
        body.push(docxInlineImage(tile.rId, WELL_MAP_CX, WELL_MAP_CY))
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

  body.push(pushHeading('Final Recommendation'))
  body.push(docxBodyParagraph(model.finalRecommendation.interpretation))
  body.push(docxBodyParagraph(model.finalRecommendation.preDrillingIntro))
  body.push(docxBulletList(model.finalRecommendation.preDrillingSteps))

  body.push(docxItalicNote(model.footerNote))

  parts.push(docxTableOfContentsPage(tocEntries))
  parts.push(...body)

  return wrapDocumentBody(parts.join(''))
}
