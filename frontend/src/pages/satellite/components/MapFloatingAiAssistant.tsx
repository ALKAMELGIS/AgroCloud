import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import './mapFloatingAiAssistant.css';

const POS_KEY = 'si-map-float-ai-assistant-pos-v1';

export type MapFloatingAiAssistantProps = {
  /** Map viewport (e.g. `.si-map-container`) for drag clamping. */
  containerRef: RefObject<HTMLElement | null>;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  /** Optional: dock into full Processing / Geo AI workspace. */
  onOpenFullWorkspace?: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

type SavedPos = { x: number; y: number };

function readSavedPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof j.x === 'number' && typeof j.y === 'number' && Number.isFinite(j.x) && Number.isFinite(j.y)) {
      return { x: j.x, y: j.y };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSavedPos(p: SavedPos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function MapFloatingAiAssistant(props: MapFloatingAiAssistantProps) {
  const {
    containerRef,
    expanded,
    onExpandedChange,
    onOpenFullWorkspace,
    title = 'Map Assistant',
    subtitle = 'Geo AI',
    children,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; w: number; h: number } | null>(
    null,
  );
  const fabStartRef = useRef<{ cx: number; cy: number } | null>(null);
  const fabMovedRef = useRef(false);
  const [pos, setPos] = useState<SavedPos | null>(() => readSavedPos());

  const clampToContainer = useCallback(
    (x: number, y: number, elW: number, elH: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return { x, y };
      const pad = 8;
      const maxX = Math.max(pad, box.width - elW - pad);
      const maxY = Math.max(pad, box.height - elH - pad);
      return {
        x: Math.min(maxX, Math.max(pad, x)),
        y: Math.min(maxY, Math.max(pad, y)),
      };
    },
    [containerRef],
  );

  useLayoutEffect(() => {
    if (pos === null || !rootRef.current || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const r = rootRef.current.getBoundingClientRect();
    setPos(p => clampToContainer(p.x, p.y, r.width, r.height));
  }, [expanded, pos, clampToContainer, containerRef]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const root = rootRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!root || !box) return;
      const r = root.getBoundingClientRect();
      dragRef.current = {
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        startX: r.left - box.left,
        startY: r.top - box.top,
        w: r.width,
        h: r.height,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    [containerRef],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const nx = e.clientX - box.left - dragRef.current.dx;
      const ny = e.clientY - box.top - dragRef.current.dy;
      const next = clampToContainer(nx, ny, dragRef.current.w, dragRef.current.h);
      setPos(next);
    },
    [clampToContainer, containerRef],
  );

  const onDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null;
      setPos(p => {
        if (p) writeSavedPos(p);
        return p;
      });
    }
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPos(p => {
        if (!p || !rootRef.current || !containerRef.current) return p;
        const box = containerRef.current.getBoundingClientRect();
        const r = rootRef.current.getBoundingClientRect();
        return clampToContainer(r.left - box.left, r.top - box.top, r.width, r.height);
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampToContainer, containerRef]);

  const style: React.CSSProperties =
    pos != null
      ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
      : { right: 12, bottom: 108, left: 'auto', top: 'auto' };

  return (
    <div
      ref={rootRef}
      className={'si-map-float-ai' + (expanded ? ' si-map-float-ai--expanded' : ' si-map-float-ai--collapsed')}
      style={style}
      role="region"
      aria-label="AI map assistant"
    >
      {!expanded ? (
        <button
          type="button"
          className="si-map-float-ai__fab"
          aria-expanded={false}
          title={`${title} — ${subtitle} · tap to open, drag to move`}
          onPointerDown={e => {
            if (e.button !== 0) return;
            const root = rootRef.current;
            const box = containerRef.current?.getBoundingClientRect();
            if (!root || !box) return;
            const r = root.getBoundingClientRect();
            fabStartRef.current = { cx: e.clientX, cy: e.clientY };
            fabMovedRef.current = false;
            dragRef.current = {
              dx: e.clientX - r.left,
              dy: e.clientY - r.top,
              startX: r.left - box.left,
              startY: r.top - box.top,
              w: r.width,
              h: r.height,
            };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={e => {
            if (fabStartRef.current) {
              const d = Math.hypot(e.clientX - fabStartRef.current.cx, e.clientY - fabStartRef.current.cy);
              if (d > 6) fabMovedRef.current = true;
            }
            onDragPointerMove(e);
          }}
          onPointerUp={e => {
            const opened = !fabMovedRef.current;
            fabStartRef.current = null;
            onDragPointerUp(e);
            if (opened) onExpandedChange(true);
          }}
          onPointerCancel={onDragPointerUp}
        >
          <span className="si-map-float-ai__fab-glow" aria-hidden />
          <span className="si-map-float-ai__fab-icon" aria-hidden>
            <i className="fa-solid fa-wand-magic-sparkles" />
          </span>
        </button>
      ) : (
        <div className="si-map-float-ai__panel">
          <div
            className="si-map-float-ai__chrome"
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerUp}
            onPointerCancel={onDragPointerUp}
          >
            <button
              type="button"
              className="si-map-float-ai__drag-hint"
              aria-label="Drag assistant"
              title="Drag to move"
            >
              <i className="fa-solid fa-grip-dots-vertical" aria-hidden />
            </button>
            <div className="si-map-float-ai__titles">
              <span className="si-map-float-ai__title">{title}</span>
              <span className="si-map-float-ai__subtitle">{subtitle}</span>
            </div>
            <div className="si-map-float-ai__chrome-actions">
              {onOpenFullWorkspace ? (
                <button
                  type="button"
                  className="si-map-float-ai__icon-btn"
                  title="Open full workspace panel"
                  aria-label="Open full workspace"
                  onClick={e => {
                    e.stopPropagation();
                    onOpenFullWorkspace();
                  }}
                >
                  <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="si-map-float-ai__icon-btn"
                title="Collapse"
                aria-label="Collapse assistant"
                onClick={e => {
                  e.stopPropagation();
                  onExpandedChange(false);
                }}
              >
                <i className="fa-solid fa-chevron-down" aria-hidden />
              </button>
            </div>
          </div>
          <div className="si-map-float-ai__body">{children}</div>
        </div>
      )}
    </div>
  );
}
