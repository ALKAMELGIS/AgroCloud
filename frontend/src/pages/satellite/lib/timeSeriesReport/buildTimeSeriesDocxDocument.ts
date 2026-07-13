import {
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  docxBodyParagraph,
  docxBulletList,
  docxInlineImage,
  docxItalicNote,
  docxMapGrid,
  docxMetaLine,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTitle,
  wrapDocumentBody,
} from './timeSeriesDocxXml'
import type { TimeSeriesDocxModel } from './timeSeriesReportDocxModel'

function keyValueTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<w:tr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(k)}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6100" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(v)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6100"/></w:tblGrid>${body}</w:tbl>`
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildTimeSeriesDocxDocumentXml(model: TimeSeriesDocxModel): string {
  const parts: string[] = []

  parts.push(docxTitle('AGRICULTURAL SATELLITE INTELLIGENCE'))
  parts.push(docxSubtitle('Imagery Time Series Report'))
  parts.push(
    docxMetaLine([
      { text: 'Source: ' },
      { text: model.projectName },
      { text: `  ·  Period ${model.periodLabel}` },
      { text: `  ·  ${model.obsCount} observations` },
    ]),
  )
  parts.push(
    docxMetaLine([
      { text: `AOI: ${model.fieldName}  ·  ${model.areaHa}  ·  ${model.satelliteSource}` },
    ]),
  )

  parts.push(docxSectionHeading('Field Summary'))
  parts.push(
    keyValueTable([
      ['AOI / Field Name', model.fieldName],
      ['Total Field Area', model.areaHa],
      ['Analysis Period', `${model.periodLabel} (${model.obsCount} observations)`],
      ['Satellite Source', model.satelliteSource],
      ['Latest Acquisition', model.latestAcquisition],
      ['Vegetation Indices', model.layerIdsLabel],
      ['Vegetation Health Summary', model.vigorSummary],
      ['Data Completeness', model.dataCompleteness],
    ]),
  )

  parts.push(docxSectionHeading('Executive Summary'))
  parts.push(docxBodyParagraph(model.executiveSummary))

  parts.push(docxSectionHeading('Vegetation Vigor (NDVI / SAVI)'))
  parts.push(docxBodyParagraph(model.vigorSection))

  parts.push(docxSectionHeading('Moisture Status (NDMI / NDWI)'))
  parts.push(docxBodyParagraph(model.moistureSection))

  parts.push(docxSectionHeading('Vegetation Health Summary'))
  parts.push(docxBodyParagraph(model.healthSummary))

  parts.push(docxSectionHeading('Period Statistics'))
  parts.push(
    docxTable(model.periodStatsHeaders, model.periodStatsRows, [
      2100,
      ...model.periodStatsHeaders.slice(1).map(() => Math.floor(7200 / Math.max(model.periodStatsHeaders.length - 1, 1))),
    ]),
  )
  parts.push(docxBodyParagraph(model.flagsLine))

  parts.push(docxSectionHeading('Imagery Timeline — Vegetation & Moisture Trends'))
  parts.push(
    docxItalicNote(
      'The charts below plot each vegetation index across all acquisition dates in the monitoring period, aligned by scene date.',
    ),
  )
  for (const chart of model.chartImages) {
    parts.push(docxSectionHeading(chart.title))
    parts.push(docxInlineImage(chart.rId, CHART_IMAGE_CX, CHART_IMAGE_CY))
  }

  if (model.weatherChartRId || model.weatherTableRows.length) {
    parts.push(docxSectionHeading('Weather Timeline — Field Conditions'))
    parts.push(
      docxItalicNote(
        model.weatherDataSource ||
          'Open-Meteo ERA5 archive at AOI centroid, aligned with the satellite analysis period and aggregation.',
      ),
    )
    if (model.weatherSummaryRows.length) {
      parts.push(docxSectionHeading('Weather Summary Statistics'))
      parts.push(keyValueTable(model.weatherSummaryRows))
    }
    if (model.weatherChartRId) {
      parts.push(docxSectionHeading('Weather Chart'))
      parts.push(docxInlineImage(model.weatherChartRId, CHART_IMAGE_CX, CHART_IMAGE_CY))
    }
    if (model.weatherTableRows.length) {
      parts.push(docxSectionHeading('Weather Data by Period'))
      parts.push(
        docxTable(model.weatherTableHeaders, model.weatherTableRows, [1700, 1300, 1500, 1500, 1300]),
      )
    }
    if (model.weatherCorrelationNotes.length) {
      parts.push(docxSectionHeading('Weather ↔ Vegetation Correlation Notes'))
      parts.push(docxBulletList(model.weatherCorrelationNotes))
    }
  }

  if (model.vegCoverageRows.length) {
    parts.push(docxSectionHeading('Vegetation Coverage Timeline'))
    parts.push(docxItalicNote(model.vegCoverageNote))
    parts.push(
      docxTable(
        ['Date', 'NDVI Mean', 'Veg. Coverage %', 'Veg. Area (ha)', 'Dominant Class'],
        model.vegCoverageRows,
        [1500, 1500, 1900, 1700, 2700],
      ),
    )
  }

  if (model.mapLayers.length) {
    parts.push(docxSectionHeading('Map Snapshots — Full Time Series'))
    parts.push(
      docxItalicNote(
        'AOI index maps for every period in the Imagery Time Series chart (start/end date and aggregation), organized by analysis layer. Each map includes satellite basemap, index raster, and AOI boundary. Data source: Sentinel-2 L2A (Sentinel Hub WMS).',
      ),
    )
    for (const layer of model.mapLayers) {
      parts.push(docxSectionHeading(layer.title))
      parts.push(docxMapGrid(layer.snapshots))
      if (layer.legend) {
        parts.push(docxItalicNote(`Legend: ${layer.legend}`))
      }
      if (layer.narrative) {
        parts.push(docxBodyParagraph(layer.narrative))
      }
    }
  }

  parts.push(docxSectionHeading('Data Quality Notes'))
  parts.push(docxBodyParagraph(model.dataQualityNotes))

  parts.push(docxSectionHeading('Recommendations'))
  parts.push(docxBulletList(model.recommendations))

  parts.push(docxItalicNote(model.footerNote))

  return wrapDocumentBody(parts.join(''))
}
