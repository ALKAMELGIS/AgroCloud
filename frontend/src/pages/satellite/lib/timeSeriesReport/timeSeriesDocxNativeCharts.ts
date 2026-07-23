/**
 * Native editable Word charts (OOXML ChartML with embedded literal data).
 * Opens in Word as real Office charts — same edit model as charts copied from Excel.
 */

export type DocxNativeChartKind = 'line' | 'bar' | 'combo' | 'pie'

export type DocxNativeChartSeries = {
  name: string
  values: Array<number | null>
  color?: string
  /** For combo: draw as column bars (default is line). */
  asBar?: boolean
  /** Plot on secondary value axis (right). */
  secondaryAxis?: boolean
}

export type DocxNativeChartSpec = {
  rId: string
  fileStem: string
  title: string
  yAxisLabel: string
  yAxisLabelSecondary?: string
  categories: string[]
  series: DocxNativeChartSeries[]
  kind?: DocxNativeChartKind
  /** Number format for primary Y axis (Excel-style). */
  yNumFmt?: string
  yNumFmtSecondary?: string
  /** Optional per-slice colours for pie charts (hex without #). */
  sliceColors?: string[]
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function numLit(values: Array<number | null>): string {
  const pts = values
    .map((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        return `<c:pt idx="${i}"><c:v></c:v></c:pt>`
      }
      return `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`
    })
    .join('')
  return `<c:numLit><c:ptCount val="${values.length}"/>${pts}</c:numLit>`
}

function strLit(cats: string[]): string {
  const pts = cats.map((c, i) => `<c:pt idx="${i}"><c:v>${escXml(c)}</c:v></c:pt>`).join('')
  return `<c:strLit><c:ptCount val="${cats.length}"/>${pts}</c:strLit>`
}

const SERIES_COLORS = ['047857', '2563EB', 'EA580C', '0D9488', '7C3AED', 'DC2626', 'CA8A04']

function seriesColor(ser: DocxNativeChartSeries, i: number): string {
  return (ser.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!).replace('#', '').toUpperCase()
}

function buildLineSerXml(
  ser: DocxNativeChartSeries,
  i: number,
  cats: string,
  axOrder: number,
): string {
  const color = seriesColor(ser, i)
  return `<c:ser>
  <c:idx val="${i}"/>
  <c:order val="${axOrder}"/>
  <c:tx><c:v>${escXml(ser.name)}</c:v></c:tx>
  <c:spPr><a:ln w="22000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstDash val="solid"/></a:ln></c:spPr>
  <c:marker>
    <c:symbol val="circle"/>
    <c:size val="7"/>
    <c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="8000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>
  </c:marker>
  <c:cat>${cats}</c:cat>
  <c:val>${numLit(ser.values)}</c:val>
  <c:smooth val="0"/>
</c:ser>`
}

function buildBarSerXml(
  ser: DocxNativeChartSeries,
  i: number,
  cats: string,
  axOrder: number,
): string {
  const color = seriesColor(ser, i)
  return `<c:ser>
  <c:idx val="${i}"/>
  <c:order val="${axOrder}"/>
  <c:tx><c:v>${escXml(ser.name)}</c:v></c:tx>
  <c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="4000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>
  <c:cat>${cats}</c:cat>
  <c:val>${numLit(ser.values)}</c:val>
</c:ser>`
}

function valAxXml(opts: {
  axId: number
  crossAx: number
  pos: 'l' | 'r'
  title: string
  numFmt: string
  crosses?: string
}): string {
  return `<c:valAx>
  <c:axId val="${opts.axId}"/>
  <c:scaling><c:orientation val="minMax"/></c:scaling>
  <c:delete val="0"/>
  <c:axPos val="${opts.pos}"/>
  <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:r><a:rPr lang="en-US" sz="900" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:rPr><a:t>${escXml(opts.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>
  ${opts.pos === 'l' ? '<c:majorGridlines><c:spPr><a:ln w="4000"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : ''}
  <c:numFmt formatCode="${escXml(opts.numFmt)}" sourceLinked="0"/>
  <c:majorTickMark val="out"/>
  <c:minorTickMark val="none"/>
  <c:tickLblPos val="nextTo"/>
  <c:crossAx val="${opts.crossAx}"/>
  <c:crosses val="${opts.crosses ?? 'autoZero'}"/>
  <c:crossBetween val="between"/>
</c:valAx>`
}

/**
 * Build ChartML for a polished Excel-style chart (line / bar / combo / pie + optional dual axis).
 */
export function buildDocxChartXml(spec: DocxNativeChartSpec): string {
  const kind: DocxNativeChartKind = spec.kind ?? 'line'
  const cats = strLit(spec.categories)

  if (kind === 'pie') {
    const ser = spec.series[0]
    const values = ser?.values ?? []
    const pieColors = [
      ...(spec.sliceColors ?? []),
      '047857',
      '2563EB',
      'EA580C',
      '0D9488',
      '7C3AED',
      'DC2626',
      'CA8A04',
      '0891B2',
      '4F46E5',
      'B45309',
    ]
    const dPt = values
      .map((_, i) => {
        const color = pieColors[i % pieColors.length]!
        return `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`
      })
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${escXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>${escXml(ser?.name ?? 'Share')}</c:v></c:tx>
          ${dPt}
          <c:cat>${cats}</c:cat>
          <c:val>${numLit(values)}</c:val>
          <c:dLbls>
            <c:showLegendKey val="0"/>
            <c:showVal val="0"/>
            <c:showCatName val="1"/>
            <c:showPercent val="1"/>
            <c:showSerName val="0"/>
            <c:showBubbleSize val="0"/>
            <c:showLeaderLines val="1"/>
          </c:dLbls>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`
  }

  const hasSecondary = spec.series.some(s => s.secondaryAxis)

  const plotParts: string[] = []
  let order = 0

  const emitBar = (list: DocxNativeChartSeries[], axVal: number) => {
    if (!list.length) return
    const sers = list
      .map(ser => {
        const globalIdx = spec.series.indexOf(ser)
        return buildBarSerXml(ser, globalIdx, cats, order++)
      })
      .join('')
    plotParts.push(`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="0"/>
  <c:gapWidth val="80"/>
  ${sers}
  <c:axId val="1"/>
  <c:axId val="${axVal}"/>
</c:barChart>`)
  }

  const emitLine = (list: DocxNativeChartSeries[], axVal: number) => {
    if (!list.length) return
    const sers = list
      .map(ser => {
        const globalIdx = spec.series.indexOf(ser)
        return buildLineSerXml(ser, globalIdx, cats, order++)
      })
      .join('')
    plotParts.push(`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${sers}
  <c:marker val="1"/>
  <c:axId val="1"/>
  <c:axId val="${axVal}"/>
</c:lineChart>`)
  }

  if (kind === 'bar') {
    emitBar(spec.series, 2)
  } else if (kind === 'combo') {
    const bars = spec.series.filter(s => s.asBar)
    const linesPri = spec.series.filter(s => !s.asBar && !s.secondaryAxis)
    const linesSec = spec.series.filter(s => !s.asBar && s.secondaryAxis)
    emitBar(bars, 2)
    emitLine(linesPri, 2)
    emitLine(linesSec, 3)
  } else if (hasSecondary) {
    emitLine(
      spec.series.filter(s => !s.secondaryAxis),
      2,
    )
    emitLine(
      spec.series.filter(s => s.secondaryAxis),
      3,
    )
  } else {
    emitLine(spec.series, 2)
  }

  const useSecondary =
    hasSecondary || (kind === 'combo' && spec.series.some(s => s.secondaryAxis && !s.asBar))

  const axes = `
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="900" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:rPr><a:t>Period</a:t></a:r></a:p></c:rich></c:tx></c:title>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      ${valAxXml({
        axId: 2,
        crossAx: 1,
        pos: 'l',
        title: spec.yAxisLabel,
        numFmt: spec.yNumFmt ?? '0.00',
      })}
      ${
        useSecondary
          ? valAxXml({
              axId: 3,
              crossAx: 1,
              pos: 'r',
              title: spec.yAxisLabelSecondary ?? '',
              numFmt: spec.yNumFmtSecondary ?? '0.0',
              crosses: 'max',
            })
          : ''
      }`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${escXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${plotParts.join('\n')}
      ${axes}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`
}

/** @deprecated Use {@link buildDocxChartXml} */
export function buildDocxLineChartXml(spec: DocxNativeChartSpec): string {
  return buildDocxChartXml({ ...spec, kind: spec.kind ?? 'line' })
}

export function buildEmptyChartRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
}

/** One native line chart per selected index (under that index’s maps). */
export function buildPerLayerNativeChartSpecs(input: {
  labels: string[]
  displayLabels: string[]
  series: Array<{ layerId: string; values: Array<number | null> }>
  startIndex?: number
}): DocxNativeChartSpec[] {
  const categories = (input.displayLabels.length ? input.displayLabels : input.labels).map(String)
  if (!categories.length) return []

  const out: DocxNativeChartSpec[] = []
  let n = input.startIndex ?? 0
  for (const s of input.series) {
    const hasData = s.values.some(v => v != null && Number.isFinite(v))
    if (!hasData) continue
    n += 1
    const id = s.layerId.toUpperCase()
    out.push({
      rId: `rIdChart${n}`,
      fileStem: `chart${n}`,
      title: `${id} Trend`,
      yAxisLabel: id,
      yNumFmt: '0.0000',
      categories,
      kind: 'line',
      series: [{ name: id, values: s.values, color: SERIES_COLORS[(n - 1) % SERIES_COLORS.length] }],
    })
  }
  return out
}

export type WeatherNativeChartInput = {
  points: Array<{
    displayLabel: string
    temperatureC: number | null
    humidityPct: number | null
    rainfallMm: number | null
    windSpeedMs: number | null
  }>
  aggregationLabel: string
  startIndex?: number
  /** Optional enriched analytics (preferred). */
  daily?: Array<{
    date: string
    tempMeanC: number | null
    tempMinC: number | null
    tempMaxC: number | null
    humidityPct: number | null
    rainfallMm: number | null
  }>
  monthly?: Array<{
    label: string
    tempMeanC: number | null
    tempMinC: number | null
    tempMaxC: number | null
    humidityPct: number | null
    rainfallMm: number | null
    rainfallSharePct: number | null
    cumulativeRainfallMm: number | null
  }>
  yearly?: Array<{
    label: string
    tempMeanC: number | null
    tempMinC: number | null
    tempMaxC: number | null
    humidityPct: number | null
    rainfallMm: number | null
  }>
  /** Period-aligned index values for professional weather↔vegetation comparison. */
  indexCompare?: {
    categories: string[]
    tempMean: Array<number | null>
    tempMin: Array<number | null>
    tempMax: Array<number | null>
    rainfall: Array<number | null>
    humidity: Array<number | null>
    ndvi: Array<number | null>
    ndmi: Array<number | null>
    ndwi: Array<number | null>
    savi: Array<number | null>
  }
}

function nextChartId(n: { v: number }): number {
  n.v += 1
  return n.v
}

function tempExtremesSeries(rows: Array<{
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
}>): DocxNativeChartSeries[] {
  return [
    { name: 'Temp Max (°C)', values: rows.map(r => r.tempMaxC), color: 'DC2626' },
    { name: 'Temp Mean (°C)', values: rows.map(r => r.tempMeanC), color: 'EA580C' },
    { name: 'Temp Min (°C)', values: rows.map(r => r.tempMinC), color: '2563EB' },
  ]
}

/**
 * Professional Excel-style weather + climate suite for the Word Intelligence Report.
 */
export function buildWeatherNativeChartSpecs(input: WeatherNativeChartInput): DocxNativeChartSpec[] {
  const counter = { v: input.startIndex ?? 0 }
  const out: DocxNativeChartSpec[] = []
  const push = (spec: Omit<DocxNativeChartSpec, 'rId' | 'fileStem'>) => {
    const id = nextChartId(counter)
    out.push({ ...spec, rId: `rIdChart${id}`, fileStem: `chart${id}` })
  }

  const daily = input.daily ?? []
  const monthly = input.monthly ?? []
  const yearly = input.yearly ?? []

  if (daily.length) {
    push({
      title: 'Temperature Max · Mean · Min — Daily',
      yAxisLabel: 'Temperature (°C)',
      yNumFmt: '0.0',
      categories: daily.map(d => d.date),
      kind: 'line',
      series: tempExtremesSeries(daily),
    })
  }

  if (monthly.length) {
    push({
      title: 'Temperature Max · Mean · Min — Monthly',
      yAxisLabel: 'Temperature (°C)',
      yNumFmt: '0.0',
      categories: monthly.map(m => m.label),
      kind: 'line',
      series: tempExtremesSeries(monthly),
    })
  }

  if (yearly.length) {
    push({
      title: 'Temperature Max · Mean · Min — Yearly',
      yAxisLabel: 'Temperature (°C)',
      yNumFmt: '0.0',
      categories: yearly.map(y => y.label),
      kind: 'line',
      series: tempExtremesSeries(yearly),
    })
  }

  if (monthly.length) {
    push({
      title: 'Cumulative Rainfall — Monthly',
      yAxisLabel: 'Cumulative rainfall (mm)',
      yNumFmt: '0.0',
      categories: monthly.map(m => m.label),
      kind: 'bar',
      series: [
        {
          name: 'Cumulative Rainfall (mm)',
          values: monthly.map(m => m.cumulativeRainfallMm),
          color: '2563EB',
          asBar: true,
        },
      ],
    })
    push({
      title: 'Monthly Rainfall Total',
      yAxisLabel: 'Rainfall (mm)',
      yNumFmt: '0.0',
      categories: monthly.map(m => m.label),
      kind: 'bar',
      series: [
        {
          name: 'Rainfall (mm)',
          values: monthly.map(m => m.rainfallMm),
          color: '3B82F6',
          asBar: true,
        },
      ],
    })
    const pieCats = monthly.filter(m => (m.rainfallMm ?? 0) > 0)
    if (pieCats.length >= 2) {
      push({
        title: 'Monthly Rainfall Share (%)',
        yAxisLabel: 'Share',
        categories: pieCats.map(m => m.label),
        kind: 'pie',
        series: [
          {
            name: 'Rainfall share',
            values: pieCats.map(m => m.rainfallSharePct ?? m.rainfallMm),
          },
        ],
      })
    }
  }

  if (daily.length) {
    push({
      title: 'Humidity — Daily Mean',
      yAxisLabel: 'Humidity (%)',
      yNumFmt: '0',
      categories: daily.map(d => d.date),
      kind: 'line',
      series: [{ name: 'Humidity (%)', values: daily.map(d => d.humidityPct), color: '0D9488' }],
    })
  } else if (monthly.length) {
    push({
      title: 'Humidity — Monthly Mean',
      yAxisLabel: 'Humidity (%)',
      yNumFmt: '0',
      categories: monthly.map(m => m.label),
      kind: 'line',
      series: [{ name: 'Humidity (%)', values: monthly.map(m => m.humidityPct), color: '0D9488' }],
    })
  }

  const cmp = input.indexCompare
  if (cmp && cmp.categories.length) {
    const indexSeries: DocxNativeChartSeries[] = []
    const addIdx = (name: string, values: Array<number | null>, color: string) => {
      if (values.some(v => v != null && Number.isFinite(v))) {
        indexSeries.push({ name, values, color, secondaryAxis: true })
      }
    }
    addIdx('NDVI', cmp.ndvi, '047857')
    addIdx('NDMI', cmp.ndmi, '2563EB')
    addIdx('NDWI', cmp.ndwi, '0D9488')
    addIdx('SAVI', cmp.savi, 'CA8A04')

    if (cmp.tempMean.some(v => v != null) || cmp.tempMin.some(v => v != null) || cmp.tempMax.some(v => v != null)) {
      push({
        title: 'Temperature Max·Mean·Min vs NDVI · NDMI · NDWI · SAVI',
        yAxisLabel: 'Temperature (°C)',
        yAxisLabelSecondary: 'Index value',
        yNumFmt: '0.0',
        yNumFmtSecondary: '0.000',
        categories: cmp.categories,
        kind: 'line',
        series: [
          { name: 'Temp Max (°C)', values: cmp.tempMax, color: 'DC2626' },
          { name: 'Temp Mean (°C)', values: cmp.tempMean, color: 'EA580C' },
          { name: 'Temp Min (°C)', values: cmp.tempMin, color: '2563EB' },
          ...indexSeries,
        ],
      })
    }

    if (cmp.rainfall.some(v => v != null) && indexSeries.length) {
      push({
        title: 'Rainfall vs NDVI · NDMI · NDWI · SAVI',
        yAxisLabel: 'Rainfall (mm)',
        yAxisLabelSecondary: 'Index value',
        yNumFmt: '0.0',
        yNumFmtSecondary: '0.000',
        categories: cmp.categories,
        kind: 'combo',
        series: [
          { name: 'Rainfall (mm)', values: cmp.rainfall, color: '3B82F6', asBar: true },
          ...indexSeries.map(s => ({ ...s, secondaryAxis: true as const })),
        ],
      })
    }

    if (cmp.humidity.some(v => v != null) && indexSeries.length) {
      push({
        title: 'Humidity vs NDVI · NDMI · NDWI · SAVI',
        yAxisLabel: 'Humidity (%)',
        yAxisLabelSecondary: 'Index value',
        yNumFmt: '0',
        yNumFmtSecondary: '0.000',
        categories: cmp.categories,
        kind: 'line',
        series: [
          { name: 'Humidity (%)', values: cmp.humidity, color: '0D9488' },
          ...indexSeries,
        ],
      })
    }
  }

  // Fallback for older callers with only period points
  if (!out.length && input.points.length) {
    const pts = input.points
    const categories = pts.map(p => p.displayLabel)
    const agg = input.aggregationLabel || 'Period'
    push({
      title: `Temperature & Humidity — ${agg}`,
      yAxisLabel: 'Temperature (°C)',
      yAxisLabelSecondary: 'Humidity (%)',
      yNumFmt: '0.0',
      yNumFmtSecondary: '0',
      categories,
      kind: 'line',
      series: [
        { name: 'Temperature (°C)', values: pts.map(p => p.temperatureC), color: 'EA580C' },
        {
          name: 'Humidity (%)',
          values: pts.map(p => p.humidityPct),
          color: '0D9488',
          secondaryAxis: true,
        },
      ],
    })
    push({
      title: `Rainfall & Wind — ${agg}`,
      yAxisLabel: 'Rainfall (mm)',
      yAxisLabelSecondary: 'Wind (m/s)',
      yNumFmt: '0.0',
      yNumFmtSecondary: '0.00',
      categories,
      kind: 'combo',
      series: [
        { name: 'Rainfall (mm)', values: pts.map(p => p.rainfallMm), color: '3B82F6', asBar: true },
        {
          name: 'Wind (m/s)',
          values: pts.map(p => p.windSpeedMs),
          color: '047857',
          secondaryAxis: true,
        },
      ],
    })
  }

  return out
}

