import { useMemo, useState, useEffect } from 'react'
import { dateFromLocalIso, localIsoDate } from '../../../lib/siSentinelImageryDate'
import './ImagerySceneCalendar.css'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export type ImagerySceneCalendarProps = {
  value: string
  onChange: (iso: string) => void
  /** YYYY-MM-DD scene dates available for the AOI (already filtered by cloud cover when possible). */
  availableSceneIsos?: string[]
  cloudCoverage: number
  onCloudCoverageChange: (pct: number) => void
  loading?: boolean
  disabled?: boolean
  /** Optional reset-to-auto control rendered beside the cloud row. */
  onResetAuto?: () => void
  autoFollow?: boolean
  className?: string
}

function startOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1, 12, 0, 0, 0)
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function clampCloud(n: number): number {
  if (!Number.isFinite(n)) return 30
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function ImagerySceneCalendar(props: ImagerySceneCalendarProps) {
  const {
    value,
    onChange,
    availableSceneIsos = [],
    cloudCoverage,
    onCloudCoverageChange,
    loading = false,
    disabled = false,
    onResetAuto,
    autoFollow = false,
    className = '',
  } = props

  const selectedIso = (value || '').trim().slice(0, 10)
  const todayIso = localIsoDate()
  const availableSet = useMemo(
    () => new Set(availableSceneIsos.map(d => d.trim().slice(0, 10)).filter(Boolean)),
    [availableSceneIsos],
  )

  const selectedDate = useMemo(() => dateFromLocalIso(selectedIso || todayIso), [selectedIso, todayIso])
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  useEffect(() => {
    setViewYear(selectedDate.getFullYear())
    setViewMonth(selectedDate.getMonth())
  }, [selectedDate])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const out: number[] = []
    for (let i = y; i >= y - 10; i -= 1) out.push(i)
    return out
  }, [])

  const cells = useMemo(() => {
    const first = startOfMonth(viewYear, viewMonth)
    const offset = first.getDay()
    const dim = daysInMonth(viewYear, viewMonth)
    const prevDim = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1)
    const rows: Array<{ iso: string; day: number; inMonth: boolean }> = []

    for (let i = 0; i < offset; i += 1) {
      const day = prevDim - offset + i + 1
      const d = new Date(viewYear, viewMonth - 1, day, 12, 0, 0, 0)
      rows.push({ iso: localIsoDate(d), day, inMonth: false })
    }
    for (let day = 1; day <= dim; day += 1) {
      const d = new Date(viewYear, viewMonth, day, 12, 0, 0, 0)
      rows.push({ iso: localIsoDate(d), day, inMonth: true })
    }
    while (rows.length % 7 !== 0) {
      const day = rows.length - offset - dim + 1
      const d = new Date(viewYear, viewMonth + 1, day, 12, 0, 0, 0)
      rows.push({ iso: localIsoDate(d), day, inMonth: false })
    }
    return rows
  }, [viewYear, viewMonth])

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1, 12, 0, 0, 0)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const cloud = clampCloud(cloudCoverage)
  const sceneCount = availableSet.size

  return (
    <div className={'si-img-cal' + (className ? ` ${className}` : '')} aria-busy={loading || undefined}>
      <div className="si-img-cal__cloud">
        <span className="si-img-cal__cloud-label">Max. cloud coverage:</span>
        <input
          type="range"
          className="si-img-cal__cloud-slider"
          style={{ ['--si-cloud-pct' as string]: `${cloud}%` }}
          min={0}
          max={100}
          step={1}
          value={cloud}
          disabled={disabled}
          aria-label="Maximum cloud coverage percent"
          onChange={e => onCloudCoverageChange(clampCloud(Number(e.target.value)))}
        />
        <span className="si-img-cal__cloud-value" title="Max cloud coverage">
          <i className="fa-solid fa-cloud" aria-hidden />
          <strong>{cloud}%</strong>
        </span>
        {onResetAuto ? (
          <button
            type="button"
            className="si-img-cal__reset"
            onClick={onResetAuto}
            disabled={disabled || (autoFollow && !loading)}
            title="Reset to auto (latest valid scene)"
            aria-label="Reset imagery date to auto"
          >
            <i className="fa-solid fa-rotate-left" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="si-img-cal__cal">
        <div className="si-img-cal__nav">
          <button
            type="button"
            className="si-img-cal__nav-btn"
            onClick={() => shiftMonth(-1)}
            disabled={disabled}
            aria-label="Previous month"
          >
            <i className="fa-solid fa-chevron-left" aria-hidden />
          </button>
          <div className="si-img-cal__nav-selects">
            <label className="si-img-cal__select-wrap">
              <span className="sr-only">Month</span>
              <select
                className="si-img-cal__select"
                value={viewMonth}
                disabled={disabled}
                aria-label="Month"
                onChange={e => setViewMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="si-img-cal__select-wrap">
              <span className="sr-only">Year</span>
              <select
                className="si-img-cal__select"
                value={viewYear}
                disabled={disabled}
                aria-label="Year"
                onChange={e => setViewYear(Number(e.target.value))}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="si-img-cal__nav-btn"
            onClick={() => shiftMonth(1)}
            disabled={disabled}
            aria-label="Next month"
          >
            <i className="fa-solid fa-chevron-right" aria-hidden />
          </button>
        </div>

        <div className="si-img-cal__weekdays" aria-hidden>
          {WEEKDAYS.map(d => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="si-img-cal__grid" role="grid" aria-label="Imagery calendar">
          {cells.map(cell => {
            const hasScene = availableSet.has(cell.iso)
            const selected = cell.iso === selectedIso
            const isToday = cell.iso === todayIso
            const cls = [
              'si-img-cal__day',
              cell.inMonth ? '' : 'si-img-cal__day--muted',
              hasScene ? 'si-img-cal__day--scene' : '',
              selected ? 'si-img-cal__day--selected' : '',
              isToday && !selected ? 'si-img-cal__day--today' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={cell.iso + (cell.inMonth ? '' : '-o')}
                type="button"
                role="gridcell"
                className={cls}
                disabled={disabled || !cell.inMonth}
                aria-label={`${cell.iso}${hasScene ? ', imagery available' : ''}${selected ? ', selected' : ''}`}
                aria-pressed={selected}
                title={
                  hasScene
                    ? `${cell.iso} — scene available (≤ ${cloud}% cloud)`
                    : `${cell.iso}${availableSceneIsos.length ? ' — no scene under cloud filter' : ''}`
                }
                onClick={() => {
                  if (!cell.inMonth) return
                  onChange(cell.iso)
                }}
              >
                {cell.day}
              </button>
            )
          })}
        </div>

        <div className="si-img-cal__legend" role="note">
          <span className="si-img-cal__legend-swatch si-img-cal__legend-swatch--scene" />
          <span>
            {loading
              ? 'Updating scene dates…'
              : sceneCount
                ? `${sceneCount} scene day${sceneCount === 1 ? '' : 's'} ≤ ${cloud}% cloud`
                : 'Draw an AOI to load scene dates'}
          </span>
        </div>
      </div>
    </div>
  )
}
