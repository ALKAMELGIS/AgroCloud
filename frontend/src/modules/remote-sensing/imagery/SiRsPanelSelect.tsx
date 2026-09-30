import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSiRsSelectMenuPosition } from './useSiRsSelectMenuPosition'

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const menuStyle = useSiRsSelectMenuPosition(open, triggerRef, {
    minWidth: 200,
    maxHeightCap: 480,
  })

  const selected = options.find(o => o.id === value) ?? options[0]
  const selectedLabel = selected?.label ?? value

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const t = event.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
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
        ref={triggerRef}
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

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              className="si-rs-layer-select__menu si-rs-layer-select__menu--portal si-rs-panel-select__menu"
              role="listbox"
              aria-label={ariaLabel}
              style={menuStyle}
            >
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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default SiRsPanelSelect
