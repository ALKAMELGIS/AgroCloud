import { createPortal } from 'react-dom'
import type { DashboardLayoutDropIntent, DashboardLayoutDropZone } from './agroCloudDashboardBodyLayout'
import { layoutDropHint } from './agroCloudDashboardBodyLayout'
import { DASHBOARD_LAYOUT_SOFT_GAP_PX } from './dashboardLayoutDragEngine'

type Props = {
  visible: boolean
  zone: DashboardLayoutDropZone | null
  intent: DashboardLayoutDropIntent | null
  precisionMode?: boolean
  softGapPx?: number
  snapped?: boolean
}

export function DashboardLayoutDropOverlay({
  visible,
  zone,
  intent,
  precisionMode = false,
  softGapPx = 0,
  snapped = false,
}: Props) {
  if (!visible || !zone || !intent) return null

  const isGroup = intent.type === 'group'
  const isStack = intent.type === 'stack'
  const toneClass = isGroup ? ' is-group' : isStack ? ' is-stack' : ' is-dock'
  const precisionClass = precisionMode ? ' is-precision' : ''
  const snappedClass = snapped ? ' is-snapped' : ''
  const gap = softGapPx || (precisionMode && intent.type === 'dock' ? DASHBOARD_LAYOUT_SOFT_GAP_PX : 0)

  return (
    <div
      className={`agrocloud-dashboard-layout-drop${toneClass}${precisionClass}${snappedClass}`}
      aria-hidden
    >
      <span className={`agrocloud-dashboard-layout-drop__edge agrocloud-dashboard-layout-drop__edge--top${zone === 'top' ? ' is-active' : ''}`}>
        {zone === 'top' && gap ? <span className="agrocloud-dashboard-layout-drop__soft-gap" style={{ height: gap }} /> : null}
      </span>
      <span className={`agrocloud-dashboard-layout-drop__edge agrocloud-dashboard-layout-drop__edge--bottom${zone === 'bottom' ? ' is-active' : ''}`}>
        {zone === 'bottom' && gap ? <span className="agrocloud-dashboard-layout-drop__soft-gap" style={{ height: gap }} /> : null}
      </span>
      <span className={`agrocloud-dashboard-layout-drop__edge agrocloud-dashboard-layout-drop__edge--left${zone === 'left' ? ' is-active' : ''}`}>
        {zone === 'left' && gap ? <span className="agrocloud-dashboard-layout-drop__soft-gap" style={{ width: gap }} /> : null}
      </span>
      <span className={`agrocloud-dashboard-layout-drop__edge agrocloud-dashboard-layout-drop__edge--right${zone === 'right' ? ' is-active' : ''}`}>
        {zone === 'right' && gap ? <span className="agrocloud-dashboard-layout-drop__soft-gap" style={{ width: gap }} /> : null}
      </span>
      <span className={`agrocloud-dashboard-layout-drop__center${zone === 'center' ? ' is-active' : ''}`}>
        {layoutDropHint(intent)}
        {precisionMode ? <span className="agrocloud-dashboard-layout-drop__precision">Shift · Snap</span> : null}
      </span>
    </div>
  )
}

type GhostProps = {
  label: string
  iconClass: string
  x: number
  y: number
  precisionMode: boolean
}

export function DashboardLayoutDragGhost({ label, iconClass, x, y, precisionMode }: GhostProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className={`agrocloud-dashboard-layout-ghost${precisionMode ? ' is-precision' : ''}`}
      style={{ transform: `translate(${x + 12}px, ${y + 12}px)` }}
      aria-hidden
    >
      <i className={iconClass} aria-hidden />
      <span>{label}</span>
    </div>,
    document.body,
  )
}
