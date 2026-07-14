/**
 * Inject native editable Excel charts (OOXML) into an ExcelJS workbook buffer.
 * ExcelJS cannot create charts, so we post-process the XLSX ZIP package.
 */
import JSZip from 'jszip'

export type MeteoChartSeriesRef = {
  /** Header cell with series name, e.g. Data!$B$6 */
  nameRef?: string
  /** Explicit series name when no header cell */
  name?: string
  /** Values range, e.g. Data!$B$7:$B$18 */
  valuesRef: string
  /** Categories range shared across series, e.g. Data!$A$7:$A$18 */
  catsRef: string
}

export type MeteoNativeChartSpec = {
  title: string
  kind: 'line' | 'bar'
  series: MeteoChartSeriesRef[]
  /** Anchor row on Charts sheet (0-based) */
  anchorRow: number
  sectionLabel: string
  /**
   * GeoSyntra style: color each point/bar differently so monthly/annual
   * differences are visible (Critical for Cumulative Annual).
   */
  varyColors?: boolean
  /** Legend position — Cumulative Annual uses right like the reference. */
  legendPos?: 'b' | 'r' | 't' | 'l'
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function seriesTxXml(ser: MeteoChartSeriesRef): string {
  if (ser.nameRef) {
    return `<c:tx><c:strRef><c:f>${escXml(ser.nameRef)}</c:f></c:strRef></c:tx>`
  }
  return `<c:tx><c:v>${escXml(ser.name || 'Series')}</c:v></c:tx>`
}

function buildChartXml(spec: MeteoNativeChartSpec, chartIndex: number): string {
  const axCat = 10 + chartIndex * 2
  const axVal = 100 + chartIndex * 2
  // Match GeoSyntra: varyColors=1 colors each bar/point so differences stand out.
  const vary = spec.varyColors !== false ? '1' : '0'
  const legendPos = spec.legendPos ?? (spec.series.length === 1 && vary === '1' ? 'r' : 'b')
  const serXml = spec.series
    .map((ser, i) => {
      const marker =
        spec.kind === 'line'
          ? `<c:marker><c:symbol val="circle"/><c:size val="7"/></c:marker>`
          : ''
      return `<c:ser>
  <c:idx val="${i}"/>
  <c:order val="${i}"/>
  ${seriesTxXml(ser)}
  ${marker}
  <c:cat><c:strRef><c:f>${escXml(ser.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${escXml(ser.valuesRef)}</c:f></c:numRef></c:val>
  ${spec.kind === 'line' ? '<c:smooth val="0"/>' : ''}
</c:ser>`
    })
    .join('')

  const plot =
    spec.kind === 'bar'
      ? `<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${vary}"/>
  ${serXml}
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:barChart>`
      : `<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${vary}"/>
  ${serXml}
  <c:marker val="1"/>
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:lineChart>`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:style val="2"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${escXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${plot}
      <c:catAx>
        <c:axId val="${axCat}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${axVal}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="1"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="${axVal}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${axCat}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${legendPos}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`
}

function buildDrawingXml(specs: MeteoNativeChartSpec[]): string {
  const anchors = specs
    .map((spec, i) => {
      const id = i + 2
      const rid = i + 1
      return `<xdr:oneCellAnchor>
  <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.anchorRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${id}" name="Chart ${i + 1}"/>
      <xdr:cNvGraphicFramePr/>
    </xdr:nvGraphicFramePr>
    <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${rid}"/>
      </a:graphicData>
    </a:graphic>
  </xdr:graphicFrame>
  <xdr:clientData/>
</xdr:oneCellAnchor>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors}
</xdr:wsDr>`
}

function buildDrawingRels(count: number): string {
  const rels = Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

async function findChartsSheetPath(zip: JSZip): Promise<{ sheetPath: string; relsPath: string } | null> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  if (!wbXml) return null
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!relsXml) return null

  const sheetMatches = [...wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
  const chartsSheet = sheetMatches.find(m => m[1] === 'Charts')
  if (!chartsSheet) return null
  const rid = chartsSheet[2]
  const target = relsXml.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
  if (!target) return null
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  const sheetFile = sheetPath.split('/').pop()!
  const relsPath = `xl/worksheets/_rels/${sheetFile}.rels`
  return { sheetPath, relsPath }
}

function ensureWorksheetDrawingRel(sheetXml: string, drawingRid: string): string {
  if (sheetXml.includes('drawing')) {
    return sheetXml.replace(
      /<drawing[^/]*\/>/,
      `<drawing r:id="${drawingRid}"/>`,
    )
  }
  if (sheetXml.includes('</worksheet>')) {
    return sheetXml.replace('</worksheet>', `<drawing r:id="${drawingRid}"/></worksheet>`)
  }
  return sheetXml
}

function updateSheetRels(existing: string | null, drawingRid: string): string {
  if (!existing) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
  }
  if (existing.includes('/drawing"')) {
    return existing.replace(
      /Target="[^"]*drawings\/[^"]*"/,
      'Target="../drawings/drawing1.xml"',
    )
  }
  return existing.replace(
    '</Relationships>',
    `<Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  )
}

function updateContentTypes(ct: string, chartCount: number): string {
  let out = ct
  if (!out.includes('/drawing+xml"')) {
    out = out.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
    )
  }
  for (let i = 1; i <= chartCount; i++) {
    const part = `/xl/charts/chart${i}.xml`
    if (!out.includes(`PartName="${part}"`)) {
      out = out.replace(
        '</Types>',
        `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`,
      )
    }
  }
  return out
}

/**
 * Append native editable Excel charts into the Charts sheet of an ExcelJS-produced workbook.
 */
export async function injectNativeMeteoCharts(
  xlsxBuffer: ArrayBuffer | Uint8Array | Buffer,
  specs: MeteoNativeChartSpec[],
): Promise<Uint8Array> {
  if (!specs.length) {
    return xlsxBuffer instanceof Uint8Array ? xlsxBuffer : new Uint8Array(xlsxBuffer as ArrayBuffer)
  }

  const zip = await JSZip.loadAsync(xlsxBuffer)
  const located = await findChartsSheetPath(zip)
  if (!located) {
    throw new Error('Charts sheet not found in workbook package')
  }

  for (let i = 0; i < specs.length; i++) {
    zip.file(`xl/charts/chart${i + 1}.xml`, buildChartXml(specs[i], i))
  }
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml(specs))
  zip.file('xl/drawings/_rels/drawing1.xml.rels', buildDrawingRels(specs.length))

  const drawingRid = 'rIdDrawing1'
  const sheetXml = await zip.file(located.sheetPath)!.async('string')
  zip.file(located.sheetPath, ensureWorksheetDrawingRel(sheetXml, drawingRid))

  const existingRels = zip.file(located.relsPath)
    ? await zip.file(located.relsPath)!.async('string')
    : null
  zip.file(located.relsPath, updateSheetRels(existingRels, drawingRid))

  const ct = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', updateContentTypes(ct, specs.length))

  const out = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return out
}
