import { AlertTriangle, ArrowDownRight, ArrowUpRight, Droplets, FlaskConical, Minus, Sprout, SprayCan, Table2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { opsApi, type OpsDashboard as Data } from '../api'
import { useOps, useOpsText } from '../opsContext'

/**
 * Operations overview on the forms hub: headline numbers vs the previous period and weekly charts
 * (harvest, water, EC/pH quality, plant protection). Charts are hand-built SVG/HTML: one y-axis,
 * thin rounded bars with a 2px surface gap, recessive grid, hover tooltips, and a table view for
 * every chart. Colours come from validated --viz-* tokens in ops.css (light and dark).
 */

const PERIODS = [4, 12, 26, 52] as const

function weekStart(label: string): Date {
  const [y, w] = label.split('-W').map(Number) as [number, number]
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000)
  return new Date(monday.getTime() + (w - 1) * 7 * 86_400_000)
}

function useFormatters(lang: 'en' | 'ar') {
  return useMemo(() => {
    const locale = lang === 'ar' ? 'ar-AE' : 'en-GB'
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    const dayYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    return {
      num: (v: number) => num.format(v),
      num1: (v: number) => num1.format(v),
      compact: (v: number) => compact.format(v),
      weekRange: (label: string) => {
        const s = weekStart(label)
        const e = new Date(s.getTime() + 6 * 86_400_000)
        return `${day.format(s)} – ${dayYear.format(e)}`
      },
      weekShort: (label: string) => day.format(weekStart(label)),
      date: (iso: string) => dayYear.format(new Date(`${iso}T00:00:00Z`)),
    }
  }, [lang])
}

type Fmt = ReturnType<typeof useFormatters>

/* ───────────────────────────── KPI tile ───────────────────────────── */

function Delta({ cur, prev, fmtPrev, lowerIsBetter = false, tx }: { cur: number | null; prev: number | null; fmtPrev: string; lowerIsBetter?: boolean; tx: (en: string, ar: string) => string }) {
  if (cur == null || prev == null || prev === 0) {
    return <span className="ops-kpi__delta">{tx('No previous period to compare', 'لا توجد فترة سابقة للمقارنة')}</span>
  }
  const change = ((cur - prev) / Math.abs(prev)) * 100
  const flat = Math.abs(change) < 0.05
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
  const good = flat ? null : lowerIsBetter ? change < 0 : change > 0
  return (
    <span className="ops-kpi__delta">
      <span className={`ops-kpi__chg${good == null ? '' : good ? ' is-good' : ' is-bad'}`}>
        <Icon aria-hidden />
        {flat ? '0%' : `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%`}
      </span>{' '}
      {tx('vs', 'مقابل')} {fmtPrev}
    </span>
  )
}

function Kpi({ icon, label, value, unit, children, to }: { icon: ReactNode; label: string; value: string; unit?: string; children?: ReactNode; to: string }) {
  return (
    <Link to={to} className="ops-kpi">
      <span className="ops-kpi__label">
        {icon}
        {label}
      </span>
      <span className="ops-kpi__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {children}
    </Link>
  )
}

/* ───────────────────────────── Chart card ───────────────────────────── */

function ChartCard({ title, sub, legend, table, children }: { title: ReactNode; sub?: string; legend?: ReactNode; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  const tx = useOpsText()
  return (
    <section className="ops-chart">
      <header className="ops-chart__head">
        <div>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
        <button type="button" className={`ops-icon-btn${asTable ? ' is-on' : ''}`} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} title={tx('Show as table', 'عرض كجدول')} aria-label={tx('Show as table', 'عرض كجدول')}>
          <Table2 aria-hidden />
        </button>
      </header>
      {legend && !asTable ? <div className="ops-chart__legend">{legend}</div> : null}
      {asTable ? <div className="ops-chart__table">{table}</div> : children}
    </section>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

type Series = { key: string; label: string; color: string }

/** Weekly columns (one series, or two stacked). One y-axis; hover a column for its values. */
function WeeklyBars({ weeks, rows, series, fmt, unit, valueFmt }: { weeks: string[]; rows: Record<string, number | string | null>[]; series: Series[]; fmt: Fmt; unit: string; valueFmt: (v: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 210
  const m = { t: 10, r: 8, b: 26, l: 44 }
  const plotW = Math.max(width - m.l - m.r, 10)
  const plotH = H - m.t - m.b
  const totals = rows.map((r) => series.reduce((s, x) => s + (Number(r[x.key]) || 0), 0))
  const max = niceMax(Math.max(...totals, 0))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const band = plotW / Math.max(weeks.length, 1)
  const gap = Math.min(Math.max(band * 0.28, 2), 14)
  const bw = Math.max(band - gap, 2)
  const y = (v: number) => m.t + plotH - (v / max) * plotH
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(Math.floor(plotW / 64), 1)))
  // Rounded top on the outermost segment only (4px), square at the baseline.
  const barPath = (x: number, y0: number, y1: number, round: boolean) => {
    const h = y0 - y1
    if (h <= 0) return ''
    const r = round ? Math.min(4, bw / 2, h) : 0
    return `M${x},${y0}V${y1 + r}${r ? `Q${x},${y1} ${x + r},${y1}` : ''}H${x + bw - r}${r ? `Q${x + bw},${y1} ${x + bw},${y1 + r}` : ''}V${y0}Z`
  }
  const hv = hover == null ? null : rows[hover]
  return (
    <div ref={ref} className="ops-chart__plot" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={H} role="img" aria-label={`${series.map((s) => s.label).join(', ')} — ${unit}`}>
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={m.l} x2={width - m.r} y1={y(tv)} y2={y(tv)} className={tv === 0 ? 'ops-viz-axis' : 'ops-viz-grid'} />
              <text x={m.l - 8} y={y(tv)} dy="0.32em" textAnchor="end" className="ops-viz-tick">
                {fmt.compact(tv)}
              </text>
            </g>
          ))}
          {weeks.map((wk, i) => {
            const x = m.l + i * band + gap / 2
            let acc = 0
            const segs = series.map((s, si) => {
              const v = Number(rows[i]?.[s.key]) || 0
              const y0 = y(acc) - (si > 0 && acc > 0 ? 2 : 0) // 2px surface gap between stacked fills
              acc += v
              const isTop = series.slice(si + 1).every((n) => !(Number(rows[i]?.[n.key]) > 0))
              return v > 0 ? <path key={s.key} d={barPath(x, y0, y(acc), isTop)} fill={s.color} /> : null
            })
            return (
              <g key={wk} className={hover != null && hover !== i ? 'is-dim' : undefined}>
                {segs}
                {i % labelEvery === 0 ? (
                  <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="ops-viz-tick">
                    {fmt.weekShort(wk)}
                  </text>
                ) : null}
                <rect x={m.l + i * band} y={m.t} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
      ) : null}
      {hv && hover != null ? (
        <div className="ops-viz-tip" style={{ insetInlineStart: Math.min(Math.max(m.l + hover * band + band / 2 - 90, 0), Math.max(width - 180, 0)) }} role="status">
          <strong>{fmt.weekRange(weeks[hover]!)}</strong>
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} aria-hidden />
              {s.label}: <b>{valueFmt(Number(hv[s.key]) || 0)}</b> {unit}
            </span>
          ))}
          {series.length > 1 ? (
            <span className="ops-viz-tip__total">
              Σ <b>{valueFmt(totals[hover]!)}</b> {unit}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Ranked horizontal bars with direct value labels (top N). */
function RankBars({ rows, color, valueFmt, unit, note }: { rows: { key: string; value: number }[]; color: string; valueFmt: (v: number) => string; unit: string; note?: (r: { key: string; value: number }) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1
  const tx = useOpsText()
  if (!rows.length) return <p className="ops-chart__empty">{tx('No data in this period.', 'لا توجد بيانات في هذه الفترة.')}</p>
  return (
    <ul className="ops-rank">
      {rows.map((r) => (
        <li key={r.key} title={note ? note(r) : undefined}>
          <span className="ops-rank__label">{r.key}</span>
          <span className="ops-rank__track">
            <span className="ops-rank__bar" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: color }} />
          </span>
          <span className="ops-rank__value">
            {valueFmt(r.value)} <small>{unit}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="ops-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>
              <span className="ops-perm__head">{h}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={typeof c === 'number' ? 'is-num' : undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ───────────────────────────── Dashboard ───────────────────────────── */

const C = { harvest: 'var(--viz-green)', irrigation: 'var(--viz-blue)', fertigation: 'var(--viz-orange)', ppp: 'var(--viz-violet)', alert: 'var(--viz-serious)' }

export function OpsDashboard() {
  const { lang, t, schema } = useOps()
  const tx = useOpsText()
  const fmt = useFormatters(lang)
  const [weeks, setWeeks] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('ops-dash-weeks'))
      return (PERIODS as readonly number[]).includes(v) ? v : 12
    } catch {
      return 12
    }
  })
  const [farm, setFarm] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('ops-dash-weeks', String(weeks))
    } catch {
      /* ignore */
    }
    let alive = true
    opsApi
      .dashboard({ weeks, farm: farm || undefined })
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [weeks, farm])

  const formTitle = (id: string) => {
    const f = schema?.forms.find((x) => x.id === id)
    return f ? t(f.title) : id
  }
  const prevLabel = tx('previous period', 'الفترة السابقة')
  if (error) {
    return (
      <div className="ops-alert" role="alert">
        {error}
      </div>
    )
  }
  if (!data) return <div className="ops-dash ops-dash--loading" aria-busy="true" />
  const hasAny = Boolean(data.harvest || data.ecPh || data.ppp || data.water)
  if (!hasAny) return null
  const empty = (data.harvest?.kg ?? 0) + (data.ecPh?.readings ?? 0) + (data.ppp?.applications ?? 0) + (data.water?.m3 ?? 0) === 0

  const waterSeries: Series[] = (data.water?.series ?? []).map((k) => ({ key: k, label: formTitle(k), color: C[k] }))

  return (
    <section className="ops-dash" aria-labelledby="ops-dash-title">
      <div className="ops-dash__bar">
        <div>
          <h2 id="ops-dash-title">{tx('Overview', 'نظرة عامة')}</h2>
          <p>
            {fmt.date(data.range.from)} – {fmt.date(data.range.to)}
          </p>
        </div>
        <div className="ops-dash__filters">
          <div className="ops-seg" role="group" aria-label={tx('Period', 'الفترة')}>
            {PERIODS.map((p) => (
              <button key={p} type="button" className={weeks === p ? 'is-active' : ''} aria-pressed={weeks === p} onClick={() => setWeeks(p)}>
                {lang === 'ar' ? `${p} أسبوع` : `${p} wk`}
              </button>
            ))}
          </div>
          {data.farms.length > 1 ? (
            <select className="ops-input" value={farm} onChange={(e) => setFarm(e.target.value)} aria-label={tx('Farm', 'المزرعة')}>
              <option value="">{tx('All farms', 'كل المزارع')}</option>
              {data.farms.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {empty ? (
        <p className="ops-chart__empty">{tx('No records in this period yet — import a workbook or add records to see the overview.', 'لا توجد سجلات في هذه الفترة بعد — استورد ملفاً أو أضف سجلات لتظهر النظرة العامة.')}</p>
      ) : null}

      <div className="ops-kpis">
        {data.harvest ? (
          <Kpi to="/ops/harvest" icon={<Sprout aria-hidden />} label={tx('Harvested', 'المحصول')} value={fmt.num(data.harvest.kg)} unit={tx('kg', 'كغ')}>
            <Delta cur={data.harvest.kg} prev={data.harvest.prevKg} fmtPrev={prevLabel} tx={tx} />
          </Kpi>
        ) : null}
        {data.ecPh ? (
          <Kpi
            to="/ops/ec_ph"
            icon={data.ecPh.outOfLimit ? <AlertTriangle aria-hidden className="ops-kpi__warn" /> : <FlaskConical aria-hidden />}
            label={tx('EC / pH out of limits', 'EC / pH خارج الحدود')}
            value={data.ecPh.outPct == null ? '—' : `${fmt.num1(data.ecPh.outPct)}%`}
          >
            <span className="ops-kpi__delta">
              {fmt.num(data.ecPh.outOfLimit)} {tx('of', 'من')} {fmt.num(data.ecPh.readings)} {tx('readings', 'قراءة')}
            </span>
            <Delta cur={data.ecPh.outPct} prev={data.ecPh.prevOutPct} fmtPrev={prevLabel} lowerIsBetter tx={tx} />
          </Kpi>
        ) : null}
        {data.ppp ? (
          <Kpi to="/ops/ppp" icon={<SprayCan aria-hidden />} label={tx('Plant protection cost', 'تكلفة وقاية النبات')} value={fmt.num(data.ppp.cost)}>
            <span className="ops-kpi__delta">
              {fmt.num(data.ppp.applications)} {tx('applications', 'تطبيق')}
            </span>
            <Delta cur={data.ppp.cost} prev={data.ppp.prevCost} fmtPrev={prevLabel} lowerIsBetter tx={tx} />
          </Kpi>
        ) : null}
        {data.water ? (
          <Kpi to={`/ops/${data.water.series[0]}`} icon={<Droplets aria-hidden />} label={tx('Water applied', 'المياه المستخدمة')} value={fmt.num(data.water.m3)} unit="m³">
            <Delta cur={data.water.m3} prev={data.water.prevM3} fmtPrev={prevLabel} tx={tx} />
          </Kpi>
        ) : null}
      </div>

      <div className="ops-charts">
        {data.harvest ? (
          <>
            <ChartCard
              title={tx('Harvest per week', 'الحصاد الأسبوعي')}
              sub={tx('kg harvested, by ISO week', 'كغ محصودة حسب الأسبوع')}
              table={<DataTable head={[tx('Week', 'الأسبوع'), tx('kg', 'كغ')]} rows={data.harvest.weekly.map((w) => [fmt.weekRange(w.week), fmt.num(w.kg)])} />}
            >
              <WeeklyBars weeks={data.weeks} rows={data.harvest.weekly} series={[{ key: 'kg', label: tx('Harvested', 'المحصول'), color: C.harvest }]} fmt={fmt} unit={tx('kg', 'كغ')} valueFmt={fmt.num} />
            </ChartCard>
            <ChartCard
              title={tx('Harvest by crop', 'الحصاد حسب المحصول')}
              sub={tx('Top crops by kg in this period', 'أعلى المحاصيل بالكغ في هذه الفترة')}
              table={<DataTable head={[tx('Crop', 'المحصول'), tx('kg', 'كغ')]} rows={data.harvest.byCrop.map((r) => [r.key, fmt.num(r.value)])} />}
            >
              <RankBars rows={data.harvest.byCrop} color={C.harvest} valueFmt={fmt.num} unit={tx('kg', 'كغ')} />
            </ChartCard>
          </>
        ) : null}
        {data.water ? (
          <ChartCard
            title={tx('Water per week', 'المياه الأسبوعية')}
            sub="m³"
            legend={
              waterSeries.length > 1
                ? waterSeries.map((s) => (
                    <span key={s.key} className="ops-legend">
                      <i style={{ background: s.color }} aria-hidden />
                      {s.label}
                    </span>
                  ))
                : undefined
            }
            table={
              <DataTable
                head={[tx('Week', 'الأسبوع'), ...waterSeries.map((s) => `${s.label} (m³)`)]}
                rows={data.water.weekly.map((w) => [fmt.weekRange(w.week), ...waterSeries.map((s) => fmt.num(Number(w[s.key]) || 0))])}
              />
            }
          >
            <WeeklyBars weeks={data.weeks} rows={data.water.weekly} series={waterSeries} fmt={fmt} unit="m³" valueFmt={fmt.num} />
          </ChartCard>
        ) : null}
        {data.ecPh ? (
          <>
            <ChartCard
              title={
                <>
                  <AlertTriangle aria-hidden className="ops-kpi__warn" /> {tx('EC / pH readings out of limits', 'قراءات EC / pH خارج الحدود')}
                </>
              }
              sub={`${tx('Limits', 'الحدود')}: EC ${schema?.settings.ecPhLimits.ecMin}–${schema?.settings.ecPhLimits.ecMax} · pH ${schema?.settings.ecPhLimits.phMin}–${schema?.settings.ecPhLimits.phMax}`}
              table={
                <DataTable
                  head={[tx('Week', 'الأسبوع'), tx('Readings', 'القراءات'), tx('Out of limits', 'خارج الحدود'), '%']}
                  rows={data.ecPh.weekly.map((w) => [fmt.weekRange(w.week), fmt.num(w.readings), fmt.num(w.out), w.outPct == null ? '—' : `${fmt.num1(w.outPct)}%`])}
                />
              }
            >
              <WeeklyBars weeks={data.weeks} rows={data.ecPh.weekly} series={[{ key: 'out', label: tx('Out of limits', 'خارج الحدود'), color: C.alert }]} fmt={fmt} unit={tx('readings', 'قراءة')} valueFmt={fmt.num} />
            </ChartCard>
            <ChartCard
              title={tx('Where readings go out of limits', 'أين تخرج القراءات عن الحدود')}
              sub={tx('Locations with the most out-of-limit readings', 'المواقع الأكثر قراءات خارج الحدود')}
              table={<DataTable head={[tx('Location', 'الموقع'), tx('Out of limits', 'خارج الحدود'), tx('Readings', 'القراءات')]} rows={data.ecPh.byLocation.map((r) => [r.key, fmt.num(r.value), fmt.num(r.readings)])} />}
            >
              <RankBars
                rows={data.ecPh.byLocation}
                color={C.alert}
                valueFmt={fmt.num}
                unit={tx('readings', 'قراءة')}
                note={(r) => `${fmt.num(r.value)} / ${fmt.num((r as { readings?: number }).readings ?? 0)}`}
              />
            </ChartCard>
          </>
        ) : null}
        {data.ppp ? (
          <ChartCard
            title={tx('Plant protection cost by product', 'تكلفة وقاية النبات حسب المنتج')}
            sub={tx('Top products by cost in this period', 'أعلى المنتجات تكلفة في هذه الفترة')}
            table={<DataTable head={[tx('Product', 'المنتج'), tx('Cost', 'التكلفة'), tx('Applications', 'التطبيقات')]} rows={data.ppp.byProduct.map((r) => [r.key, fmt.num(r.value), fmt.num(r.applications)])} />}
          >
            <RankBars rows={data.ppp.byProduct} color={C.ppp} valueFmt={fmt.num} unit="" />
          </ChartCard>
        ) : null}
      </div>
    </section>
  )
}
