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
  /** Numeric X values for true scatter charts (overrides catsRef for X). */
  xValuesRef?: string
}

export type MeteoNativeChartSpec = {
  title: string
  kind: 'line' | 'bar' | 'scatter' | 'area' | 'combo' | 'pie' | 'doughnut'
  series: MeteoChartSeriesRef[]
  /** For combo: line series indices (rest are bars) */
  lineSeriesIndexes?: number[]
  /** Anchor row on Charts sheet (0-based) */
  anchorRow: number
  /** Anchor column on Charts sheet (0-based). Defaults to column A. */
  anchorCol?: number
  sectionLabel: string
  varyColors?: boolean
  legendPos?: 'b' | 'r' | 't' | 'l'
  /** Worksheet the chart is anchored to. Defaults to the injector's chartsSheetName. */
  targetSheet?: string
  /** Bar direction: col = vertical columns, bar = horizontal bars. */
  barDir?: 'col' | 'bar'
  /** Bar grouping. */
  grouping?: 'clustered' | 'stacked' | 'percentStacked'
  /** Smooth line curves (line / combo line series). */
  smooth?: boolean
  /** Doughnut hole size 1–90 (default 50). */
  holeSize?: number
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
  const axVal2 = 200 + chartIndex * 2
  const vary = spec.varyColors !== false ? '1' : '0'
  const legendPos = spec.legendPos ?? (spec.series.length === 1 && vary === '1' ? 'r' : 'b')
  const kind = spec.kind
  const barDir = spec.barDir ?? 'col'
  const grouping = spec.grouping ?? 'clustered'

  const serParts = spec.series.map((ser, i) => {
    const marker =
      kind === 'scatter' || kind === 'line' || (kind === 'combo' && spec.lineSeriesIndexes?.includes(i))
        ? `<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>`
        : ''
    return { ser, i, marker }
  })

  const buildSer = (ser: MeteoChartSeriesRef, i: number, marker: string) => {
    if (kind === 'scatter' && ser.xValuesRef) {
      return `<c:ser>
  <c:idx val="${i}"/>
  <c:order val="${i}"/>
  ${seriesTxXml(ser)}
  ${marker}
  <c:xVal><c:numRef><c:f>${escXml(ser.xValuesRef)}</c:f></c:numRef></c:xVal>
  <c:yVal><c:numRef><c:f>${escXml(ser.valuesRef)}</c:f></c:numRef></c:yVal>
</c:ser>`
    }
    return `<c:ser>
  <c:idx val="${i}"/>
  <c:order val="${i}"/>
  ${seriesTxXml(ser)}
  ${marker}
  <c:cat><c:strRef><c:f>${escXml(ser.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${escXml(ser.valuesRef)}</c:f></c:numRef></c:val>
  ${kind === 'line' || kind === 'area' || (kind === 'combo' && spec.lineSeriesIndexes?.includes(i)) ? `<c:smooth val="${spec.smooth ? '1' : '0'}"/>` : ''}
</c:ser>`
  }

  let plot = ''
  if (kind === 'scatter') {
    plot = `<c:scatterChart>
  <c:scatterStyle val="marker"/>
  <c:varyColors val="0"/>
  ${serParts.map(p => buildSer(p.ser, p.i, p.marker)).join('')}
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:scatterChart>`
  } else if (kind === 'combo') {
    const lineIdx = new Set(spec.lineSeriesIndexes ?? [spec.series.length - 1])
    const barSers = serParts.filter(p => !lineIdx.has(p.i))
    const lineSers = serParts.filter(p => lineIdx.has(p.i))
    plot = `<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${vary}"/>
  ${barSers.map(p => buildSer(p.ser, p.i, '')).join('')}
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${lineSers.map(p => buildSer(p.ser, p.i, p.marker)).join('')}
  <c:marker val="1"/>
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal2}"/>
</c:lineChart>`
  } else if (kind === 'pie' || kind === 'doughnut') {
    const hole =
      kind === 'doughnut'
        ? `<c:holeSize val="${Math.max(1, Math.min(90, spec.holeSize ?? 50))}"/>`
        : ''
    plot = `<c:${kind}Chart>
  <c:varyColors val="1"/>
  ${serParts.map(p => buildSer(p.ser, p.i, '')).join('')}
  <c:firstSliceAng val="0"/>
  ${hole}
</c:${kind}Chart>`
  } else if (kind === 'bar') {
    plot = `<c:barChart>
  <c:barDir val="${barDir}"/>
  <c:grouping val="${grouping}"/>
  <c:varyColors val="${vary}"/>
  ${serParts.map(p => buildSer(p.ser, p.i, '')).join('')}
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:barChart>`
  } else if (kind === 'area') {
    plot = `<c:areaChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${vary}"/>
  ${serParts.map(p => buildSer(p.ser, p.i, '')).join('')}
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:areaChart>`
  } else {
    plot = `<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${vary}"/>
  ${serParts.map(p => buildSer(p.ser, p.i, p.marker)).join('')}
  <c:marker val="1"/>
  <c:axId val="${axCat}"/>
  <c:axId val="${axVal}"/>
</c:lineChart>`
  }

  const valAxes =
    kind === 'combo'
      ? `<c:valAx>
        <c:axId val="${axVal}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${axCat}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${axVal2}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="r"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${axCat}"/>
        <c:crosses val="max"/>
      </c:valAx>`
      : `<c:valAx>
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
      </c:valAx>`

  const catOrValAx =
    kind === 'pie' || kind === 'doughnut'
      ? ''
      : kind === 'scatter'
      ? `<c:valAx>
        <c:axId val="${axCat}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${axVal}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${axVal}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:crossAx val="${axCat}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`
      : `<c:catAx>
        <c:axId val="${axCat}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="${barDir === 'bar' ? 'l' : 'b'}"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${axVal}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
      </c:catAx>
      ${valAxes}`

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
      ${catOrValAx}
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

/** One chart placed on a drawing, carrying its global chart file number (1-based). */
type ChartEntry = { spec: MeteoNativeChartSpec; chartNumber: number }

function buildDrawingXml(entries: ChartEntry[]): string {
  const anchors = entries
    .map((entry, localIdx) => {
      const { spec } = entry
      const id = localIdx + 2
      const rid = localIdx + 1
      return `<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${spec.anchorCol ?? 0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.anchorRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${id}" name="Chart ${entry.chartNumber}"/>
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

function buildDrawingRels(entries: ChartEntry[]): string {
  const rels = entries
    .map((entry, localIdx) => {
      const rid = localIdx + 1
      return `<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${entry.chartNumber}.xml"/>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

async function findChartsSheetPath(
  zip: JSZip,
  sheetName = 'Charts',
): Promise<{ sheetPath: string; relsPath: string } | null> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  if (!wbXml) return null
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!relsXml) return null

  const sheetMatches = [...wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
  const chartsSheet = sheetMatches.find(m => m[1] === sheetName)
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
  // Keep existing drawing refs (Map Snapshots image atlases). Chart injection must
  // only attach drawings to sheets that do not already have one.
  if (/<drawing\b/.test(sheetXml)) return sheetXml
  if (sheetXml.includes('</worksheet>')) {
    return sheetXml.replace('</worksheet>', `<drawing r:id="${drawingRid}"/></worksheet>`)
  }
  return sheetXml
}

function updateSheetRels(existing: string | null, drawingRid: string, drawingFile: string): string {
  const target = `../drawings/${drawingFile}`
  if (!existing) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${target}"/>
</Relationships>`
  }
  // Never rewrite an existing drawing Target — that stole Map Snapshots image drawings.
  if (existing.includes(`Id="${drawingRid}"`)) {
    return existing.replace(
      new RegExp(`(<Relationship[^>]*Id="${drawingRid}"[^>]*Target=")[^"]*(")`),
      `$1${target}$2`,
    )
  }
  return existing.replace(
    '</Relationships>',
    `<Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${target}"/>
</Relationships>`,
  )
}

function updateContentTypes(ct: string, chartCount: number, drawingFiles: string[]): string {
  let out = ct
  for (const drawingFile of drawingFiles) {
    const part = `/xl/drawings/${drawingFile}`
    if (!out.includes(`PartName="${part}"`)) {
      out = out.replace(
        '</Types>',
        `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
      )
    }
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

/** Next drawingN.xml that does not overwrite ExcelJS image drawings (e.g. Map Snapshots). */
function allocateDrawingFile(zip: JSZip): string {
  let n = 1
  while (zip.file(`xl/drawings/drawing${n}.xml`)) n += 1
  return `drawing${n}.xml`
}

/**
 * Append native editable Excel charts into the Charts sheet of an ExcelJS-produced workbook.
 */
export async function injectNativeMeteoCharts(
  xlsxBuffer: ArrayBuffer | Uint8Array | Buffer,
  specs: MeteoNativeChartSpec[],
  chartsSheetName = 'Charts',
): Promise<Uint8Array> {
  if (!specs.length) {
    return xlsxBuffer instanceof Uint8Array ? xlsxBuffer : new Uint8Array(xlsxBuffer as ArrayBuffer)
  }

  const zip = await JSZip.loadAsync(xlsxBuffer)

  // All chart parts use a single global numbering (chart1.xml … chartN.xml).
  for (let i = 0; i < specs.length; i++) {
    zip.file(`xl/charts/chart${i + 1}.xml`, buildChartXml(specs[i], i))
  }

  // Group specs by the worksheet they anchor to (falling back to the default sheet),
  // preserving encounter order so each target sheet gets its own drawing.
  const groups = new Map<string, ChartEntry[]>()
  specs.forEach((spec, i) => {
    const sheet = spec.targetSheet || chartsSheetName
    const arr = groups.get(sheet) ?? []
    arr.push({ spec, chartNumber: i + 1 })
    groups.set(sheet, arr)
  })

  const allocatedDrawings: string[] = []
  let drawingSeq = 0
  for (const [sheetName, entries] of groups) {
    const located = await findChartsSheetPath(zip, sheetName)
    if (!located) {
      throw new Error(`Charts sheet "${sheetName}" not found in workbook package`)
    }
    drawingSeq += 1
    // Never clobber ExcelJS image drawings (Map Snapshots uses drawing1.xml, …).
    const drawingFile = allocateDrawingFile(zip)
    allocatedDrawings.push(drawingFile)
    zip.file(`xl/drawings/${drawingFile}`, buildDrawingXml(entries))
    zip.file(`xl/drawings/_rels/${drawingFile}.rels`, buildDrawingRels(entries))

    const drawingRid = `rIdDrawing${drawingSeq}`
    const sheetXml = await zip.file(located.sheetPath)!.async('string')
    zip.file(located.sheetPath, ensureWorksheetDrawingRel(sheetXml, drawingRid))

    const existingRels = zip.file(located.relsPath)
      ? await zip.file(located.relsPath)!.async('string')
      : null
    zip.file(located.relsPath, updateSheetRels(existingRels, drawingRid, drawingFile))
  }

  const ct = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', updateContentTypes(ct, specs.length, allocatedDrawings))

  const out = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return out
}
