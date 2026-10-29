import {
  DOCX_BRAND,
  DOCX_BRAND_SOFT,
  DOCX_INK,
  DOCX_MUTED,
  docxBodyParagraph,
  docxBulletList,
  docxInlineChart,
  docxItalicNote,
  docxPageBreak,
  docxSectionHeading,
  docxTable,
} from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxXml'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function run(text: string, opts: { bold?: boolean; italic?: boolean; color?: string; size?: number }): string {
  const rPr: string[] = []
  if (opts.bold) rPr.push('<w:b/><w:bCs/>')
  if (opts.italic) rPr.push('<w:i/><w:iCs/>')
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  return `<w:r><w:rPr>${rPr.join('')}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function centerP(inner: string, after = 80): string {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="${after}"/></w:pPr>${inner}</w:p>`
}

function metaRow(label: string, value: string): string {
  return `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${run(label.toUpperCase(), { bold: true, color: DOCX_BRAND, size: 18 })}${run('  ', { size: 18 })}${run(value, { color: DOCX_INK, size: 20 })}</w:p>`
}

export function formatWeatherReportPeriodLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
    if (!Number.isFinite(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

export function formatWeatherReportIssueDate(stampIso: string): string {
  const d = new Date(stampIso)
  if (!Number.isFinite(d.getTime())) return stampIso.slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type WeatherDocxCoverInput = {
  seriesYear: string
  subtitle: string
  siteName: string
  /** Second line under Site — location + coordinates (reference layout). */
  siteLocationLine: string
  periodLabel: string
  dailyRecordCount: number
  climateZone: string
  issueDateLabel: string
  preparedBy: string
}

/** Cover page matching Elite Agro Weather Intelligence reference layout. */
export function docxWeatherIntelligenceCover(input: WeatherDocxCoverInput): string {
  return [
    centerP(run('ELITE AGRO', { bold: true, color: DOCX_BRAND, size: 26 }), 40),
    centerP(run('PROJECTS', { bold: true, color: DOCX_BRAND, size: 22 }), 40),
    centerP(
      run(`WEATHER INTELLIGENCE SERIES  ·  ${input.seriesYear}`, {
        bold: true,
        color: DOCX_BRAND_SOFT,
        size: 20,
      }),
      120,
    ),
    centerP(run('WeatherReport', { bold: true, color: DOCX_INK, size: 34 }), 40),
    centerP(run(input.subtitle, { italic: true, color: DOCX_MUTED, size: 22 }), 200),
    metaRow('Site', input.siteName),
    `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${run(input.siteLocationLine, { color: DOCX_INK, size: 20 })}</w:p>`,
    metaRow('Analysis period', input.periodLabel),
    metaRow('Data basis', `${input.dailyRecordCount} daily records`),
    metaRow('Climate zone', input.climateZone),
    metaRow('Issue date', input.issueDateLabel),
    `<w:p><w:pPr><w:spacing w:after="80" w:before="200"/></w:pPr>${run('Prepared by  ', { color: DOCX_MUTED, size: 18 })}${run(input.preparedBy, { bold: true, color: DOCX_INK, size: 20 })}</w:p>`,
    centerP(run('CONFIDENTIAL  ·  FOR DECISION SUPPORT', { italic: true, color: DOCX_MUTED, size: 16 }), 400),
    docxPageBreak(),
  ].join('')
}

export function docxWeatherNumberedHeading(sectionNum: string, title: string): string {
  return `<w:p><w:pPr><w:spacing w:after="120" w:before="160"/></w:pPr>${run(`${sectionNum}   `, { bold: true, color: DOCX_BRAND, size: 24 })}${run(title, { bold: true, color: DOCX_INK, size: 24 })}</w:p>`
}

export function docxWeatherKeyFindings(lines: string[]): string {
  const chunks = [
    `<w:p><w:pPr><w:spacing w:after="80" w:before="80"/></w:pPr>${run('KEY FINDINGS', { bold: true, color: DOCX_BRAND, size: 22 })}</w:p>`,
  ]
  lines.forEach(line => chunks.push(docxBodyParagraph(line)))
  return chunks.join('')
}

/** Two-column KPI cards (label / value) like reference Executive KPIs grid. */
export function docxWeatherExecutiveKpiGrid(
  cards: Array<{ label: string; value: string; subValue?: string }>,
): string {
  const rows: string[][] = []
  for (let i = 0; i < cards.length; i += 2) {
    const a = cards[i]
    const b = cards[i + 1]
    const fmt = (c: typeof a) => {
      if (!c) return ['', '']
      const val = c.subValue ? `${c.value}\n${c.subValue}` : c.value
      return [c.label.toUpperCase(), val]
    }
    const [aLabel, aVal] = fmt(a)
    const [bLabel, bVal] = fmt(b)
    rows.push([aLabel, aVal, bLabel, bVal])
  }
  return docxTable(['', '', '', ''], rows, [2200, 2400, 2200, 2400])
}

export function formatWeatherCoordinatesLabel(lat: number, lng: number): string {
  const latStr = `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`
  const lngStr = `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`
  return `${latStr}, ${lngStr}`
}

export function formatWeatherRiskBandShort(band: string): string {
  return band.replace(/\s+Risk$/i, '').trim()
}

export function docxWeatherScoreBandsTable(): string {
  return docxTable(
    ['Score bands', 'Range', 'Score bands', 'Range'],
    [
      ['Critical', '0 – 19', 'High Risk', '20 – 39'],
      ['Moderate', '40 – 59', 'Good', '60 – 79'],
      ['Excellent', '80 – 100', '', ''],
    ],
    [2200, 2400, 2200, 2400],
  )
}

export function docxWeatherCurrentSnapshot(metrics: Array<{ label: string; value: string }>): string {
  const inner = metrics
    .map(m => `${run(m.label.toUpperCase(), { bold: true, color: DOCX_BRAND_SOFT, size: 18 })}${run('  ', { size: 18 })}${run(m.value, { bold: true, color: DOCX_INK, size: 20 })}`)
    .join('')
  return `<w:p><w:pPr><w:spacing w:after="120" w:line="320" w:lineRule="auto"/></w:pPr>${inner}</w:p>`
}

export {
  docxBodyParagraph,
  docxBulletList,
  docxInlineChart,
  docxItalicNote,
  docxPageBreak,
  docxSectionHeading,
  docxTable,
}
