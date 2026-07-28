/**
 * Native editable Word charts (OOXML ChartML with embedded literal data).
 * Opens in Word as real Office charts — polished report layout (not a raw Excel paste).
 */

export type DocxNativeChartKind = 'line' | 'bar' | 'combo' | 'pie' | 'scatter'

export type DocxNativeChartSeries = {
  name: string
  values: Array<number | null>
  color?: string
  /** For combo: draw as column bars (default is line). */
  asBar?: boolean
  /** Plot on secondary value axis (right). */
  secondaryAxis?: boolean
}

export type DocxNativeScatterSeries = {
  name: string
  points: Array<{ x: number; y: number }>
  color?: string
  /** Draw connecting line (linear fit). */
  showLine?: boolean
  /** Hide markers (fit line only). */
  hideMarkers?: boolean
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
  /** Bar direction: `col` (default) or `bar` (horizontal). */
  barDir?: 'col' | 'bar'
  /** Hide legend (useful for single-series bars). */
  hideLegend?: boolean
  /** Scatter XY series (kind=scatter). */
  scatterSeries?: DocxNativeScatterSeries[]
  xAxisLabel?: string
  xNumFmt?: string
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

/**
 * Analysis-based palette for native Word charts (ArcGIS-style index semantics).
 * NDVI/SAVI/EVI = green · NDWI = blue · NDMI = moisture teal · LST/ET = thermal · Risk = amber/red.
 */
export function resolveIndexChartColor(layerId: string): string {
  const u = layerId.trim().toUpperCase()
  if (
    u === 'NDVI' ||
    u === 'SAVI' ||
    u === 'EVI' ||
    u === 'GNDVI' ||
    u === 'NDRE' ||
    u.includes('VEG')
  ) {
    return '047857'
  }
  if (u === 'NDWI' || u === 'MNDWI' || u.includes('WATER') || u === 'PRECIP' || u.includes('RAIN')) {
    return '2563EB'
  }
  if (u === 'NDMI' || u.includes('MOIST')) {
    return '0D9488'
  }
  if (u === 'LST' || u === 'LSTI' || u === 'ET' || u.includes('TEMP') || u.includes('THERMAL')) {
    return 'DC2626'
  }
  if (
    u.includes('STRESS') ||
    u === 'CHAS' ||
    u.includes('RISK') ||
    u.includes('ALERT') ||
    u === 'ADI' ||
    u === 'NCADI'
  ) {
    return 'CA8A04'
  }
  if (u.includes('LULC') || u.includes('CLASS')) return '334155'
  return SERIES_COLORS[Math.abs(fnvLite(u)) % SERIES_COLORS.length]!
}

function fnvLite(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

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

/** Axis title — overlay=0 so Word reserves space (avoids title×tick overlap). */
function axTitleXml(text: string, opts?: { vertical?: boolean; size?: number }): string {
  const t = text.trim()
  if (!t) return ''
  const sz = opts?.size ?? 800
  // -90° for left/right value axes so the title sits clear of tick numbers.
  const bodyPr = opts?.vertical
    ? '<a:bodyPr rot="-5400000" vert="horz" anchor="ctr"/>'
    : '<a:bodyPr anchor="ctr"/>'
  return `<c:title>
  <c:tx><c:rich>${bodyPr}<a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:rPr><a:t>${escXml(t)}</a:t></a:r></a:p></c:rich></c:tx>
  <c:overlay val="0"/>
</c:title>`
}

/** Tick label text props — compact font to reduce collisions with axis titles. */
function axTickTxPrXml(opts?: { rotateDeg?: number; size?: number }): string {
  const sz = opts?.size ?? 700
  const rot =
    opts?.rotateDeg != null && Number.isFinite(opts.rotateDeg)
      ? ` rot="${Math.round(opts.rotateDeg * 60000)}"`
      : ''
  return `<c:txPr><a:bodyPr${rot}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"/></a:pPr><a:defRPr sz="${sz}"/></a:p></c:txPr>`
}

/**
 * Reserve plot-area margins for axis titles + tick labels (ChartML edge layout 0–1).
 * Without this, Word often draws "Rainfall (mm)" / "Period" on top of tick values.
 */
function plotAreaLayoutXml(opts: {
  secondary?: boolean
  legendBottom?: boolean
  catCount?: number
}): string {
  const left = 0.18
  const right = opts.secondary ? 0.16 : 0.05
  const top = 0.02
  const manyCats = (opts.catCount ?? 0) > 8
  const bottom = (opts.legendBottom ? 0.2 : 0.16) + (manyCats ? 0.06 : 0)
  const w = Math.max(0.45, 1 - left - right)
  const h = Math.max(0.45, 1 - top - bottom)
  return `<c:layout>
  <c:manualLayout>
    <c:layoutTarget val="inner"/>
    <c:xMode val="edge"/>
    <c:yMode val="edge"/>
    <c:x val="${left.toFixed(3)}"/>
    <c:y val="${top.toFixed(3)}"/>
    <c:w val="${w.toFixed(3)}"/>
    <c:h val="${h.toFixed(3)}"/>
  </c:manualLayout>
</c:layout>`
}

function valAxXml(opts: {
  axId: number
  crossAx: number
  pos: 'l' | 'r' | 'b'
  title: string
  numFmt: string
  crosses?: string
}): string {
  const verticalTitle = opts.pos === 'l' || opts.pos === 'r'
  return `<c:valAx>
  <c:axId val="${opts.axId}"/>
  <c:scaling><c:orientation val="minMax"/></c:scaling>
  <c:delete val="0"/>
  <c:axPos val="${opts.pos}"/>
  ${axTitleXml(opts.title, { vertical: verticalTitle })}
  ${opts.pos === 'l' ? '<c:majorGridlines><c:spPr><a:ln w="4000"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : ''}
  <c:numFmt formatCode="${escXml(opts.numFmt)}" sourceLinked="0"/>
  <c:majorTickMark val="out"/>
  <c:minorTickMark val="none"/>
  <c:tickLblPos val="nextTo"/>
  ${axTickTxPrXml({ size: 700 })}
  <c:crossAx val="${opts.crossAx}"/>
  <c:crosses val="${opts.crosses ?? 'autoZero'}"/>
  <c:crossBetween val="between"/>
</c:valAx>`
}

/** Cap pie/share categories: keep top N by value and bucket the rest as Other. */
export function aggregateTopShareCategories(
  rows: Array<{ label: string; value: number }>,
  maxSlices = 8,
): { labels: string[]; values: number[] } {
  const cleaned = rows
    .filter(r => Number.isFinite(r.value) && r.value > 0)
    .map(r => ({ label: r.label, value: Number(r.value) }))
    .sort((a, b) => b.value - a.value)
  if (cleaned.length <= maxSlices) {
    return { labels: cleaned.map(r => r.label), values: cleaned.map(r => r.value) }
  }
  const top = cleaned.slice(0, maxSlices - 1)
  const other = cleaned.slice(maxSlices - 1).reduce((sum, r) => sum + r.value, 0)
  return {
    labels: [...top.map(r => r.label), 'Other'],
    values: [...top.map(r => r.value), other],
  }
}

/**
 * Build ChartML for a polished report chart (line / bar / combo / pie / scatter + optional dual axis).
 */
export function buildDocxChartXml(spec: DocxNativeChartSpec): string {
  const kind: DocxNativeChartKind = spec.kind ?? 'line'
  const cats = strLit(spec.categories)
  const legendXml = spec.hideLegend
    ? ''
    : `<c:legend>
      <c:legendPos val="${kind === 'pie' ? 'r' : 'b'}"/>
      <c:overlay val="0"/>
    </c:legend>`

  if (kind === 'scatter') {
    return buildDocxScatterChartXml(spec)
  }

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
        return `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="12000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`
      })
      .join('')
    // Percent-only labels + right legend — avoids Excel-style leader-line spaghetti.
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
      <c:layout>
        <c:manualLayout>
          <c:layoutTarget val="inner"/>
          <c:xMode val="edge"/>
          <c:yMode val="edge"/>
          <c:x val="0.02"/>
          <c:y val="0.12"/>
          <c:w val="0.62"/>
          <c:h val="0.78"/>
        </c:manualLayout>
      </c:layout>
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
            <c:showCatName val="0"/>
            <c:showPercent val="1"/>
            <c:showSerName val="0"/>
            <c:showBubbleSize val="0"/>
            <c:showLeaderLines val="0"/>
          </c:dLbls>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    ${legendXml}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`
  }

  const hasSecondary = spec.series.some(s => s.secondaryAxis)
  const barDir = spec.barDir ?? 'col'

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
  <c:barDir val="${barDir}"/>
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

  const catTitle =
    (spec.xAxisLabel && spec.xAxisLabel.trim()) ||
    (barDir === 'bar' ? 'Category' : 'Period')
  const catCount = spec.categories.length
  const rotateCats = barDir !== 'bar' && catCount > 6
  const axes = `
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="${barDir === 'bar' ? 'l' : 'b'}"/>
        ${axTitleXml(catTitle, { vertical: barDir === 'bar' })}
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${axTickTxPrXml({ size: 700, rotateDeg: rotateCats ? -35 : undefined })}
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="${rotateCats ? 160 : 140}"/>
      </c:catAx>
      ${valAxXml({
        axId: 2,
        crossAx: 1,
        pos: barDir === 'bar' ? 'b' : 'l',
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
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${escXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      ${plotAreaLayoutXml({
        secondary: useSecondary,
        legendBottom: !spec.hideLegend && kind !== 'pie',
        catCount,
      })}
      ${plotParts.join('\n')}
      ${axes}
    </c:plotArea>
    ${legendXml}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`
}

/** Native editable XY scatter (+ optional linear fit) — white report style. */
export function buildDocxScatterChartXml(spec: DocxNativeChartSpec): string {
  const series = spec.scatterSeries ?? []
  const xLabel = spec.xAxisLabel ?? 'X'
  const yLabel = spec.yAxisLabel || 'Y'
  const xFmt = spec.xNumFmt ?? '0.00'
  const yFmt = spec.yNumFmt ?? '0.00'
  const legendXml = spec.hideLegend
    ? ''
    : `<c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>`

  const serXml = series
    .map((ser, idx) => {
      const xs = ser.points.map(p => p.x)
      const ys = ser.points.map(p => p.y)
      const color = (ser.color ?? (idx === 0 ? '166534' : 'DC2626')).replace(/^#/, '')
      const marker =
        ser.hideMarkers
          ? `<c:marker><c:symbol val="none"/></c:marker>`
          : `<c:marker>
          <c:symbol val="circle"/>
          <c:size val="7"/>
          <c:spPr>
            <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
            <a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>
          </c:spPr>
        </c:marker>`
      const line = ser.showLine
        ? `<c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>`
        : `<c:spPr><a:ln w="0"><a:noFill/></a:ln></c:spPr>`
      return `<c:ser>
        <c:idx val="${idx}"/>
        <c:order val="${idx}"/>
        <c:tx><c:v>${escXml(ser.name)}</c:v></c:tx>
        ${marker}
        ${line}
        <c:xVal>${numLit(xs)}</c:xVal>
        <c:yVal>${numLit(ys)}</c:yVal>
        <c:smooth val="0"/>
      </c:ser>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${escXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      ${plotAreaLayoutXml({ legendBottom: !spec.hideLegend })}
      <c:scatterChart>
        <c:scatterStyle val="lineMarker"/>
        <c:varyColors val="0"/>
        ${serXml}
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:scatterChart>
      <c:valAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        ${axTitleXml(xLabel)}
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="${escXml(xFmt)}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${axTickTxPrXml({ size: 700 })}
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="midCat"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        ${axTitleXml(yLabel, { vertical: true })}
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="${escXml(yFmt)}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${axTickTxPrXml({ size: 700 })}
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="midCat"/>
      </c:valAx>
    </c:plotArea>
    ${legendXml}
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
      yAxisLabel: `${id} mean`,
      xAxisLabel: 'Period',
      yNumFmt: '0.0000',
      categories,
      kind: 'line',
      series: [{ name: id, values: s.values, color: resolveIndexChartColor(id) }],
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
 * Professional weather + climate suite for the Word Intelligence Report.
 * Prefers monthly aggregates over daily when both exist (fewer pages, clearer axes).
 */
export function buildWeatherNativeChartSpecs(input: WeatherNativeChartInput): DocxNativeChartSpec[] {
  const counter = { v: input.startIndex ?? 0 }
  const out: DocxNativeChartSpec[] = []
  const push = (spec: Omit<DocxNativeChartSpec, 'rId' | 'fileStem'>) => {
    const id = nextChartId(counter)
    out.push({
      xAxisLabel: 'Period',
      ...spec,
      rId: `rIdChart${id}`,
      fileStem: `chart${id}`,
    })
  }

  const daily = input.daily ?? []
  const monthly = input.monthly ?? []
  const yearly = input.yearly ?? []
  const useDailyTemp = daily.length > 0 && monthly.length === 0

  if (useDailyTemp) {
    push({
      title: 'Temperature Max · Mean · Min — Daily',
      yAxisLabel: 'Temperature (°C)',
      xAxisLabel: 'Date',
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
      xAxisLabel: 'Month',
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
      xAxisLabel: 'Year',
      yNumFmt: '0.0',
      categories: yearly.map(y => y.label),
      kind: 'line',
      series: tempExtremesSeries(yearly),
    })
  }

  if (monthly.length) {
    push({
      title: 'Monthly Rainfall Total',
      yAxisLabel: 'Rainfall (mm)',
      xAxisLabel: 'Month',
      yNumFmt: '0.0',
      categories: monthly.map(m => m.label),
      kind: 'bar',
      hideLegend: true,
      series: [
        {
          name: 'Rainfall (mm)',
          values: monthly.map(m => m.rainfallMm),
          color: '3B82F6',
          asBar: true,
        },
      ],
    })
    // Horizontal bar (top wet months) — readable for multi-year AOIs; avoid overcrowded pies.
    const shareRows = monthly
      .filter(m => (m.rainfallMm ?? 0) > 0)
      .map(m => ({
        label: m.label,
        value: Number(m.rainfallSharePct ?? m.rainfallMm ?? 0),
      }))
    if (shareRows.length >= 2) {
      const capped = aggregateTopShareCategories(shareRows, 8)
      push({
        title: 'Top Months — Rainfall Share (%)',
        yAxisLabel: 'Share (%)',
        xAxisLabel: 'Month',
        yNumFmt: '0.0',
        categories: capped.labels,
        kind: 'bar',
        barDir: 'bar',
        hideLegend: true,
        series: [
          {
            name: 'Rainfall share (%)',
            values: capped.values,
            color: '0D9488',
            asBar: true,
          },
        ],
      })
    }
  }

  // Yearly share pie stays readable (few slices) when multi-year rainfall exists.
  if (yearly.length >= 2) {
    const yearRain = yearly
      .map(y => ({ label: y.label, value: Number(y.rainfallMm ?? 0) }))
      .filter(r => r.value > 0)
    if (yearRain.length >= 2) {
      const total = yearRain.reduce((s, r) => s + r.value, 0)
      const share = aggregateTopShareCategories(
        yearRain.map(r => ({ label: r.label, value: total > 0 ? (r.value / total) * 100 : 0 })),
        6,
      )
      push({
        title: 'Annual Rainfall Share (%)',
        yAxisLabel: 'Share',
        categories: share.labels,
        kind: 'pie',
        series: [{ name: 'Annual share', values: share.values }],
      })
    }
  }

  if (monthly.length) {
    push({
      title: 'Humidity — Monthly Mean',
      yAxisLabel: 'Humidity (%)',
      xAxisLabel: 'Month',
      yNumFmt: '0',
      categories: monthly.map(m => m.label),
      kind: 'line',
      series: [{ name: 'Humidity (%)', values: monthly.map(m => m.humidityPct), color: '0D9488' }],
    })
  } else if (daily.length) {
    push({
      title: 'Humidity — Daily Mean',
      yAxisLabel: 'Humidity (%)',
      xAxisLabel: 'Date',
      yNumFmt: '0',
      categories: daily.map(d => d.date),
      kind: 'line',
      series: [{ name: 'Humidity (%)', values: daily.map(d => d.humidityPct), color: '0D9488' }],
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
    addIdx('NDVI', cmp.ndvi, resolveIndexChartColor('NDVI'))
    addIdx('NDMI', cmp.ndmi, resolveIndexChartColor('NDMI'))
    addIdx('NDWI', cmp.ndwi, resolveIndexChartColor('NDWI'))
    addIdx('SAVI', cmp.savi, resolveIndexChartColor('SAVI'))

    if (cmp.tempMean.some(v => v != null) || cmp.tempMin.some(v => v != null) || cmp.tempMax.some(v => v != null)) {
      push({
        title: 'Temperature Max·Mean·Min vs NDVI · NDMI · NDWI · SAVI',
        yAxisLabel: 'Temperature (°C)',
        yAxisLabelSecondary: 'Index value',
        xAxisLabel: 'Period',
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
        xAxisLabel: 'Period',
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
        xAxisLabel: 'Period',
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
      xAxisLabel: 'Period',
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
      xAxisLabel: 'Period',
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

export type VegetationCoverageChartPoint = {
  date: string
  periodLabel?: string
  ndviMean: number | null
  vegetationCoveragePct: number
  bareCoveragePct: number
  classes?: Array<{ tier: string; pct: number }>
}

/** Short statistical reading for the coverage timeline chart. */
export function buildVegetationCoverageChartInterpretation(
  timeline: VegetationCoverageChartPoint[],
): string {
  if (timeline.length < 2) {
    return 'Single-date coverage snapshot — compare additional acquisitions to quantify canopy expansion or decline.'
  }
  const first = timeline[0]!
  const last = timeline[timeline.length - 1]!
  const delta = last.vegetationCoveragePct - first.vegetationCoveragePct
  const abs = Math.abs(delta)
  const direction = delta > 1 ? 'increased' : delta < -1 ? 'decreased' : 'stayed broadly stable'
  const ndviBit =
    first.ndviMean != null && last.ndviMean != null
      ? ` NDVI mean moved from ${first.ndviMean.toFixed(3)} to ${last.ndviMean.toFixed(3)}.`
      : ''
  return `Vegetation coverage ${direction} across the period (${first.date} → ${last.date}): ${first.vegetationCoveragePct.toFixed(1)}% → ${last.vegetationCoveragePct.toFixed(1)}% (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp).${ndviBit}${
    abs >= 5
      ? ' This shift is material for field planning — verify irrigation, harvest timing, or bare-soil exposure.'
      : ' Variation is modest; treat as supporting evidence alongside NDVI vigor and moisture indices.'
  }`
}

/**
 * Native Office charts for Vegetation Coverage Timeline — statistical view after the table.
 */
export function buildVegetationCoverageTimelineChartSpecs(input: {
  timeline: VegetationCoverageChartPoint[]
  startIndex?: number
}): DocxNativeChartSpec[] {
  const timeline = input.timeline.filter(p => Number.isFinite(p.vegetationCoveragePct))
  if (timeline.length < 2) return []

  const counter = { v: input.startIndex ?? 0 }
  const out: DocxNativeChartSpec[] = []
  const push = (spec: Omit<DocxNativeChartSpec, 'rId' | 'fileStem'>) => {
    const id = nextChartId(counter)
    out.push({ ...spec, rId: `rIdChart${id}`, fileStem: `chart${id}` })
  }

  const categories = timeline.map(p => p.periodLabel || p.date)
  push({
    title: 'Vegetation Coverage Timeline — Statistical Chart',
    yAxisLabel: 'Coverage (%)',
    yAxisLabelSecondary: 'NDVI mean',
    xAxisLabel: 'Period',
    yNumFmt: '0.0',
    yNumFmtSecondary: '0.000',
    categories,
    kind: 'combo',
    series: [
      {
        name: 'Vegetation Coverage (%)',
        values: timeline.map(p => p.vegetationCoveragePct),
        color: '047857',
        asBar: true,
      },
      {
        name: 'Bare / Critical (%)',
        values: timeline.map(p => p.bareCoveragePct),
        color: 'B45309',
      },
      {
        name: 'NDVI Mean',
        values: timeline.map(p => p.ndviMean),
        color: '2563EB',
        secondaryAxis: true,
      },
    ],
  })

  return out
}
