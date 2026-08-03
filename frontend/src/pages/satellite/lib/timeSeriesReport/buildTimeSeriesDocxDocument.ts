import {
  CHANGE_CHART_IMAGE_CX,
  CHANGE_CHART_IMAGE_CY,
  CHART_IMAGE_CX,
  CHART_IMAGE_CY,
  CHART_IMAGE_CY_TALL,
  DOCX_BRAND,
  DOCX_TABLE_FONT_SZ,
  docxBodyParagraph,
  docxBulletList,
  docxChangePairMaps,
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
  DocxIndexChangeBlock,
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
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="40" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="${DOCX_BRAND}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escape(text)}</w:t></w:r></w:p>`
}

function renderMapLayerBlock(
  layer: DocxMapLayerBlock,
  opts: { withChart?: boolean; pushHeading: (title: string, level: 1 | 2) => string },
): string {
  const parts: string[] = []
  parts.push(opts.pushHeading(layer.title, 2))
  parts.push(docxMapGrid(layer.snapshots))
  // Chart immediately under maps — legend/narrative after avoids large blank bands.
  if (opts.withChart && layer.chartRId) {
    parts.push(chartCaptionHeading(layer.chartTitle ?? 'Index Trend Chart'))
    parts.push(docxInlineChart(layer.chartRId))
  }
  if (layer.legend) {
    parts.push(docxItalicNote(`Legend key: ${layer.legend}`))
  }
  if (layer.narrative) {
    parts.push(docxBodyParagraph(layer.narrative))
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
    parts.push(docxItalicNote('Class share (%) of classified AOI area — percent labels with side legend.'))
    parts.push(docxInlineChart(block.pieChartRId, CHART_IMAGE_CX, CHART_IMAGE_CY_TALL))
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

function renderIndexChangeBlock(
  block: DocxIndexChangeBlock,
  pushHeading: (title: string, level: 1 | 2) => string,
): string {
  const parts: string[] = []
  // Sample page: pair title → T0|T1 maps → Index Change Table → compare chart → Δ chart → legend/narrative
  parts.push(pushHeading(block.title, 2))
  if (block.snapshots.length) parts.push(docxChangePairMaps(block.snapshots))
  if (block.tableRows.length) {
    parts.push(chartCaptionHeading('Index Change Table'))
    parts.push(
      docxItalicNote(
        'T0 / T1 AOI means for this consecutive period pair. Δ = T1 − T0 (positive = increase).',
      ),
    )
    parts.push(docxTable(block.tableHeaders, block.tableRows, [2800, 2200, 2200, 2880]))
  }
  if (block.compareChartRId) {
    parts.push(chartCaptionHeading(block.compareChartTitle ?? 'Index Change Detection'))
    parts.push(
      docxItalicNote(
        'Native comparison chart — AOI mean for T0 versus T1 (follows panel Day/Week/Month/Year periods).',
      ),
    )
    parts.push(
      docxInlineChart(block.compareChartRId, CHANGE_CHART_IMAGE_CX, CHANGE_CHART_IMAGE_CY, {
        center: true,
      }),
    )
  }
  if (block.deltaChartRId) {
    parts.push(chartCaptionHeading(block.deltaChartTitle ?? 'Δ Index Change'))
    parts.push(docxItalicNote('Native Δ chart — change in AOI mean between the two periods.'))
    parts.push(
      docxInlineChart(block.deltaChartRId, CHANGE_CHART_IMAGE_CX, CHANGE_CHART_IMAGE_CY, {
        center: true,
      }),
    )
  }
  if (block.legend) parts.push(docxItalicNote(`Legend key: ${block.legend}`))
  if (block.narrative) parts.push(docxBodyParagraph(block.narrative))
  return parts.join('')
}

/**
 * Page 1: cover · Page 2: Table of Contents with page numbers · then report body.
 * @param mode `intelligence` builds the index atlas report (maps, change, weather, annexes; no LULC).
 *             `lulc` builds a standalone LULC Word report with the same LULC blocks.
 */
export function buildTimeSeriesDocxDocumentXml(
  model: TimeSeriesDocxModel,
  mode: 'intelligence' | 'lulc' = 'intelligence',
): string {
  if (mode === 'lulc') return buildTimeSeriesLulcDocxDocumentXml(model)

  const tocEntries: string[] = []
  const pushHeading = (title: string, level: 1 | 2 = 1, keepNext = true): string => {
    // TOC lists main (level-1) section titles only — each with a page number in Word.
    if (level === 1) tocEntries.push(title)
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
  if (model.vigorSummary) {
    body.push(
      keyValueTable([
        ['Vegetation Health Summary', model.vigorSummary],
      ]),
    )
  }

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
          'Clear Office charts: temperature extremes (daily / monthly / yearly), rainfall totals and cumulative bars, top-month rainfall share (horizontal bar), annual rainfall share when multi-year, humidity, and dual-axis comparisons with NDVI, NDMI when available.',
        ),
      )
      for (const chart of model.weatherChartRIds) {
        // Chart title is already inside ChartML — skip duplicate Word caption to save space.
        const cy = chart.tall ? CHART_IMAGE_CY_TALL : CHART_IMAGE_CY
        body.push(docxInlineChart(chart.rId, CHART_IMAGE_CX, cy))
        if (chart.title.includes('Rainfall Share')) {
          body.push(
            docxBodyParagraph(
              chart.title.includes('Top Months')
                ? 'Interpretation: Bars show each month’s share of total rainfall in the analysis period (top contributors; remaining months grouped as Other). Use peaks to time planting, irrigation, and flood-risk windows.'
                : 'Interpretation: Slice size is each year’s share of multi-year rainfall — compare wet vs dry years for seasonal planning.',
            ),
          )
        }
      }
    } else if (model.weatherChartRId) {
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
    if (model.vegCoverageChartRIds.length) {
      body.push(pushHeading('Vegetation Coverage — Chart Timeline', 2))
      body.push(
        docxItalicNote(
          'Canopy cover versus bare ground, with NDVI mean on a secondary axis. Class-share lines show Healthy / Moderate / Stress / Bare fractions when available.',
        ),
      )
      for (const chart of model.vegCoverageChartRIds) {
        body.push(chartCaptionHeading(chart.title))
        body.push(
          docxInlineChart(
            chart.rId,
            CHART_IMAGE_CX,
            chart.tall ? CHART_IMAGE_CY_TALL : CHART_IMAGE_CY,
          ),
        )
      }
      if (model.vegCoverageChartInterpretation) {
        body.push(pushHeading('Interpretation', 2))
        body.push(docxBodyParagraph(model.vegCoverageChartInterpretation))
      }
    }
  }

  if (model.mapLayers.length) {
    body.push(pushHeading('Map Snapshots & Index Charts — Selected Layers'))
    body.push(
      docxItalicNote(
        'Enterprise atlas layout: 12 map cards per page in a uniform 3×4 grid. Each card includes title bar, map (AOI + north arrow + scale), Layer Live legend, and a date/index/mean caption. When the index raster is unavailable, an AOI basemap card with the period mean is still included. Editable Office trend chart follows each index.',
      ),
    )
    model.mapLayers.forEach((layer, i) => {
      // Each index starts on a new page — maps grid, then trend chart (T-23 layout).
      if (i > 0) body.push(docxPageBreak())
      body.push(renderMapLayerBlock(layer, { withChart: true, pushHeading }))
    })
  }

  if (model.indexChangeBlocks.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('Index Change Detection'))
    body.push(
      docxItalicNote(
        'Consecutive period comparisons for each selected index (aligned with panel Time aggregation). Each page shows T0/T1 maps side-by-side, an Index Change Table, then native comparison and Δ charts.',
      ),
    )
    model.indexChangeBlocks.forEach((block, i) => {
      if (i > 0) body.push(docxPageBreak())
      body.push(renderIndexChangeBlock(block, pushHeading))
    })
  } else if (model.changeDetectionMapLayers.length) {
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

  // LULC is exported via the separate "LULC Report (Word)" menu item — omitted here.

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

  // Annexes at end — charts first, then all paired-value tables.
  if (model.correlationBlocks.length) {
    body.push(docxPageBreak())
    body.push(pushHeading('Annex A — Correlation Analysis'))
    body.push(
      docxItalicNote(
        'Editable Office scatter charts (white report style) for every selected index pair, sorted by layer. Paired observation tables are collected in Annex B.',
      ),
    )
    model.correlationBlocks.forEach((block, i) => {
      if (i > 0 && i % 2 === 0) body.push(docxPageBreak())
      body.push(pushHeading(block.title, 2))
      body.push(docxItalicNote(block.r2Label))
      if (block.chartRId) {
        body.push(docxInlineChart(block.chartRId, CHART_IMAGE_CX, CHART_IMAGE_CY_TALL))
      } else if (block.rId) {
        body.push(docxInlineImage(block.rId, CHART_IMAGE_CX, CHART_IMAGE_CY))
      }
      body.push(docxBodyParagraph(block.interpretation))
    })

    const blocksWithTables = model.correlationBlocks.filter(b => b.valueRows.length)
    if (blocksWithTables.length) {
      body.push(docxPageBreak())
      body.push(pushHeading('Annex B — Paired Values Tables'))
      body.push(
        docxItalicNote(
          'Date-aligned paired observations for each Correlation Analysis index pair. Use these tables to audit chart points and regression inputs.',
        ),
      )
      blocksWithTables.forEach((block, i) => {
        if (i > 0 && i % 3 === 0) body.push(docxPageBreak())
        body.push(pushHeading(`${block.xLayerId} × ${block.yLayerId}`, 2))
        body.push(docxItalicNote(block.r2Label))
        const widths =
          block.valueHeaders.length === 3
            ? [3360, 3360, 3360]
            : block.valueHeaders.map(() => Math.floor(10080 / Math.max(1, block.valueHeaders.length)))
        body.push(docxTable(block.valueHeaders, block.valueRows, widths))
      })
    }
  }

  const compactFooter = model.footerNote.replace(
    /\s*Includes Layer Live legends.*?crop recommendations\./i,
    ' Includes Layer Live legends, editable Office charts, map atlases, and crop recommendations. LULC land-cover analysis is available as a separate Word export.',
  )
  body.push(docxItalicNote(compactFooter))

  // Page 2: TOC (entries collected while building body)
  parts.push(docxTableOfContentsPage(tocEntries))
  parts.push(...body)

  return wrapDocumentBody(parts.join(''))
}

function appendLulcReportSections(
  body: string[],
  model: TimeSeriesDocxModel,
  pushHeading: (title: string, level?: 1 | 2, keepNext?: boolean) => string,
  opts?: { leadingPageBreak?: boolean },
): void {
  const hasLulc =
    model.lulcYearBlocks.length > 0 ||
    model.lulcChangeBlocks.length > 0 ||
    model.lulcMapLayers.length > 0

  if (opts?.leadingPageBreak !== false) body.push(docxPageBreak())
  body.push(pushHeading('LULC — Five-Year Land Cover & Change Detection (2021–2025)'))

  if (!hasLulc) {
    body.push(
      docxBodyParagraph(
        'No LULC map snapshots or class-area compositions were available for this AOI. Check Sentinel coverage for mid-season July scenes (2021–2025) and retry the export.',
      ),
    )
    return
  }

  body.push(
    docxItalicNote(
      'Yearly mid-season LULC maps (July) for 2021–2025 with class area (ha), share (%), native pie and bar charts under each map, plus consecutive-year change detection. Class keys match Layer Live LULC.',
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

  if (!model.lulcYearBlocks.length && model.lulcMapLayers.length) {
    model.lulcMapLayers.forEach((layer, i) => {
      if (i > 0) body.push(docxPageBreak())
      body.push(renderMapLayerBlock(layer, { pushHeading }))
    })
  }
}

/** Standalone LULC report — same year / change blocks as the Intelligence Report section. */
export function buildTimeSeriesLulcDocxDocumentXml(model: TimeSeriesDocxModel): string {
  const tocEntries: string[] = []
  const pushHeading = (title: string, level: 1 | 2 = 1, keepNext = true): string => {
    if (level === 1) tocEntries.push(title)
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
      reportTitle: 'LULC Land Cover Intelligence Report',
      reportSubtitle: 'Five-Year Atlas & Change Detection (2021–2025)',
      extraMeta: { label: 'Product', value: 'Sentinel-2 L2A · AgroCloud LULC (IO schema)' },
    }),
  )

  const body: string[] = []
  body.push(docxTitle('LULC LAND COVER INTELLIGENCE'))
  body.push(docxSubtitle('Five-Year Mid-Season Atlas & Consecutive-Year Change'))
  body.push(
    docxMetaLine([
      { text: 'Source: ' },
      { text: model.projectName },
      { text: `  ·  Period ${model.periodLabel}` },
      { text: `  ·  AOI ${model.fieldName}` },
    ]),
  )
  body.push(
    docxMetaLine([{ text: `${model.areaHa}  ·  ${model.satelliteSource}` }]),
  )

  body.push(pushHeading('Field Summary'))
  body.push(
    keyValueTable([
      ['AOI / Field Name', model.fieldName],
      ['Total Field Area', model.areaHa],
      ['Analysis Period', `${model.periodLabel} (${model.obsCount} observations)`],
      ['Satellite Source', model.satelliteSource],
      ['Latest Acquisition', model.latestAcquisition],
      ['Vegetation Indices (context)', model.layerIdsLabel],
      ['Data Completeness', model.dataCompleteness],
    ]),
  )

  appendLulcReportSections(body, model, pushHeading, { leadingPageBreak: false })

  body.push(pushHeading('Data Quality Notes'))
  body.push(
    docxBodyParagraph(
      `LULC class areas are derived from Sentinel-2 L2A mid-season composites (July) using the AgroCloud Impact Observatory schema. Maps include Layer Live legends. Validate transitions with local land-use knowledge before operational decisions. Generated ${model.generatedStamp} by ${model.projectName}.`,
    ),
  )

  parts.push(docxTableOfContentsPage(tocEntries))
  parts.push(...body)
  return wrapDocumentBody(parts.join(''))
}