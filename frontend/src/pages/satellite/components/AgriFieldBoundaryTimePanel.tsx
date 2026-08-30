import { useMemo, useState } from 'react'
import type { FtwGlobalYear } from '../../../lib/agriFieldBoundary/ftwGlobalConfig'
import { listFtwGlobalYearOptions } from '../../../lib/agriFieldBoundary/ftwGlobalConfig'
import './AgriFieldBoundaryTimePanel.css'

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

function yearFromIso(iso: string): number {
  const y = Number(String(iso || '').slice(0, 4))
  return Number.isFinite(y) ? y : new Date().getFullYear()
}

function monthFromIso(iso: string): number {
  const m = Number(String(iso || '').slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function clampIso(iso: string, maxIso: string): string {
  return iso > maxIso ? maxIso : iso
}

export type AgriFieldBoundaryTimePanelProps = {
  variant: 'ftw' | 'scene'
  busy?: boolean
  ftwYear?: FtwGlobalYear
  onFtwYearChange?: (year: FtwGlobalYear) => void
  sceneDateFrom?: string
  sceneDateTo?: string
  onSceneDateFromChange?: (iso: string) => void
  onSceneDateToChange?: (iso: string) => void
  onSetYear?: (year: number) => void
  maxSceneDate?: string
}

export function AgriFieldBoundaryTimePanel({
  variant,
  busy = false,
  ftwYear = 2025,
  onFtwYearChange,
  sceneDateFrom = '',
  sceneDateTo = '',
  onSceneDateFromChange,
  onSceneDateToChange,
  onSetYear,
  maxSceneDate,
}: AgriFieldBoundaryTimePanelProps) {
  const [open, setOpen] = useState(true)
  const [automaticScene, setAutomaticScene] = useState(true)

  const displayYear = variant === 'ftw' ? ftwYear : yearFromIso(sceneDateTo || sceneDateFrom)
  const maxYear = maxSceneDate ? yearFromIso(maxSceneDate) : new Date().getFullYear()

  const yearOptions = useMemo(() => {
    if (variant === 'ftw') return listFtwGlobalYearOptions()
    const years: number[] = []
    for (let y = maxYear; y >= 2017; y -= 1) years.push(y)
    return years
  }, [variant, maxYear])

  const startMonth = monthFromIso(sceneDateFrom)
  const endMonth = monthFromIso(sceneDateTo)

  const applyManualRange = (year: number, start: number, end: number) => {
    const maxIso = maxSceneDate || `${maxYear}-12-31`
    const from = clampIso(`${year}-${pad2(start)}-01`, maxIso)
    const toDay = lastDayOfMonth(year, end)
    const to = clampIso(`${year}-${pad2(end)}-${pad2(toDay)}`, maxIso)
    onSceneDateFromChange?.(from)
    onSceneDateToChange?.(to <= from ? from : to)
  }

  const handleYearChange = (nextYear: number) => {
    if (variant === 'ftw') {
      onFtwYearChange?.(nextYear as FtwGlobalYear)
      return
    }
    if (automaticScene) {
      onSetYear?.(nextYear)
      return
    }
    applyManualRange(nextYear, startMonth, endMonth)
  }

  const handleStartMonthChange = (month: number) => {
    if (variant === 'scene' && !automaticScene) {
      applyManualRange(displayYear, month, Math.max(month, endMonth))
    }
  }

  const handleEndMonthChange = (month: number) => {
    if (variant === 'scene' && !automaticScene) {
      applyManualRange(displayYear, Math.min(startMonth, month), month)
    }
  }

  const toggleAutomatic = () => {
    const next = !automaticScene
    setAutomaticScene(next)
    if (next) onSetYear?.(displayYear)
  }

  return (
    <section className="si-afb-time" aria-label="Time">
      <button
        type="button"
        className="si-afb-time__head"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <i className="fa-solid fa-circle-check si-afb-time__icon" aria-hidden />
        <span className="si-afb-time__title">Time</span>
        <span className="si-afb-time__badge">Year: {displayYear}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} si-afb-time__caret`} aria-hidden />
      </button>

      {open ? (
        <div className="si-afb-time__body">
          <label className="si-afb-time__outlined">
            <span className="si-afb-time__outlined-label">Year of planting</span>
            <select
              className="si-afb-time__select"
              value={displayYear}
              disabled={busy}
              onChange={e => handleYearChange(Number(e.target.value))}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <div className="si-afb-time__months">
            <label className="si-afb-time__outlined si-afb-time__outlined--half">
              <span className="si-afb-time__outlined-label">Start Month</span>
              <select
                className="si-afb-time__select"
                value={automaticScene || variant === 'ftw' ? 'default' : String(startMonth)}
                disabled={busy || automaticScene || variant === 'ftw'}
                onChange={e => handleStartMonthChange(Number(e.target.value))}
              >
                {automaticScene || variant === 'ftw' ? (
                  <option value="default">Default</option>
                ) : (
                  MONTHS.map((name, idx) => (
                    <option key={name} value={String(idx + 1)}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="si-afb-time__outlined si-afb-time__outlined--half">
              <span className="si-afb-time__outlined-label">End Month</span>
              <select
                className="si-afb-time__select"
                value={automaticScene || variant === 'ftw' ? 'default' : String(endMonth)}
                disabled={busy || automaticScene || variant === 'ftw'}
                onChange={e => handleEndMonthChange(Number(e.target.value))}
              >
                {automaticScene || variant === 'ftw' ? (
                  <option value="default">Default</option>
                ) : (
                  MONTHS.map((name, idx) => (
                    <option key={name} value={String(idx + 1)}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          {variant === 'scene' ? (
            <button
              type="button"
              className="si-afb-time__auto-btn"
              disabled={busy}
              onClick={toggleAutomatic}
            >
              {automaticScene ? 'DISABLE AUTOMATIC SCENE SELECTION' : 'ENABLE AUTOMATIC SCENE SELECTION'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
