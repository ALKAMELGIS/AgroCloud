import { memo, useEffect, useRef, useState } from 'react'
import {
  DEVELOP_ELITE_CLOCK_WEEKDAYS,
  formatDevelopEliteUaeClockAriaLabel,
  getDevelopEliteUaeClockParts,
  type DevelopEliteUaeClockParts,
} from './developEliteUaeClock'
import { DevelopEliteSevenSegmentColon, DevelopEliteSevenSegmentDigit } from './DevelopEliteSevenSegmentDigit'

const TICK_MS = 1000
const DAY_ROW_PX = 6

function DevelopEliteWeekdayDial({
  activeIndex,
  driftPx,
}: {
  activeIndex: number
  driftPx: number
}) {
  const active = DEVELOP_ELITE_CLOCK_WEEKDAYS[activeIndex] ?? DEVELOP_ELITE_CLOCK_WEEKDAYS[0]
  const offsetPx = activeIndex * DAY_ROW_PX + driftPx

  return (
    <div className="develop-elite-digital-clock__day-dial" aria-hidden>
      <div className="develop-elite-digital-clock__day-dial-track">
        <div
          className="develop-elite-digital-clock__day-dial-strip"
          style={{ ['--de-day-offset' as string]: `${offsetPx}px` }}
        >
          {DEVELOP_ELITE_CLOCK_WEEKDAYS.map((label, i) => {
            const distance = Math.abs(i - activeIndex)
            const tier =
              distance === 0 ? 'is-active' : distance === 1 ? 'is-near' : distance === 2 ? 'is-far' : ''
            return (
              <span key={label} className={tier || undefined}>
                {label}
              </span>
            )
          })}
        </div>
      </div>
      <div className="develop-elite-digital-clock__day-dial-lens">{active}</div>
    </div>
  )
}

function DigitPair({
  value,
  variant,
  flashKey,
}: {
  value: string
  variant: 'primary' | 'accent'
  flashKey: string
}) {
  const [flash, setFlash] = useState(false)
  const prevKey = useRef(flashKey)

  useEffect(() => {
    if (prevKey.current === flashKey) return
    prevKey.current = flashKey
    setFlash(true)
    const id = window.setTimeout(() => setFlash(false), 260)
    return () => window.clearTimeout(id)
  }, [flashKey])

  const a = value[0] ?? '0'
  const b = value[1] ?? '0'

  return (
    <span className={`develop-elite-digital-clock__pair${flash ? ' is-flash' : ''}`}>
      <DevelopEliteSevenSegmentDigit char={a} variant={variant} />
      <DevelopEliteSevenSegmentDigit char={b} variant={variant} />
    </span>
  )
}

function DevelopEliteHeaderDigitalClockInner() {
  const [parts, setParts] = useState<DevelopEliteUaeClockParts>(() => getDevelopEliteUaeClockParts(new Date()))
  const [colonPulse, setColonPulse] = useState(true)

  useEffect(() => {
    const tick = () => {
      setParts(getDevelopEliteUaeClockParts(new Date()))
      setColonPulse(p => !p)
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const ariaLabel = formatDevelopEliteUaeClockAriaLabel(parts)
  const seconds = Number(parts.seconds) || 0
  const driftPx = Math.sin((seconds * Math.PI) / 30) * 1.1

  return (
    <div className="develop-elite-digital-clock" role="timer" aria-label={ariaLabel} aria-live="off">
      <DevelopEliteWeekdayDial activeIndex={parts.weekdayIndex} driftPx={driftPx} />
      <div className="develop-elite-digital-clock__face">
        <div className="develop-elite-digital-clock__time">
          <DigitPair value={parts.hours} variant="primary" flashKey={parts.hours} />
          <DevelopEliteSevenSegmentColon pulse={colonPulse} />
          <DigitPair value={parts.minutes} variant="primary" flashKey={parts.minutes} />
          <DevelopEliteSevenSegmentColon pulse={colonPulse} />
          <DigitPair value={parts.seconds} variant="accent" flashKey={parts.seconds} />
        </div>
        <div className="develop-elite-digital-clock__meta" aria-hidden>
          <span className="develop-elite-digital-clock__tz">UAE</span>
          <span className="develop-elite-digital-clock__date">{parts.monthDay}</span>
        </div>
      </div>
    </div>
  )
}

export const DevelopEliteHeaderDigitalClock = memo(DevelopEliteHeaderDigitalClockInner)
