import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ElementType,
  type HTMLAttributes,
} from 'react'

type Edge = 'left' | 'right' | 'top' | 'bottom'

type ShellProps = {
  className?: string
  children: ReactNode
  as?: ElementType
} & HTMLAttributes<HTMLElement>

/** Hover host for resize handles (ArcGIS-style). */
export function DevelopEliteResizeHost({ className = '', children, as: Tag = 'div', ...rest }: ShellProps) {
  return (
    <Tag className={`develop-elite-resize-host${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  )
}

type HandleProps = {
  edge: Edge
  label: string
  /** Called with pointer deltas while dragging. */
  onDrag: (deltaX: number, deltaY: number) => void
  onDragEnd?: () => void
}

export function DevelopEliteResizeHandle({ edge, label, onDrag, onDragEnd }: HandleProps) {
  const [active, setActive] = useState(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      setActive(true)
      document.body.classList.add('develop-elite--resizing')
      let lastX = e.clientX
      let lastY = e.clientY

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX
        const dy = ev.clientY - lastY
        lastX = ev.clientX
        lastY = ev.clientY
        onDrag(dx, dy)
      }

      const onUp = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId)
        } catch {
          /* already released */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setActive(false)
        document.body.classList.remove('develop-elite--resizing')
        onDragEnd?.()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [onDrag, onDragEnd],
  )

  return (
    <button
      type="button"
      className={`develop-elite-resize-handle develop-elite-resize-handle--${edge}${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
    />
  )
}
