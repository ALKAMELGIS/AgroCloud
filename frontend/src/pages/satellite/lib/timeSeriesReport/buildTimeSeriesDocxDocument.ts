import {
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  DOCX_BRAND,
  DOCX_TABLE_FONT_SZ,
  docxBodyParagraph,
  docxBulletList,
  docxCoverPage,
  docxInlineChart,
  docxInlineImage,
  docxItalicNote,
  docxMapGrid,
  docxMetaLine,
  docxPageBreak,
  docxSectionHeading,
  docxSubtitle,
  docxTable,
  docxTableOfContentsPage,
  docxTitle,
  wrapDocumentBody,
} from './timeSeriesDocxXml'
import type {
  DocxLulcChangeBlock,
  DocxLulcYearBlock,
  DocxMapLayerBlock,
  TimeSeriesDocxModel,
} from './timeSeriesReportDocxModel'

function keyValueTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="${DOCX_TABLE_FONT_SZ}"/><w:szCs w:val="${DOCX_TABLE_FONT_SZ}"/></w:rPr><w:t>${escape(k)}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="6880" w:type="dxa"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="${DOCX_TABLE_FONT_SZ}"/><w:szCs w:val="${DOCX_TABLE_FONT_SZ}"/></w:rPr><w:t>${escape(v)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6880"/></w:tblGrid>${body}</w:tbl>`
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Chart sub-title — styled but not in TOC (no Heading style / outline). */
function chartCaptionHeading(text: string): string {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="${DOCX_BRAND}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(text)}</w:t></w:r></w:p>`
}

function renderMapLayerBlock(
  layer: DocxMapLayerBlock,
  opts: { withChart?: boolean; pushHeading: (title: string, level: 1 | 2) => string },
): string {
  const parts: string[] = []
  parts.push(opts.pushHeading(layer.title, 2))
  parts.push(docxMapGrid(layer.snapshots))
  if (layer.legend) {
    parts.push(docxItalicNote(`Legend key: ${layer.legend}`))
  }
  if (layer.narrative) {
    parts.push(docxBodyParagraph(layer.narrative))
  }
  if (opts.withChart && layer.chartRId) {
    parts.push(chartCaptionHeading(layer.chartTitle ?? 'Index Trend Chart'))
    parts.push(
      docxItalicNote(
        'Native editable Office chart (Excel-style). Click the chart in Word to edit series, axes, and formatting.',
      ),
    )
    parts.push(docxInlineChart(layer.chartRId))
  }
  return parts.join('')
}

function renderLulcYearBlock(
  block: DocxLulcYearBlock,
  pushHeading: (title: string, level: 1 | 2) => string,
): string {
  const parts: string[] = []
  parts.push(pushHeading(block.title, 2))
  if (block.mapRId) {
    parts.push(
      docxMapGrid([
        {
          rId: block.mapRId,
          date: String(block.year),
          label: block.mapCaption,
        },
      ]),
    )
  }
  parts.push(
    keyValueTable([
      ['Mapped Year', String(block.year)],
      ['Total Classified Area', block.totalAreaHa],
      ['Scene', block.mapCaption],
    ]),
  )
  if (block.tableRows.length) {
    parts.push(chartCaptionHeading(`Class Area Table — ${block.year}`))
    parts.push(
      docxItalicNote(
        'Share (%) and area (ha) for each LULC class in this mid-season scene. Total row sums classified area.',
      ),
    )
    parts.push(docxTable(block.tableHeaders, block.tableRows, [4200, 2200, 3680]))
  }
  if (block.pieChartRId) {
    parts.push(chartCaptionHeading(block.pieChartTitle ?? `LULC ${block.year} Share %`))
    parts.push(docxItalicNote('Native pie chart — class share (%) of classified AOI area.'))
    parts.push(docxInlineChart(block.pieChartRId))
  }
  if (block.barChartRId) {
    parts.push(chartCaptionHeading(block.barChartTitle ?? `LULC ${block.year} Area (ha)`))
    parts.push(docxItalicNote('Native bar chart — absolute area (ha) by LULC class.'))
    parts.push(docxInlineChart(block.barChartRId))
  }
  return parts.join('')
}

function renderLulcChangeBlock(
  block: DocxLulcChangeBlock,
  pushHeading: (title: string, level: 1 | 2) => string,
): string {
  const parts: string[] = []
  parts.push(pushHeading(block.title, 2))
  const snaps: Array<{ rId: string; date: string; label: string }> = []
  if (block.mapBeforeRId) {
    snaps.push({
      rId: block.mapBeforeRId,
      date: String(block.yearFrom),
      label: block.mapBeforeCaption,
    })
  }
  if (block.mapAfterRId) {
    snaps.push({
      rId: block.mapAfterRId,
      date: String(block.yearTo),
      label: block.mapAfterCaption,
    })
  }
  if (snaps.length) parts.push(docxMapGrid(snaps))
  if (block.tableRows.length) {
    parts.push(chartCaptionHeading(`Change Table — ${block.yearFrom} → ${block.yearTo}`))
    parts.push(
      docxItalicNote(
        'Δ Area = area(to) − area(from). Δ Share = percentage-point change in class share of AOI.',
      ),
    )
    parts.push(docxTable(block.tableHeaders, block.tableRows, [2800, 1600, 1600, 2000, 2080]))
  }
  if (block.barChartRId) {
    parts.push(chartCaptionHeading(block.barChartTitle ?? 'Δ Area (ha)'))
    parts.push(
      docxItalicNote(
        'Native bar chart of class area change (ha). Positive = expansion; negative = contraction.',
      ),
    )
    parts.push(docxInlineChart(block.barChartRId))
  }
  return parts.join('')
}

/**
 * Page 1: cover · Page 2: Table of Contents with page numbers · then report body.
 */
export function buildTimeSeriesDocxDocumentXml(model: TimeSeriesDocxModel): string {
  const tocEntries: string[] = []
  const pushHeading = (title: string, level: 1 | 2 = 1, keepNext = true): string => {
    tocEntries.push(title)
    return docxSectionHeading(title, keepNext, level)
  }

  const parts: string[] = []

  parts.push(
    docxCoverPage({
      projectName: model.projectName,
      fieldName: model.fieldName,
      areaHa: model.areaHa,
      periodLabel: model.periodLabel,
      layerIdsLabel: model.layerIdsLabel,
      generatedBy: model.generatedBy,
      generatedStamp: model.generatedStamp,
      satelliteSource: model.satelliteSource,
      obsCount: model.obsCount,
    }),
  )

  // TOC page is inserted after body headings are known — build body first into buffer.
  const body: string[] = []

  body.push(docxTitle('AGRICULTURAL SATELLITE INTELLIGENCE'))
  body.push(docxSubtitle('Imagery Time Series Report'))
  body.push(
    docxMetaLine([
      { text: 'Source: ' },
      { text: model.projectName },
      { text: `  ·  Period ${model.periodLabel}` },
      { text: `  ·  ${model.obsCount} observations` },
    ]),
  )
  body.push(
    docxMetaLine([
      { text: `AOI: ${model.fieldName}  ·  ${model.areaHa}  ·  ${model.satelliteSource}` },
    ]),
  )

  body.push(pushHeading('Field Summary'))
  body.push(
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

  body.push(pushHeading('Executive Summary'))
  body.push(docxBodyParagraph(model.executiveSummary))

  body.push(pushHeading('Vegetation Vigor (NDVI / SAVI)'))
  body.push(docxBodyParagraph(model.vigorSection))

  body.push(pushHeading('Moisture Status (NDMI / NDWI)'))
  body.push(docxBodyParagraph(model.moistureSection))

  body.push(pushHeading('Vegetation Health Summary'))
  body.push(docxBodyParagraph(model.healthSummary))

  body.push(pushHeading('Period Statistics'))
  body.push(
    docxTable(model.periodStatsHeaders, model.periodStatsRows, [
      1680,
      ...model.periodStatsHeaders.slice(1).map(() =>
        Math.floor(8400 / Math.max(model.periodStatsHeaders.length - 1, 1)),
      ),
    ]),
  )
  body.push(docxBodyParagraph(model.flagsLine))

  if (model.weatherChartRIds.length || model.weatherChartRId || model.weatherTableRows.length) {
    body.push(pushHeading('Weather Timeline — Field Conditions'))
    body.push(
      docxItalicNote(
        model.weatherDataSource ||
          'Open-Meteo ERA5 archive at AOI centroid, aligned with the satellite analysis period and aggregation.',
      ),
    )
    if (model.weatherSummaryRows.length) {
      body.push(pushHeading('Weather Summary Statistics', 2))
      body.push(keyValueTable(model.weatherSummaryRows))
    }
    if (model.weatherChartRIds.length) {
      body.push(pushHeading('Climate Charts — Temperature · Rainfall · Humidity', 2))
      body.push(
        docxItalicNote(
          'Native editable Office charts (Excel-style). Temperature Max·Mean·Min at daily, monthly, and yearly scales; cumulative and monthly rainfall; humidity; rainfall share pie; and dual-axis comparisons with NDVI, NDMI, NDWI, and SAVI.',
        ),
      )
      for (const chart of model.weatherChartRIds) {
        body.push(chartCaptionHeading(chart.title))
        body.push(docxInlineChart(chart.rId))
      }
    } else if (model.weatherChartRId) {
      body.push(chartCaptionHeading('Weather Chart'))
      body.push(docxInlineImage(model.weatherChartRId, CHART_IMAGE_CX, CHART_IMAGE_CY))
    }
    if (model.weatherMonthlyRows.length) {
      body.push(pushHeading('Monthly Weather Totals & Rainfall Share', 2))
      body.push(
        docxItalicNote(
          'Monthly aggregates from ERA5 hourly archive: temperature extremes, humidity mean, rainfall totals with share of period rainfall (%), and cumulative rainfall.',
        ),
      )
      body.push(
        docxTable(model.weatherMonthlyHeaders, model.weatherMonthlyRows, [
          1400, 1100, 1100, 1100, 1200, 1300, 1100, 1400,
        ]),
      )
    }
    if (model.weatherYearlyRows.length) {
      body.push(pushHeading('Yearly Weather Totals', 2))
      body.push(
        docxTable(model.weatherYearlyHeaders, model.weatherYearlyRows, [
          1600, 1400, 1400, 1400, 1600, 1800,
        ]),
      )
    }
    if (model.weatherTableRows.length) {
      body.push(pushHeading('Weather Data by Analysis Period', 2))
      body.push(
        docxTable(model.weatherTableHeaders, model.weatherTableRows, [
          1500, 1200, 1300, 1200, 1300, 1400, 1200,
        ]),
      )
    }
    if (model.weatherCorrelationNotes.length) {
      body.push(pushHeading('Weather ↔ Vegetation Correlation Notes', 2))
      body.push(docxBulletList(model.weatherCorrelationNotes))
    }
  }

  if (model.vegCoverageRows.length) {
    body.push(pushHeading('Vegetation Coverage Timeline'))
    body.push(docxItalicNote(model.vegCoverageNote))
    body.push(
      docxTable(
        ['Date', 'NDVI Mean', 'Veg. Coverage %', 'Veg. Area (ha)', 'Dominant Class'],
        model.vegCoverageRows,
        [1500, 1500, 1900, 1700, 3480],
      ),
    )
  }

  if (model.mapLayers.length) {
    body.push(pushHeading('Map Snapshots & Index Charts — Selected Layers'))
    body.push(
      docxItalicNote(
        'Each selected index is presented with AOI maps (4 maps per page, 2×2), Layer Live color keys on every figure, and an editable Office trend chart below that index. Source: Sentinel-2 L2A (Sentinel Hub WMS).',
      ),
    )
    model.mapLayers.forEach((layer, i) => {
      if (i > 0) body.push(docxPageBreak())
      body.push(renderMapLayerBlock(layer, { withChart: true, pushHeading }))
    })
  }

  if (model.changeDetectionMapLayers.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('Index Change Detection'))
    body.push(
      docxItalicNote(
        'Start (T0) versus end (T1) acquisition maps for each selected index. Each map includes the Layer Live legend.',
      ),
    )
    model.changeDetectionMapLayers.forEach((layer, i) => {
      if (i > 0) body.push(docxPageBreak())
      body.push(renderMapLayerBlock(layer, { pushHeading }))
    })
  }

  if (model.lulcYearBlocks.length || model.lulcChangeBlocks.length || model.lulcMapLayers.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('LULC — Five-Year Land Cover & Change Detection (2021–2025)'))
    body.push(
      docxItalicNote(
        'Yearly mid-season LULC maps (July) for 2021–2025 with real class area (ha), share (%), native pie and bar charts under each map, plus consecutive-year change detection. Class keys match Layer Live LULC.',
      ),
    )

    if (model.lulcMultiYearRows.length) {
      body.push(pushHeading('Multi-Year Class Area Comparison', 2))
      body.push(
        docxItalicNote(
          'Area (ha) by LULC class across years. Δ first→last highlights net change from the earliest to the latest mapped year.',
        ),
      )
      const colCount = Math.max(model.lulcMultiYearHeaders.length, 1)
      const firstW = 2200
      const restW = Math.floor(7880 / Math.max(colCount - 1, 1))
      body.push(
        docxTable(
          model.lulcMultiYearHeaders,
          model.lulcMultiYearRows,
          [firstW, ...Array.from({ length: colCount - 1 }, () => restW)],
        ),
      )
      if (model.lulcMultiYearBarChartRId) {
        body.push(chartCaptionHeading(model.lulcMultiYearBarChartTitle ?? 'Multi-Year Area (ha)'))
        body.push(
          docxItalicNote(
            'Native editable clustered bar chart — area (ha) by class for each year. Click in Word to edit series.',
          ),
        )
        body.push(docxInlineChart(model.lulcMultiYearBarChartRId))
      }
    }

    model.lulcYearBlocks.forEach((block, i) => {
      if (i > 0 || model.lulcMultiYearRows.length) body.push(docxPageBreak())
      body.push(renderLulcYearBlock(block, pushHeading))
    })

    model.lulcChangeBlocks.forEach((block, i) => {
      body.push(docxPageBreak())
      if (i === 0) {
        body.push(pushHeading('LULC Change Detection — Consecutive Years'))
        body.push(
          docxItalicNote(
            'Before/after mid-season maps with Δ area (ha) and Δ share (percentage points) per class. Bar chart shows gains (+) and losses (−).',
          ),
        )
      }
      body.push(renderLulcChangeBlock(block, pushHeading))
    })

    // Fallback atlas when compositions were unavailable.
    if (!model.lulcYearBlocks.length && model.lulcMapLayers.length) {
      model.lulcMapLayers.forEach((layer, i) => {
        if (i > 0) body.push(docxPageBreak())
        body.push(renderMapLayerBlock(layer, { pushHeading }))
      })
    }
  }

  if (model.cumulativeMapLayers.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('Cumulative Maps — Peak of Period Composites'))
    body.push(
      docxItalicNote(
        'One composite per year/month/week (day mode uses year buckets). Scene = peak index observation in each period.',
      ),
    )
    model.cumulativeMapLayers.forEach((layer, i) => {
      if (i > 0) body.push(docxPageBreak())
      body.push(renderMapLayerBlock(layer, { pushHeading }))
    })
  }

  if (model.correlationBlocks.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('Correlation Analysis — Scatter Plots & R²'))
    body.push(
      docxItalicNote(
        'Pairwise relationship among selected layers. R² and Pearson r quantify linear association.',
      ),
    )
    for (const block of model.correlationBlocks) {
      body.push(pushHeading(block.title, 2))
      body.push(docxItalicNote(block.r2Label))
      if (block.rId) {
        body.push(docxInlineImage(block.rId, CHART_IMAGE_CX, CHART_IMAGE_CY))
      }
      body.push(docxBodyParagraph(block.gisInsight))
      body.push(docxBodyParagraph(block.agroInsight))
    }
  }

  body.push(pushHeading('Data Quality Notes'))
  body.push(docxBodyParagraph(model.dataQualityNotes))

  body.push(pushHeading('Recommendations'))
  body.push(docxBulletList(model.recommendations))

  if (model.cropRecommendationBullets.length) {
    body.push(pushHeading('Crop Planting Recommendations'))
    body.push(
      docxItalicNote(
        'Screening from AOI location, vigor/moisture, weather (ERA5), and optional salinity. Validate with soil lab tests and local agronomy before planting.',
      ),
    )
    body.push(docxBulletList(model.cropRecommendationBullets))
  }

  body.push(docxItalicNote(model.footerNote))

  // Page 2: TOC (entries collected while building body)
  parts.push(docxTableOfContentsPage(tocEntries))
  parts.push(...body)

  return wrapDocumentBody(parts.join(''))
}