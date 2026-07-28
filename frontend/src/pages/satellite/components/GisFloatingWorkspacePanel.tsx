import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useEffect } from 'react';
import { useGisFloatingPanel, type GisPanelDock } from '../hooks/useGisFloatingPanel';
import './GisFloatingWorkspacePanel.css';

export type GisFloatingWorkspacePanelProps = {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  storageKey: string;
  panelId: string;
  title: string;
  subtitle?: string;
  layerIcon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  /** Preferred dock when no saved layout exists (ArcGIS Online–style bottom for symbology). */
  defaultDock?: GisPanelDock;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  onBack?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

export function GisFloatingWorkspacePanel({
  open,
  onClose,
  containerRef,
  storageKey,
  panelId,
  title,
  subtitle = 'Styles',
  layerIcon,
  children,
  footer,
  defaultWidth,
  defaultHeight,
  defaultDock = 'float',
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  onBack,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search settings…',
}: GisFloatingWorkspacePanelProps) {
  const fp = useGisFloatingPanel({
    open,
    storageKey,
    containerRef,
    defaultWidth,
    defaultHeight,
    defaultDock,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { panel } = fp;
  const sideDocked = panel.dock === 'left' || panel.dock === 'right';
  const bottomDocked = panel.dock === 'bottom';
  const docked = sideDocked || bottomDocked;
  const style = {
    zIndex: fp.zIndex,
    ...(panel.dock === 'float' && !panel.maximized
      ? { left: panel.x, top: panel.y, width: panel.w, height: panel.minimized ? undefined : panel.h }
      : {}),
    ...(panel.dock === 'left' ? { left: 0, top: 0, width: panel.w, height: panel.h } : {}),
    ...(panel.dock === 'right' ? { right: 0, top: 0, left: 'auto', width: panel.w, height: panel.h } : {}),
    ...(panel.dock === 'bottom'
      ? {
          left: 0,
          right: 0,
          top: 'auto',
          bottom: 0,
          width: '100%',
          height: panel.minimized ? undefined : panel.h,
        }
      : {}),
    ...(panel.maximized ? { left: panel.x, top: panel.y, width: panel.w, height: panel.h } : {}),
  } as CSSProperties;

  const floatResizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
  const resizeHandles = bottomDocked ? (['n'] as const) : sideDocked ? ([] as const) : floatResizeHandles;

  const dockTitle =
    panel.dock === 'right' ? 'Undock' : panel.dock === 'left' ? 'Undock' : 'Dock right';

  return (
    <aside
      ref={fp.rootRef}
      id={panelId}
      className={[
        'gis-float-panel',
        fp.dragging ? 'gis-float-panel--dragging' : '',
        fp.resizing ? 'gis-float-panel--resizing' : '',
        panel.minimized ? 'gis-float-panel--minimized' : '',
        panel.maximized ? 'gis-float-panel--maximized' : '',
        docked ? `gis-float-panel--dock-${panel.dock}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="dialog"
      aria-label={title}
      aria-modal="false"
      onMouseDown={fp.bringToFront}
    >
      <div className="gis-float-panel__chrome">
        <header
          className="gis-float-panel__header"
          onPointerDown={fp.onDragPointerDown}
          onPointerMove={fp.onDragPointerMove}
          onPointerUp={fp.endDrag}
          onPointerCancel={fp.endDrag}
          onDoubleClick={fp.onHeaderDoubleClick}
          title={
            bottomDocked
              ? 'Docked to bottom · drag the top edge to resize'
              : 'Drag to move · double-click to maximize'
          }
        >
          <span className="gis-float-panel__grip" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2" />
              <circle cx="10" cy="3" r="1.2" />
              <circle cx="4" cy="7" r="1.2" />
              <circle cx="10" cy="7" r="1.2" />
              <circle cx="4" cy="11" r="1.2" />
              <circle cx="10" cy="11" r="1.2" />
            </svg>
          </span>
          {layerIcon ? <span className="gis-float-panel__layer-icon">{layerIcon}</span> : null}
          <div className="gis-float-panel__titles">
            <span className="gis-float-panel__layer-name">{title}</span>
            <span className="gis-float-panel__subtitle">{subtitle}</span>
          </div>
          {onSearchChange ? (
            <label className="gis-float-panel__search" data-drag-exclude>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                type="search"
                value={searchValue ?? ''}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search settings"
              />
            </label>
          ) : null}
          <div className="gis-float-panel__winbtns" data-drag-exclude>
            {onBack ? (
              <button type="button" className="gis-float-panel__winbtn" onClick={onBack} title="Back" aria-label="Back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="gis-float-panel__winbtn"
              onClick={() => fp.toggleDock(panel.dock === 'right' ? 'float' : 'right')}
              title={dockTitle}
              aria-label={dockTitle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M15 4v16" />
              </svg>
            </button>
            <button
              type="button"
              className="gis-float-panel__winbtn"
              onClick={fp.toggleMinimize}
              title={panel.minimized ? 'Restore' : 'Minimize'}
              aria-label={panel.minimized ? 'Restore panel' : 'Minimize panel'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className="gis-float-panel__winbtn"
              onClick={fp.toggleMaximize}
              title={panel.maximized ? 'Restore size' : 'Maximize'}
              aria-label={panel.maximized ? 'Restore panel size' : 'Maximize panel'}
            >
              {panel.maximized ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3H3v14h14v-5h3V3H8z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="5" width="14" height="14" rx="1" />
                </svg>
              )}
            </button>
            <button type="button" className="gis-float-panel__winbtn gis-float-panel__winbtn--close" onClick={onClose} title="Close" aria-label="Close panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        {!panel.minimized ? (
          <>
            <div className="gis-float-panel__body">{children}</div>
            {footer ? <footer className="gis-float-panel__footer">{footer}</footer> : null}
          </>
        ) : null}

        {!panel.minimized
          ? resizeHandles.map(dir => (
              <div
                key={dir}
                className={`gis-float-panel__resize gis-float-panel__resize--${dir}`}
                data-drag-exclude
                onPointerDown={fp.onResizePointerDown(dir)}
                onPointerMove={fp.onResizePointerMove}
                onPointerUp={fp.endResize}
                onPointerCancel={fp.endResize}
                aria-hidden
              />
            ))
          : null}
      </div>
    </aside>
  );
}
