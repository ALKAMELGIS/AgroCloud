import { useEffect, useId, useRef, useState } from 'react'

export type SiRsPanelSelectOption = {
  id: string
  label: string
}

type SiRsPanelSelectProps = {
  options: readonly SiRsPanelSelectOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  'aria-label'?: string
}

export function SiRsPanelSelect({
  options,
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: SiRsPanelSelectProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = options.find(o => o.id === value) ?? options[0]
  const selectedLabel = selected?.label ?? value

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`si-rs-layer-select si-rs-panel-select${open ? ' is-open' : ''}${disabled ? ' si-rs-layer-select--disabled' : ''}`}
    >
      <button
        type="button"
        className="si-rs-layer-select__trigger si-rs-panel__select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        title={selectedLabel}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="si-rs-layer-select__abbr">{selectedLabel}</span>
        <span className="si-rs-layer-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div id={listboxId} className="si-rs-layer-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map(opt => {
            const active = opt.id === value
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`si-rs-layer-select__option${active ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
              >
                <span className="si-rs-layer-select__abbr">{opt.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default SiRsPanelSelect
