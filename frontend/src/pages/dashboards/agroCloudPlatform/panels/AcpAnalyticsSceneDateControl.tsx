import { useCallback, useMemo, useRef } from 'react'
import { resolveNearestValidSceneDate } from '../../../../lib/siAdaptiveTemporalEngine'

type Props = {
  sceneDates: string[]
  sceneDate: string
  onSceneDateChange: (date: string) => void
  loading?: boolean
}

function snapSceneDateToCatalog(picked: string, sceneDates: string[]): string {
  const want = picked.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) return want
  if (!sceneDates.length || sceneDates.includes(want)) return want
  return resolveNearestValidSceneDate(want, sceneDates, 9999) ?? sceneDates[0] ?? want
}

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return
  input.focus({ preventScroll: true })
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    /* fall through */
  }
  input.click()
}

export function AcpAnalyticsSceneDateControl({
  sceneDates,
  sceneDate,
  onSceneDateChange,
  loading = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const newest = sceneDates[0] ?? sceneDate
  const oldest = sceneDates[sceneDates.length - 1] ?? sceneDate
  const minDate = useMemo(() => {
    if (sceneDates.length >= 2) return oldest
    const anchor = newest || sceneDate
    const end = new Date(`${anchor}T12:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 120)
    return end.toISOString().slice(0, 10)
  }, [newest, oldest, sceneDate, sceneDates.length])
  const maxDate = newest || sceneDate
  const isLatest = sceneDate === newest

  const openPicker = useCallback(() => {
    openNativeDatePicker(inputRef.current)
  }, [])

  const handleDateChange = useCallback(
    (raw: string) => {
      onSceneDateChange(snapSceneDateToCatalog(raw, sceneDates))
    },
    [onSceneDateChange, sceneDates],
  )

  return (
    <div className="acp-analytics-scene-date">
      <button
        type="button"
        className={`acp-analytics-scene-date__btn${loading ? ' is-loading' : ''}`}
        title={`Scene date · ${sceneDate}${isLatest ? ' (latest)' : ''}`}
        aria-label="Select scene date for vegetation distribution"
        aria-busy={loading}
        onClick={openPicker}
      >
        <i className="fa-regular fa-calendar-days" aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="date"
        className="acp-analytics-scene-date__input"
        value={sceneDate}
        min={minDate}
        max={maxDate}
        onChange={e => handleDateChange(e.target.value)}
        aria-label="Pick scene date"
        aria-busy={loading}
      />
    </div>
  )
}
