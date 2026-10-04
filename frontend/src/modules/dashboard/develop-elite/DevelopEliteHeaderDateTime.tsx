import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  dateToInputValue,
  formatDevelopEliteHeaderDateTime,
  parseLocalDateTime,
  timeToInputValue,
} from './developEliteHeaderDateTimeFormat'

const CLOCK_TICK_MS = 30_000

export function DevelopEliteHeaderDateTime() {
  const [liveNow, setLiveNow] = useState(() => new Date())
  const [pinnedAt, setPinnedAt] = useState<Date | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickDate, setPickDate] = useState(() => dateToInputValue(new Date()))
  const [pickTime, setPickTime] = useState(() => timeToInputValue(new Date()))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = window.setInterval(() => setLiveNow(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  const displayDate = pinnedAt ?? liveNow

  const dateTimeLabel = useMemo(() => formatDevelopEliteHeaderDateTime(displayDate), [displayDate])

  const openMenu = useCallback(() => {
    const base = pinnedAt ?? liveNow
    setPickDate(dateToInputValue(base))
    setPickTime(timeToInputValue(base))
    setMenuOpen(true)
  }, [liveNow, pinnedAt])

  const applyPick = useCallback(() => {
    const parsed = parseLocalDateTime(pickDate, pickTime)
    if (parsed) {
      setPinnedAt(parsed)
      setMenuOpen(false)
    }
  }, [pickDate, pickTime])

  const useLiveNow = useCallback(() => {
    setPinnedAt(null)
    setLiveNow(new Date())
    setMenuOpen(false)
  }, [])

  return (
    <div className="develop-elite__meta-block develop-elite__meta-block--datetime" ref={rootRef}>
      <span className="develop-elite__meta-label" id="develop-elite-datetime-label">Date / Time:</span>
      <div className="develop-elite__datetime-row">
        <span className="develop-elite__meta-value" aria-live="polite">
          {dateTimeLabel}
        </span>
        <button
          type="button"
          className="develop-elite__datetime-btn"
          aria-labelledby="develop-elite-datetime-label"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
        >
          <i className="fa-solid fa-calendar-days" aria-hidden />
        </button>
      </div>
      {menuOpen ? (
        <div className="develop-elite__datetime-menu" role="dialog" aria-label="Date and time">
          <label className="develop-elite__datetime-field">
            <span>Date</span>
            <input
              type="date"
              value={pickDate}
              onChange={e => setPickDate(e.target.value)}
            />
          </label>
          <label className="develop-elite__datetime-field">
            <span>Time</span>
            <input
              type="time"
              value={pickTime}
              onChange={e => setPickTime(e.target.value)}
            />
          </label>
          <div className="develop-elite__datetime-actions">
            <button type="button" className="develop-elite__datetime-action" onClick={useLiveNow}>
              Now
            </button>
            <button type="button" className="develop-elite__datetime-action is-primary" onClick={applyPick}>
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
