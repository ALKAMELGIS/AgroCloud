import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IMAGERY_TIME_AGGREGATION_OPTIONS,
  type ImageryTimeAggregation,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type SiImageryPeriodSelectProps = {
  value: ImageryTimeAggregation
  onChange: (value: ImageryTimeAggregation) => void
  disabled?: boolean
  disabledTitle?: string
}

export function SiImageryPeriodSelect({
  value,
  onChange,
  disabled,
  disabledTitle,
}: SiImageryPeriodSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const label =
    IMAGERY_TIME_AGGREGATION_OPTIONS.find(o => o.id === value)?.label ?? 'Day'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handlePick = useCallback(
    (id: ImageryTimeAggregation) => {
      onChange(id)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <div className="acp-ts__field acp-ts__field--period">
      <span>Period</span>
      <div className="acp-ts-period" ref={rootRef}>
        <button
          type="button"
          className="acp-ts-period__trigger"
          disabled={disabled}
          title={disabled ? disabledTitle : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Period: ${label}`}
          onClick={() => !disabled && setOpen(v => !v)}
        >
          <span>{label}</span>
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {open ? (
          <ul className="acp-ts-period__menu" role="listbox" aria-label="Time aggregation">
            {IMAGERY_TIME_AGGREGATION_OPTIONS.map(option => (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  className={`acp-ts-period__item${value === option.id ? ' is-on' : ''}`}
                  onClick={() => handlePick(option.id)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
