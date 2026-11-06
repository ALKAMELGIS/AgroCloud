import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import type { DevelopEliteWidgetPosition } from './developEliteLayoutConfig'

type DragContextValue = {
  canvasRef: RefObject<HTMLDivElement | null>
  floatLayerRef: RefObject<HTMLDivElement | null>
  widgetFloat: Record<string, DevelopEliteWidgetPosition>
  setWidgetFloat: (widgetId: string, position: DevelopEliteWidgetPosition | null) => void
  persistFloat: () => void
  snapGridPct: number
}

const DevelopEliteDragContext = createContext<DragContextValue | null>(null)

export function useDevelopEliteDrag(): DragContextValue {
  const ctx = useContext(DevelopEliteDragContext)
  if (!ctx) throw new Error('useDevelopEliteDrag must be used within DevelopEliteDragProvider')
  return ctx
}

export function useDevelopEliteDragOptional(): DragContextValue | null {
  return useContext(DevelopEliteDragContext)
}

type ProviderProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  widgetFloat: Record<string, DevelopEliteWidgetPosition>
  onWidgetFloatChange: (
    updater: (prev: Record<string, DevelopEliteWidgetPosition>) => Record<string, DevelopEliteWidgetPosition>,
  ) => void
  onPersist: () => void
  snapGridPct?: number
}

export function DevelopEliteDragProvider({
  children,
  className = '',
  style,
  widgetFloat,
  onWidgetFloatChange,
  onPersist,
  snapGridPct = 2,
}: ProviderProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const floatLayerRef = useRef<HTMLDivElement | null>(null)

  const setWidgetFloat = useCallback(
    (widgetId: string, position: DevelopEliteWidgetPosition | null) => {
      onWidgetFloatChange(prev => {
        const next = { ...prev }
        if (position) next[widgetId] = position
        else delete next[widgetId]
        return next
      })
    },
    [onWidgetFloatChange],
  )

  const value = useMemo(
    () => ({
      canvasRef,
      floatLayerRef,
      widgetFloat,
      setWidgetFloat,
      persistFloat: onPersist,
      snapGridPct,
    }),
    [onPersist, setWidgetFloat, snapGridPct, widgetFloat],
  )

  return (
    <DevelopEliteDragContext.Provider value={value}>
      <div
        ref={canvasRef}
        className={`develop-elite--drag-canvas${className ? ` ${className}` : ''}`}
        style={style}
      >
        {children}
        <div ref={floatLayerRef} className="develop-elite__float-layer" aria-label="Floating widgets" />
      </div>
    </DevelopEliteDragContext.Provider>
  )
}

export function snapDevelopElitePercent(value: number, gridPct: number): number {
  if (gridPct <= 0) return value
  return Math.round(value / gridPct) * gridPct
}
