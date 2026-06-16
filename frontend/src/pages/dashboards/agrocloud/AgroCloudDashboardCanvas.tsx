import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { AgroCloudDashboardConfig, AgroCloudDashboardElement, AgroCloudDashboardElementKind } from './agroCloudDashboardData'
import { DashboardAddElementMenu } from './DashboardAddElementMenu'
import { AGROCLOUD_TIME_ZONE_OPTIONS } from './agroCloudDashboardTimeRegion'
import { dashboardThemeCanvasStyle, resolveAgroCloudThemeCustom } from './agroCloudDashboardTheme'
import { formatDashboardDateTime, dashboardTimeZoneCaption } from './agroCloudDashboardTimeRegion'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import {
  classifyDashboardElements,
  dashboardElementIcon,
  widgetMetaLine,
  widgetPreviewValue,
} from './agroCloudDashboardCanvasUtils'
import { resolveDashboardHeader, resolveDashboardHeaderTitle, resolveDashboardSidebar } from './agroCloudDashboardLayout'
import { AgroCloudDashboardMapPreview } from './AgroCloudDashboardMapPreview'
import { defaultMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'
import { DashboardElementMenu } from './DashboardElementMenu'
import { AgroCloudDashboardBodyLayoutView } from './AgroCloudDashboardBodyLayoutView'
import { bodyLayoutIsSingleMap, resolveBodyLayout } from './agroCloudDashboardBodyLayout'
import type { DashboardLayoutDropIntent } from './agroCloudDashboardBodyLayout'
import { useDashboardElementResize } from './useDashboardElementResize'
import {
  indicatorFontSizePx,
  indicatorSettingsFromElement,
  resolveIndicatorCalculatedValue,
  resolveIndicatorDisplayText,
} from './agroCloudDashboardIndicatorWidgetSettings'

type Props = {
  config: AgroCloudDashboardConfig
  title?: string
  /** Independent canvas add flow: + trigger then element menu, then map opens Add data. */
  onElementSelect?: (kind: AgroCloudDashboardElementKind, label: string) => void
  /** Open element configuration (map → ConfigureMapWidgetModal). */
  onElementConfigure?: (elementId: string) => void
  onElementDuplicate?: (elementId: string) => void
  onElementDelete?: (elementId: string) => void
  onElementResize?: (elementId: string, size: { width?: number; height?: number }) => void
  onLayoutDrop?: (draggedElementId: string, targetElementId: string, intent: DashboardLayoutDropIntent) => void
  /** @deprecated Use onLayoutDrop for body canvas docking. */
  onElementReorder?: (draggedElementId: string, beforeElementId: string | null) => void
  /** Show ArcGIS-style element menu on widget hover (edit mode). */
  editMode?: boolean
  className?: string
}

function WidgetChrome({
  el,
  theme,
  children,
  className,
  editMode,
  compactChrome,
  onConfigure,
  onDuplicate,
  onDelete,
  onDropBefore,
  dragState,
  onBeginLayoutDrag,
  onBeginResize,
  isResizing,
  liveSize,
  registerCardRef,
}: {
  el: AgroCloudDashboardElement
  theme: ReturnType<typeof resolveAgroCloudThemeCustom>
  children: ReactNode
  className?: string
  editMode?: boolean
  compactChrome?: boolean
  onConfigure?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onDropBefore?: (draggedElementId: string) => void
  dragState?: 'source' | 'target' | null
  onBeginLayoutDrag?: (elementId: string, clientX: number, clientY: number, shiftKey: boolean) => void
  onBeginResize?: (elementId: string, clientX: number, clientY: number, pointerId?: number) => void
  isResizing?: boolean
  liveSize?: { width?: number; height?: number } | null
  registerCardRef?: (node: HTMLElement | null) => void
}) {
  const meta = widgetMetaLine(el)
  const showMenu = editMode && onConfigure && onDuplicate && onDelete
  const dragClass =
    dragState === 'source' ? ' is-dragging-source' : dragState === 'target' ? ' is-dragging-target' : ''
  const sizeStyle: CSSProperties = {}
  const width = liveSize?.width ?? el.size?.width
  const height = liveSize?.height ?? el.size?.height
  if (typeof width === 'number') sizeStyle.width = width
  if (typeof height === 'number') sizeStyle.height = height
  const hasCustomSize = typeof width === 'number' || typeof height === 'number'

  const startResize = (clientX: number, clientY: number, pointerId?: number) => {
    onBeginResize?.(el.id, clientX, clientY, pointerId)
  }

  return (
    <article
      ref={registerCardRef}
      className={`agrocloud-dashboard-canvas__widget agrocloud-dashboard-canvas__widget--${el.kind}${
        compactChrome ? ' agrocloud-dashboard-canvas__widget--compact' : ''
      }${dragClass}${isResizing ? ' is-resizing' : ''}${hasCustomSize ? ' has-custom-size' : ''}${className ? ` ${className}` : ''}`}
      style={{
        background: theme.widgetBackground,
        opacity: theme.widgetOpacity / 100,
        borderRadius: theme.borderRadius,
        boxShadow: theme.showShadows ? '0 1px 4px rgba(0,0,0,0.12)' : undefined,
        backdropFilter: theme.blurEffects ? 'blur(6px)' : undefined,
        ...sizeStyle,
      }}
      onDragOver={e => {
        if (!editMode || !onDropBefore) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={e => {
        if (!editMode || !onDropBefore || onBeginLayoutDrag) return
        e.preventDefault()
      }}
    >
      {showMenu ? (
        <DashboardElementMenu
          elementId={el.id}
          onConfigure={onConfigure}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onBeginLayoutDrag={onBeginLayoutDrag}
          onBeginResize={
            onBeginResize
              ? (elementId, clientX, clientY, pointerId) => {
                  if (elementId !== el.id) return
                  startResize(clientX, clientY, pointerId)
                }
              : undefined
          }
        />
      ) : null}
      {!compactChrome ? (
        <header className="agrocloud-dashboard-canvas__widget-head">
          <i className={dashboardElementIcon(el.kind)} aria-hidden />
          <span>{el.label}</span>
        </header>
      ) : null}
      <div className="agrocloud-dashboard-canvas__widget-body">{children}</div>
      {!compactChrome && meta ? (
        <footer className="agrocloud-dashboard-canvas__widget-meta">{meta}</footer>
      ) : null}
      {!compactChrome && !meta && el.gisContentId ? (
        <footer className="agrocloud-dashboard-canvas__widget-meta">
          {getGisContentRowById(el.gisContentId)?.typeLabel ?? 'GIS Content'}
        </footer>
      ) : null}
      {editMode && onBeginResize ? (
        <button
          type="button"
          className="agrocloud-dashboard-canvas__widget-resize"
          aria-label="Resize card"
          title="Resize card"
          onPointerDown={e => {
            if (e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            startResize(e.clientX, e.clientY, e.pointerId)
          }}
        >
          <span className="agrocloud-dashboard-canvas__widget-resize-grip" aria-hidden />
        </button>
      ) : null}
    </article>
  )
}

function renderWidgetBody(el: AgroCloudDashboardElement, config: AgroCloudDashboardConfig, accent: string) {
  if (el.kind === 'map') {
    if (el.gisContentId) {
      return (
        <div className="agrocloud-dashboard-canvas__map-host">
          <AgroCloudDashboardMapPreview
            gisContentId={el.gisContentId}
            title={el.label}
            mapSettings={el.mapSettings ?? defaultMapWidgetSettings(el.label)}
            interactive
          />
        </div>
      )
    }
    return (
      <div className="agrocloud-dashboard-canvas__map agrocloud-dashboard-canvas__map--empty">
        <p className="agrocloud-dashboard-canvas__map-empty-msg">Select a Web Map from GIS Content.</p>
      </div>
    )
  }

  if (el.kind === 'indicator') {
    const settings = indicatorSettingsFromElement(el)
    const calculated = resolveIndicatorCalculatedValue(el, settings, config)
    const top = settings.topText.visible ? resolveIndicatorDisplayText(settings.topText.text, calculated) : ''
    const middle = settings.middleText.visible
      ? resolveIndicatorDisplayText(settings.middleText.text, calculated)
      : calculated
    const bottom = settings.bottomText.visible ? resolveIndicatorDisplayText(settings.bottomText.text, calculated) : ''
    return (
      <div className="agrocloud-dashboard-canvas__indicator">
        {top ? (
          <span
            className="agrocloud-dashboard-canvas__indicator-top"
            style={{
              color: settings.topText.color,
              fontWeight: settings.topText.bold ? 700 : 400,
              fontSize: indicatorFontSizePx(settings.topText.fontSize),
            }}
          >
            {top}
          </span>
        ) : null}
        <span
          className="agrocloud-dashboard-canvas__indicator-value"
          style={{
            color: settings.middleText.color || accent,
            fontWeight: settings.middleText.bold ? 700 : 600,
            fontSize: indicatorFontSizePx(settings.middleText.fontSize === 'medium' ? 'large' : settings.middleText.fontSize),
          }}
        >
          {middle}
        </span>
        {bottom ? (
          <span
            className="agrocloud-dashboard-canvas__indicator-bottom"
            style={{
              color: settings.bottomText.color,
              fontWeight: settings.bottomText.bold ? 700 : 400,
              fontSize: indicatorFontSizePx(settings.bottomText.fontSize),
            }}
          >
            {bottom}
          </span>
        ) : null}
        {el.field && !settings.middleText.text.includes('{calculatedValue}') ? (
          <span className="agrocloud-dashboard-canvas__indicator-field">{el.field}</span>
        ) : null}
      </div>
    )
  }

  if (el.kind === 'gauge') {
    return (
      <div className="agrocloud-dashboard-canvas__indicator">
        <span className="agrocloud-dashboard-canvas__indicator-value" style={{ color: accent }}>
          {widgetPreviewValue(el, config)}
        </span>
        {el.field ? <span className="agrocloud-dashboard-canvas__indicator-field">{el.field}</span> : null}
      </div>
    )
  }

  if (el.kind === 'serial-chart') {
    return (
      <div className="agrocloud-dashboard-canvas__chart agrocloud-dashboard-canvas__chart--serial" aria-hidden>
        {[48, 72, 56, 88, 64].map((h, i) => (
          <span key={i} style={{ height: `${h}%`, background: i % 2 ? accent : `${accent}99` }} />
        ))}
      </div>
    )
  }

  if (el.kind === 'pie-chart') {
    return (
      <div className="agrocloud-dashboard-canvas__chart agrocloud-dashboard-canvas__chart--pie" aria-hidden>
        <span style={{ background: accent }} />
        <span style={{ background: `${accent}88` }} />
        <span style={{ background: `${accent}44` }} />
      </div>
    )
  }

  if (el.kind === 'list' || el.kind === 'table') {
    return (
      <ul className="agrocloud-dashboard-canvas__list">
        {['North field', 'South block', 'Irrigation zone'].map(row => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    )
  }

  if (el.kind === 'rich-text') {
    return <p className="agrocloud-dashboard-canvas__richtext">{el.label}</p>
  }

  if (el.kind === 'embedded') {
    return (
      <div className="agrocloud-dashboard-canvas__embedded">
        <i className="fa-regular fa-window-maximize" aria-hidden />
        <span>Embedded content</span>
      </div>
    )
  }

  return <p className="agrocloud-dashboard-canvas__details">{widgetPreviewValue(el, config)}</p>
}

export function AgroCloudDashboardCanvas({
  config,
  title = 'Untitled dashboard',
  onElementSelect,
  onElementConfigure,
  onElementDuplicate,
  onElementDelete,
  onElementResize,
  onLayoutDrop,
  onElementReorder,
  editMode = false,
  className,
}: Props) {
  const [canvasAddMenuOpen, setCanvasAddMenuOpen] = useState(false)
  const canvasAddWrapRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const elementResize = useDashboardElementResize({
    editMode: editMode && Boolean(onElementResize),
    onResizeCommit: onElementResize,
  })
  const theme = resolveAgroCloudThemeCustom(config.theme, config.themeCustom)
  const headerLayout = resolveDashboardHeader(config)
  const sidebarLayout = resolveDashboardSidebar(config)
  const { header, sidebar, body } = classifyDashboardElements(config.elements)
  const isEmpty = config.elements.length === 0 && !headerLayout.enabled && !sidebarLayout.enabled
  const layoutMode = config.layoutMode ?? 'desktop'
  const tzCaption = dashboardTimeZoneCaption(config)
  const liveClock = formatDashboardDateTime(config)
  const resolvedHeaderTitle = resolveDashboardHeaderTitle(headerLayout.title, title)
  const resolvedHeaderSubtitle = resolveDashboardHeaderTitle(headerLayout.subtitle, title)
  const showSidebarColumn = sidebarLayout.enabled || sidebar.length > 0

  const canvasStyle = {
    ...dashboardThemeCanvasStyle(config.theme, config.themeCustom),
    ['--dashboard-accent' as string]: theme.accentColor,
    ['--dashboard-primary' as string]: theme.primaryColor,
  }

  if (isEmpty) {
    return (
      <div
        className={`agrocloud-dashboard-canvas agrocloud-dashboard-canvas--empty${className ? ` ${className}` : ''}`}
        style={canvasStyle}
        aria-label="Dashboard preview"
      >
        <div className="agrocloud-dashboard-canvas__empty">
          <i className="fa-solid fa-table-cells-large agrocloud-dashboard-canvas__empty-icon" aria-hidden />
          <h2>Your dashboard is empty</h2>
          <p>Add elements from the toolbar to build your dashboard. Theme and regional settings preview here instantly.</p>
          <p className="agrocloud-dashboard-canvas__empty-meta">
            <span>{liveClock}</span>
            <span>{tzCaption}</span>
          </p>
          {onElementSelect ? (
            <div className="agrocloud-dashboard-add-wrap" ref={canvasAddWrapRef}>
              <button
                type="button"
                className={`agrocloud-dashboard-add-circle${canvasAddMenuOpen ? ' is-open' : ''}`}
                aria-label="Add dashboard element"
                aria-haspopup="menu"
                aria-expanded={canvasAddMenuOpen}
                onClick={() => setCanvasAddMenuOpen(open => !open)}
              >
                <i className="fa-solid fa-plus" aria-hidden />
              </button>
              <DashboardAddElementMenu
                open={canvasAddMenuOpen}
                anchorRef={canvasAddWrapRef}
                placement="below"
                onClose={() => setCanvasAddMenuOpen(false)}
                onSelect={(kind, label) => onElementSelect(kind, label)}
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const headerClass =
    theme.headerStyle === 'compact'
      ? ' agrocloud-dashboard-canvas__header--compact'
      : theme.headerStyle === 'branded'
        ? ' agrocloud-dashboard-canvas__header--branded'
        : ''
  const mobileClass = layoutMode === 'mobile' ? ' agrocloud-dashboard-canvas--mobile' : ''
  const bodyLayout = resolveBodyLayout(config)
  const bodyIsMapOnly = bodyLayoutIsSingleMap(bodyLayout, config.elements)
  const canvasClass =
    `${mobileClass}${className ? ` ${className}` : ''}${bodyIsMapOnly ? ' agrocloud-dashboard-canvas--map-full' : ''}`.trim()
  const layoutClass = `agrocloud-dashboard-canvas__layout${showSidebarColumn ? ' has-sidebar' : ''}${
    bodyIsMapOnly ? ' agrocloud-dashboard-canvas__layout--map-full' : ''
  }`

  const widgetChromeProps = (el: AgroCloudDashboardElement, compactChrome = false) => ({
    el,
    theme,
    editMode,
    compactChrome,
    onConfigure: onElementConfigure ? () => onElementConfigure(el.id) : undefined,
    onDuplicate: onElementDuplicate ? () => onElementDuplicate(el.id) : undefined,
    onDelete: onElementDelete ? () => onElementDelete(el.id) : undefined,
    onDropBefore: onElementReorder ? (draggedId: string) => onElementReorder(draggedId, el.id) : undefined,
    onBeginResize:
      editMode && onElementResize
        ? (elementId: string, clientX: number, clientY: number, pointerId?: number) => {
            const anchor = cardRefs.current.get(elementId)
            if (anchor) elementResize.beginResize(elementId, clientX, clientY, anchor)
          }
        : undefined,
    isResizing: elementResize.resizingId === el.id,
    liveSize: elementResize.liveSizeFor(el.id),
    registerCardRef: (node: HTMLElement | null) => {
      if (node) cardRefs.current.set(el.id, node)
      else cardRefs.current.delete(el.id)
    },
  })

  return (
    <div
      className={`agrocloud-dashboard-canvas${editMode ? ' agrocloud-dashboard-canvas--edit' : ''}${canvasClass ? ` ${canvasClass}` : ''}`}
      style={canvasStyle}
      aria-label="Dashboard preview"
    >
      {headerLayout.enabled ? (
        <header
          className={`agrocloud-dashboard-canvas__header agrocloud-dashboard-canvas__header--configured${
            headerLayout.headerMargin ? ' has-margin' : ''
          }`}
          style={{
            color: headerLayout.textColor,
            background: headerLayout.backgroundImageUrl
              ? `url(${headerLayout.backgroundImageUrl}) center/cover no-repeat`
              : headerLayout.foregroundColor,
          }}
        >
          <div className="agrocloud-dashboard-canvas__header-brand">
            {headerLayout.logoEnabled && headerLayout.logoUrl ? (
              <img src={headerLayout.logoUrl} alt="" className="agrocloud-dashboard-canvas__header-logo" />
            ) : headerLayout.logoEnabled ? (
              <span className="agrocloud-dashboard-canvas__logo">{theme.logoText}</span>
            ) : null}
            <div
              className={`agrocloud-dashboard-canvas__header-titles${
                headerLayout.subtitlePlacement === 'below' ? ' is-stacked' : ''
              }`}
            >
              <span className="agrocloud-dashboard-canvas__title">{resolvedHeaderTitle || title}</span>
              {resolvedHeaderSubtitle ? (
                <span className="agrocloud-dashboard-canvas__subtitle">{resolvedHeaderSubtitle}</span>
              ) : null}
            </div>
          </div>
          <div className="agrocloud-dashboard-canvas__header-meta">
            <span className="agrocloud-dashboard-canvas__clock">{liveClock}</span>
            <span className="agrocloud-dashboard-canvas__tz" title={tzCaption}>
              {tzCaption}
            </span>
            {headerLayout.menuEnabled ? (
              <button type="button" className="agrocloud-dashboard-canvas__menu-btn" aria-label="Menu">
                <i className="fa-solid fa-bars" aria-hidden />
              </button>
            ) : null}
            {config.badgeEnabled ? <span className="agrocloud-dashboard-canvas__badge">Elite AgroCloud</span> : null}
          </div>
        </header>
      ) : (
        <header className={`agrocloud-dashboard-canvas__header${headerClass}`}>
          <div className="agrocloud-dashboard-canvas__header-brand">
            <span className="agrocloud-dashboard-canvas__logo">{theme.logoText}</span>
            <span className="agrocloud-dashboard-canvas__title">{title}</span>
          </div>
          <div className="agrocloud-dashboard-canvas__header-meta">
            <span className="agrocloud-dashboard-canvas__clock">{liveClock}</span>
            <span className="agrocloud-dashboard-canvas__tz" title={tzCaption}>
              {tzCaption}
            </span>
            {config.badgeEnabled ? <span className="agrocloud-dashboard-canvas__badge">Elite AgroCloud</span> : null}
          </div>
        </header>
      )}

      {header.length > 0 ? (
        <section className="agrocloud-dashboard-canvas__header-widgets">
          {header.map(el => (
            <WidgetChrome key={el.id} {...widgetChromeProps(el)}>
              {renderWidgetBody(el, config, theme.accentColor)}
            </WidgetChrome>
          ))}
        </section>
      ) : null}

      <div className={layoutClass}>
        {showSidebarColumn ? (
          <aside className="agrocloud-dashboard-canvas__sidebar">
            {sidebar.length > 0 ? (
              sidebar.map(el => (
                <WidgetChrome key={el.id} {...widgetChromeProps(el)}>
                  {renderWidgetBody(el, config, theme.accentColor)}
                </WidgetChrome>
              ))
            ) : (
              <div className="agrocloud-dashboard-canvas__sidebar-empty">Sidebar</div>
            )}
          </aside>
        ) : null}
        <section className="agrocloud-dashboard-canvas__body">
          <AgroCloudDashboardBodyLayoutView
            layout={bodyLayout}
            config={config}
            editMode={editMode}
            bodyIsMapOnly={bodyIsMapOnly}
            onLayoutDrop={onLayoutDrop}
            renderWidget={({ el, compactChrome, className, dragState, onBeginLayoutDrag }) => (
              <WidgetChrome
                key={el.id}
                {...widgetChromeProps(el, compactChrome)}
                className={className}
                dragState={dragState}
                onBeginLayoutDrag={onBeginLayoutDrag}
              >
                {renderWidgetBody(el, config, theme.accentColor)}
              </WidgetChrome>
            )}
          />
        </section>
      </div>
    </div>
  )
}
