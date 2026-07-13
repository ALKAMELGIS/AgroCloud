import {
  docxBodyParagraph,
  docxBulletList,
  docxInlineImage,
  docxItalicNote,
  docxMetaLine,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesDocxXml'
import type { SarFloodDocxModel } from './sarFloodDocxModel'

const MAP_CX = 5200380
const MAP_CY = 3463620

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function keyValueTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<w:tr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(k)}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6100" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(v)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6100"/></w:tblGrid>${body}</w:tbl>`
}

export function buildSarFloodDocxDocumentXml(model: SarFloodDocxModel): string {
  const parts: string[] = []

  parts.push(docxTitle('SAR FLOOD INTELLIGENCE REPORT'))
  parts.push(docxSubtitle('Satellite-Based Flood Detection, Hydrological Analysis & Risk Assessment'))
  parts.push(
    docxMetaLine([
      { text: 'Prepared by ' },
      { text: model.generatedBy },
      { text: `  ·  ${model.projectName}` },
      { text: `  ·  ${model.analysisDate}` },
    ]),
  )
  parts.push(docxMetaLine([{ text: `AOI: ${model.aoiName}  ·  ${model.areaHa}  ·  ${model.centroidLabel}` }]))

  parts.push(docxSectionHeading('Table of Contents'))
  parts.push(
    docxBulletList([
      'Executive Summary',
      'Project & AOI Information',
      'Satellite & Processing Metadata',
      'Flood Detection Methodology',
      'Snapshot Maps — Flood Atlas',
      'Flood Statistics & Class Composition',
      'Depth & Risk Screening',
      'Conclusions & Recommendations',
      'Data Quality & Limitations',
    ]),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveNarrative))
  parts.push(docxSectionHeading('Detection Summary'))
  parts.push(docxBodyParagraph(model.detectionSummary))
  parts.push(docxSectionHeading('Inundation Summary'))
  parts.push(docxBodyParagraph(model.inundationSummary))
  parts.push(docxSectionHeading('Depth & Risk Screening Summary'))
  parts.push(docxBodyParagraph(model.depthRiskSummary))
  parts.push(docxSectionHeading('Assessment Conclusion'))
  parts.push(docxBodyParagraph(model.conclusion))

  parts.push(docxSectionHeading('Project & AOI Information'))
  parts.push(
    keyValueTable([
      ['AOI Name', model.aoiName],
      ['Study Area', model.areaHa],
      ['Centroid', model.centroidLabel],
      ['Coordinate Reference System', model.crs],
      ['Analysis Date', model.analysisDate],
    ]),
  )

  parts.push(docxSectionHeading('Satellite & Processing Metadata'))
  parts.push(
    keyValueTable([
      ['Sensor', model.sensorLabel],
      ['Modality', model.modality],
      ['Analysis mode', model.mode],
      ['Pre-event date', model.preDate],
      ['Post-event date', model.postDate],
      ['VV water threshold', model.thresholdDb],
      ['Analysis grid', model.resolution],
    ]),
  )

  parts.push(docxSectionHeading('Flood Detection Methodology'))
  parts.push(docxBodyParagraph(model.methodologyNotes))

  parts.push(docxSectionHeading('Snapshot Maps — Flood Atlas'))
  parts.push(
    docxItalicNote(
      'High-resolution GIS snapshots with Esri satellite basemap, AOI boundary (aspect-preserved), legend, north arrow, scale bar, and coordinate footer. Depth and risk maps are screening proxies.',
    ),
  )

  for (const snap of model.snapshotBlocks) {
    parts.push(docxSectionHeading(snap.title))
    if (snap.rId) {
      parts.push(docxInlineImage(snap.rId, MAP_CX, MAP_CY))
    } else {
      parts.push(docxItalicNote(snap.note ?? 'Map not available for this product.'))
    }
    if (snap.stats) parts.push(docxItalicNote(snap.stats))
    if (snap.legend) parts.push(docxItalicNote(`Legend: ${snap.legend}`))
  }

  parts.push(docxSectionHeading('Flood Statistics & Class Composition'))
  for (const table of model.tables) {
    parts.push(docxSectionHeading(table.title))
    const colW = Math.floor(9300 / Math.max(table.headers.length, 1))
    parts.push(docxTable(table.headers, table.rows, table.headers.map(() => colW)))
  }

  parts.push(docxSectionHeading('Conclusions & Recommendations'))
  parts.push(docxBodyParagraph(model.conclusion))
  parts.push(docxBulletList(model.recommendations))

  parts.push(docxSectionHeading('Data Quality & Limitations'))
  parts.push(docxBodyParagraph(model.dataQualityNotes))

  parts.push(
    docxItalicNote(
      `Generated ${model.generatedStamp} by ${model.projectName}. GeoSyntra SAR Flood Intelligence — enterprise GIS reporting.`,
    ),
  )

  return wrapDocumentBody(parts.join(''))
}
