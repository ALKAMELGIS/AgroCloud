import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import type { AgroCloudDashboardConfig, AgroCloudDashboardElement } from './agroCloudDashboardData'
import type { DashboardBodyLayoutNode, DashboardLayoutDropIntent } from './agroCloudDashboardBodyLayout'
import { dashboardElementIcon } from './agroCloudDashboardCanvasUtils'
import { DashboardLayoutDragGhost, DashboardLayoutDropOverlay } from './DashboardLayoutDropOverlay'
import { useDashboardLayoutDrag } from './useDashboardLayoutDrag'

export type BodyLayoutWidgetRenderProps = {
  el: AgroCloudDashboardElement
  compactChrome?: boolean
  className?: string
  dragState?: 'source' | 'target' | null
  onBeginLayoutDrag?: (elementId: string, clientX: number, clientY: number, shiftKey: boolean) => void
}

type Props = {
  layout: DashboardBodyLayoutNode | null
  config: AgroCloudDashboardConfig
  editMode?: boolean
  bodyIsMapOnly?: boolean
  renderWidget: (props: BodyLayoutWidgetRenderProps) => ReactNode
  onLayoutDrop?: (draggedElementId: string, targetElementId: string, intent: DashboardLayoutDropIntent) => void
}

type StackPanelProps = {
  node: Extract<DashboardBodyLayoutNode, { kind: 'stack' }>
  elementById: (id: string) => AgroCloudDashboardElement | undefined
  wrapElement: (el: AgroCloudDashboardElement, compactChrome?: boolean) => ReactNode
  editMode: boolean
  bodyIsMapOnly: boolean
}

function StackPanel({ node, elementById, wrapElement, editMode, bodyIsMapOnly }: StackPanelProps) {
  const [activeIndex, setActiveIndex] = useState(node.activeIndex)
  const tabs = node.children
    .map(child => (child.kind === 'element' ? elementById(child.elementId) : null))
    .filter(Boolean) as AgroCloudDashboardElement[]
  const active = Math.min(Math.max(activeIndex, 0), Math.max(tabs.length - 1, 0))
  const activeEl = tabs[active]
  if (!activeEl) return null

  return (
    <div className="agrocloud-dashboard-layout-stack">
      {editMode && tabs.length > 1 ? (
        <div className="agrocloud-dashboard-layout-stack__tabs" role="tablist">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              className={`agrocloud-dashboard-layout-stack__tab${index === active ? ' is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="agrocloud-dashboard-layout-stack__body">
        {wrapElement(activeEl, bodyIsMapOnly && activeEl.kind === 'map')}
      </div>
    </div>
  )
}

export function AgroCloudDashboardBodyLayoutView({
  layout,
  config,
  editMode = false,
  bodyIsMapOnly = false,
  renderWidget,
  onLayoutDrop,
}: Props) {
  const { draggingId, ghostPos, dropTarget, precisionMode, beginDrag, registerHost, isDragging } = useDashboardLayoutDrag({
    editMode,
    onLayoutDrop,
  })

  const elementById = (id: string) => config.elements.find(el => el.id === id)

  const setHostRef = useCallback(
    (elementId: string) => (node: HTMLDivElement | null) => {
      registerHost(elementId, node)
    },
    [registerHost],
  )

  const wrapElement = (el: AgroCloudDashboardElement, compactChrome = false) => {
    const isSource = draggingId === el.id
    const isTarget = dropTarget?.targetElementId === el.id
    const hover = isTarget ? dropTarget : null

    return (
      <div
        key={el.id}
        ref={setHostRef(el.id)}
        className={`agrocloud-dashboard-layout-element-host${isSource ? ' is-drag-source' : ''}${
          isTarget ? ' is-drop-target' : ''
        }${hover?.precisionMode ? ' is-precision-target' : ''}`}
        style={
          isTarget && hover?.softGapPx
            ? ({ ['--layout-soft-gap' as string]: `${hover.softGapPx}px` } as CSSProperties)
            : undefined
        }
      >
        {renderWidget({
          el,
          compactChrome: compactChrome || (bodyIsMapOnly && el.kind === 'map'),
          className: el.kind === 'map' ? ' agrocloud-dashboard-canvas__widget--wide agrocloud-dashboard-canvas__widget--map' : undefined,
          dragState: isSource ? 'source' : isTarget ? 'target' : null,
          onBeginLayoutDrag: editMode && onLayoutDrop ? beginDrag : undefined,
        })}
        {isTarget && hover ? (
          <DashboardLayoutDropOverlay
            visible
            intent={hover.intent}
            zone={hover.zone}
            precisionMode={hover.precisionMode}
            softGapPx={hover.softGapPx}
            snapped={hover.snapped}
          />
        ) : null}
      </div>
    )
  }

  const renderNode = (node: DashboardBodyLayoutNode): ReactNode => {
    if (node.kind === 'element') {
      const el = elementById(node.elementId)
      if (!el) return null
      return wrapElement(el)
    }

    if (node.kind === 'stack') {
      return (
        <StackPanel
          node={node}
          elementById={elementById}
          wrapElement={wrapElement}
          editMode={editMode}
          bodyIsMapOnly={bodyIsMapOnly}
        />
      )
    }

    const directionClass =
      node.direction === 'row'
        ? 'agrocloud-dashboard-layout-split--row'
        : 'agrocloud-dashboard-layout-split--column'
    const groupClass = node.kind === 'group' ? ' agrocloud-dashboard-layout-split--group' : ''
    const gapPreview = isDragging && dropTarget?.softGapPx ? ' agrocloud-dashboard-layout-split--soft-gap' : ''

    return (
      <div className={`agrocloud-dashboard-layout-split ${directionClass}${groupClass}${gapPreview}`}>
        {node.children.map((child, index) => (
          <div
            key={`${node.kind}-${index}`}
            className="agrocloud-dashboard-layout-pane"
            style={{ flex: `${node.sizes[index] ?? 100 / node.children.length} 1 0` }}
          >
            {renderNode(child)}
          </div>
        ))}
      </div>
    )
  }

  if (!layout) return null

  const ghostEl = draggingId ? elementById(draggingId) : null

  return (
    <div className={`agrocloud-dashboard-layout-root${isDragging ? ' is-dragging' : ''}`}>
      {renderNode(layout)}
      {ghostEl ? (
        <DashboardLayoutDragGhost
          label={ghostEl.label}
          iconClass={dashboardElementIcon(ghostEl.kind)}
          x={ghostPos.x}
          y={ghostPos.y}
          precisionMode={precisionMode}
        />
      ) : null}
    </div>
  )
}
