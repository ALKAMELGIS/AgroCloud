import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSiInstanceScope } from '../siInstanceScope';
import './satelliteGeoAiFloatingWidget.css';

const STORAGE_KEY = 'si-sat-geo-ai-widget-pos-v1';
const STORAGE_SIZE_KEY = 'si-sat-geo-ai-widget-size-v1';

type StoredPos = { x: number; y: number };
type StoredSize = { w: number; h: number };
type ResizeHandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 360, h: 460 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Compact by default; on small/mobile screens grow toward full so it always
  // fits the device. Always clamped to the viewport so it stays responsive.
  const compact = vw > 600;
  const w = compact ? Math.min(360, vw - 32) : Math.max(260, vw - 20);
  const h = compact
    ? Math.min(480, Math.max(300, Math.round(vh * 0.5)))
    : Math.min(Math.round(vh * 0.72), vh - 130);
  return { w: Math.round(Math.max(260, w)), h: Math.round(Math.max(280, h)) };
}

function readStoredPos(storageKey: string): StoredPos | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredPos).x === 'number' &&
      typeof (parsed as StoredPos).y === 'number'
    ) {
      return { x: (parsed as StoredPos).x, y: (parsed as StoredPos).y };
    }
  } catch {
    // ignore
  }
  return null;
}

function readStoredSize(storageKey: string): StoredSize | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredSize).w === 'number' &&
      typeof (parsed as StoredSize).h === 'number'
    ) {
      return { w: (parsed as StoredSize).w, h: (parsed as StoredSize).h };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredPos(pos: StoredPos, storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function writeStoredSize(size: StoredSize, storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    // ignore
  }
}

function maxPanelSize(): StoredSize {
  if (typeof window === 'undefined') return { w: 720, h: 900 };
  return {
    w: Math.max(320, window.innerWidth - 16),
    h: Math.max(360, window.innerHeight - 24),
  };
}

function minPanelSize(): StoredSize {
  return { w: 280, h: 280 };
}

export type SatelliteGeoAiFloatingWidgetProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** Pic-2 AI Agent chrome: gradient border, hide legacy title bar (drag via agent header). */
  agentChrome?: boolean;
  /** Font Awesome class for the minimized FAB (Agent Builder Style prefs). */
  fabIconClass?: string;
};

export function SatelliteGeoAiFloatingWidget({
  open,
  expanded,
  onToggleExpanded,
  onRequestClose,
  children,
  agentChrome = true,
  fabIconClass = 'fa-solid fa-sparkles',
}: SatelliteGeoAiFloatingWidgetProps) {
  const { scopedStorageKey } = useSiInstanceScope();
  const posStorageKey = scopedStorageKey(STORAGE_KEY);
  const sizeStorageKey = scopedStorageKey(STORAGE_SIZE_KEY);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    target: 'fab' | 'header';
    moved: number;
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    handle: ResizeHandleId;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startOx: number;
    startOy: number;
  } | null>(null);

  const [offset, setOffset] = useState<StoredPos>(() => readStoredPos(posStorageKey) ?? { x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<StoredSize>(() => {
    const s = readStoredSize(sizeStorageKey);
    if (!s) return defaultSize();
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const stored = readStoredPos(posStorageKey);
    if (stored) setOffset(stored);
  }, [posStorageKey]);

  const clampOffsetToViewport = useCallback(
    (next: StoredPos, size: StoredSize = panelSize) => {
      const el = rootRef.current;
      if (!el) return next;
      const w = size.w;
      const h = size.h;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - w - margin);
      const maxY = Math.max(margin, window.innerHeight - h - margin);
      const minX = margin - w + 56;
      const minY = margin - h + 56;
      return {
        x: clamp(next.x, minX, maxX),
        y: clamp(next.y, minY, maxY),
      };
    },
    [panelSize.w, panelSize.h],
  );

  const clampSize = useCallback((s: StoredSize): StoredSize => {
    const mn = minPanelSize();
    const mx = maxPanelSize();
    return {
      w: clamp(s.w, mn.w, mx.w),
      h: clamp(s.h, mn.h, mx.h),
    };
  }, []);

  const onPointerDownFab = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'fab',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [offset.x, offset.y],
  );

  const onPointerDownHeader = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button') || target?.closest('.si-geo-ai-float-resize-handle')) return;
      // Agent chrome: only drag from the AI Agent header strip (not the chat body).
      if (agentChrome && !target?.closest('[data-geo-ai-agent-drag-handle]')) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        target: 'header',
        moved: 0,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [agentChrome, offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const next = clampOffsetToViewport(
        {
          x: drag.originX + dx,
          y: drag.originY + dy,
        },
        panelSize,
      );
      setOffset(next);
    },
    [clampOffsetToViewport, panelSize],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wasFab = drag.target === 'fab';
      const moved = drag.moved;
      dragRef.current = null;
      setDragging(false);
      setOffset(prev => {
        const clamped = clampOffsetToViewport(prev, panelSize);
        writeStoredPos(clamped, posStorageKey);
        return clamped;
      });
      if (wasFab && !expanded && moved < 8) {
        onToggleExpanded();
      }
    },
    [clampOffsetToViewport, expanded, onToggleExpanded, panelSize],
  );

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, endDrag, onPointerMove]);

  const applyResizeDelta = useCallback(
    (clientX: number, clientY: number) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = clientX - r.startX;
      const dy = clientY - r.startY;

      let w = r.startW;
      let h = r.startH;
      let ox = r.startOx;
      let oy = r.startOy;

      switch (r.handle) {
        case 'e':
          w = r.startW + dx;
          break;
        case 'w':
          w = r.startW - dx;
          ox = r.startOx + dx;
          break;
        case 'n':
          h = r.startH - dy;
          break;
        case 's':
          h = r.startH + dy;
          break;
        case 'ne':
          w = r.startW + dx;
          h = r.startH - dy;
          break;
        case 'nw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH - dy;
          break;
        case 'se':
          w = r.startW + dx;
          h = r.startH + dy;
          break;
        case 'sw':
          w = r.startW - dx;
          ox = r.startOx + dx;
          h = r.startH + dy;
          break;
        default:
          break;
      }

      const nextSize = clampSize({ w, h });
      let nextOx = ox;
      const nextOy = oy;
      if (nextSize.w !== w && (r.handle === 'w' || r.handle === 'nw' || r.handle === 'sw')) {
        nextOx = r.startOx + (r.startW - nextSize.w);
      }

      const clampedPos = clampOffsetToViewport({ x: nextOx, y: nextOy }, nextSize);
      setPanelSize(nextSize);
      setOffset(clampedPos);
    },
    [clampSize, clampOffsetToViewport],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      applyResizeDelta(e.clientX, e.clientY);
    },
    [applyResizeDelta],
  );

  const endResize = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      setPanelSize(sz => {
        const c = clampSize(sz);
        writeStoredSize(c, sizeStorageKey);
        setOffset(o => {
          const clamped = clampOffsetToViewport(o, c);
          writeStoredPos(clamped, posStorageKey);
          return clamped;
        });
        return c;
      });
    },
    [clampOffsetToViewport, clampSize],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandleId) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        pointerId: e.pointerId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startW: panelSize.w,
        startH: panelSize.h,
        startOx: offset.x,
        startOy: offset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setResizing(true);
    },
    [offset.x, offset.y, panelSize.w, panelSize.h],
  );

  useEffect(() => {
    if (!resizing) return;
    window.addEventListener('pointermove', onResizePointerMove, { passive: true });
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
    return () => {
      window.removeEventListener('pointermove', onResizePointerMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    };
  }, [endResize, onResizePointerMove, resizing]);

  useEffect(() => {
    if (!expanded) return;
    const onWin = () => {
      // Re-fit the panel and its position to the new viewport so it stays fully
      // visible on every screen / orientation change.
      setPanelSize(s => {
        const c = clampSize(s);
        setOffset(o => clampOffsetToViewport(o, c));
        return c;
      });
    };
    window.addEventListener('resize', onWin, { passive: true });
    window.addEventListener('orientationchange', onWin, { passive: true });
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('orientationchange', onWin);
    };
  }, [expanded, clampOffsetToViewport, clampSize]);

  const transformStyle = useMemo(
    () => ({ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }),
    [offset.x, offset.y],
  );

  const panelStyle = useMemo(
    () =>
      ({
        width: `${panelSize.w}px`,
        height: `${panelSize.h}px`,
        maxWidth: 'none',
        maxHeight: 'none',
      }) as React.CSSProperties,
    [panelSize.w, panelSize.h],
  );

  const resizeHandles: Array<{ id: ResizeHandleId; className: string; label: string }> = useMemo(
    () => [
      { id: 'n', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--n', label: 'Resize height from top' },
      { id: 's', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--s', label: 'Resize height from bottom' },
      { id: 'e', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--e', label: 'Resize width from end' },
      { id: 'w', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--w', label: 'Resize width from start' },
      { id: 'ne', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--ne', label: 'Resize corner' },
      { id: 'nw', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--nw', label: 'Resize corner' },
      { id: 'se', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--se', label: 'Resize corner' },
      { id: 'sw', className: 'si-geo-ai-float-resize-handle si-geo-ai-float-resize-handle--sw', label: 'Resize corner' },
    ],
    [],
  );

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={[
        'si-geo-ai-float',
        dragging ? 'si-geo-ai-float--dragging' : '',
        resizing ? 'si-geo-ai-float--resizing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={transformStyle}
      role="region"
      aria-label="AI Agent"
    >
      <div className="si-geo-ai-float-inner">
        {expanded ? (
          <div
            className={[
              'si-geo-ai-float-panel',
              'si-geo-ai-float-panel--sized',
              agentChrome ? 'si-geo-ai-float-panel--agent-chrome' : '',
              dragging ? 'si-geo-ai-float-panel--dragging' : '',
              resizing ? 'si-geo-ai-float-panel--resizing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={panelStyle}
            onPointerDown={agentChrome ? onPointerDownHeader : undefined}
          >
            {!agentChrome ? (
              <div className="si-geo-ai-float-head" onPointerDown={onPointerDownHeader}>
                <div className="si-geo-ai-float-head-text">
                  <div className="si-geo-ai-float-title">AI Agent</div>
                  <div className="si-geo-ai-float-sub">Map-linked AI</div>
                </div>
                <div className="si-geo-ai-float-actions">
                  <button
                    type="button"
                    className="si-geo-ai-float-icon-btn"
                    title="Minimize"
                    aria-label="Minimize AI Agent"
                    onClick={ev => {
                      ev.stopPropagation();
                      onToggleExpanded();
                    }}
                  >
                    <i className="fa-solid fa-chevron-down" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="si-geo-ai-float-icon-btn"
                    title="Close"
                    aria-label="Close AI Agent"
                    onClick={ev => {
                      ev.stopPropagation();
                      onRequestClose();
                    }}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="si-geo-ai-float-body">{children}</div>
            {resizeHandles.map(h => (
              <button
                key={h.id}
                type="button"
                className={h.className}
                aria-label={h.label}
                title={h.label}
                onPointerDown={ev => onResizePointerDown(ev, h.id)}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            className={['si-geo-ai-float-fab', agentChrome ? 'si-geo-ai-float-fab--agent' : '']
              .filter(Boolean)
              .join(' ')}
            title="AI Agent — map-linked intelligence"
            aria-expanded={expanded}
            aria-label="AI Agent"
            onPointerDown={onPointerDownFab}
          >
            <span className="si-geo-ai-float-fab-label">AI Agent</span>
            <span className="si-geo-ai-float-fab-mark" aria-hidden>
              <i className={`${fabIconClass} si-geo-ai-float-fab-mark-back`} />
              <i className={`${fabIconClass} si-geo-ai-float-fab-mark-front`} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
