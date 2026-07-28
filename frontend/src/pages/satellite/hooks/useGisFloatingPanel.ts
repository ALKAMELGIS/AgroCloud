import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type GisPanelDock = 'float' | 'left' | 'right' | 'bottom';

export type GisPanelPersistedState = {
  x: number;
  y: number;
  w: number;
  h: number;
  dock: GisPanelDock;
  minimized: boolean;
  maximized: boolean;
};

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

let globalPanelZ = 15200;

export function nextGisPanelZIndex(): number {
  globalPanelZ += 1;
  return globalPanelZ;
}

function normalizeDock(raw: unknown, fallback: GisPanelDock): GisPanelDock {
  if (raw === 'left' || raw === 'right' || raw === 'bottom' || raw === 'float') return raw;
  return fallback;
}

function readState(key: string, defaults: GisPanelPersistedState): GisPanelPersistedState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const j = JSON.parse(raw) as Partial<GisPanelPersistedState>;
    return {
      x: typeof j.x === 'number' ? j.x : defaults.x,
      y: typeof j.y === 'number' ? j.y : defaults.y,
      w: typeof j.w === 'number' ? j.w : defaults.w,
      h: typeof j.h === 'number' ? j.h : defaults.h,
      dock: normalizeDock(j.dock, defaults.dock),
      minimized: Boolean(j.minimized),
      maximized: Boolean(j.maximized),
    };
  } catch {
    return defaults;
  }
}

function writeState(key: string, s: GisPanelPersistedState) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type UseGisFloatingPanelOptions = {
  open: boolean;
  storageKey: string;
  containerRef: RefObject<HTMLElement | null>;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  defaultDock?: GisPanelDock;
};

export function useGisFloatingPanel({
  open,
  storageKey,
  containerRef,
  defaultWidth = 380,
  defaultHeight = 720,
  minWidth = 320,
  maxWidth = 600,
  minHeight = 280,
  maxHeight = 900,
  defaultDock = 'float',
}: UseGisFloatingPanelOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; w: number; h: number } | null>(null);
  const resizeRef = useRef<{
    dir: ResizeDir;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const preMaxRef = useRef<GisPanelPersistedState | null>(null);

  const [zIndex, setZIndex] = useState(() => nextGisPanelZIndex());
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const [panel, setPanel] = useState<GisPanelPersistedState>(() =>
    readState(storageKey, {
      x: 0,
      y: 0,
      w: defaultWidth,
      h: defaultHeight,
      dock: defaultDock,
      minimized: false,
      maximized: false,
    }),
  );

  const clampSize = useCallback(
    (w: number, h: number) => ({
      w: Math.max(minWidth, Math.min(maxWidth, w)),
      h: Math.max(minHeight, Math.min(maxHeight, h)),
    }),
    [minWidth, maxWidth, minHeight, maxHeight],
  );

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

  const persist = useCallback(
    (next: GisPanelPersistedState) => {
      setPanel(next);
      writeState(storageKey, next);
    },
    [storageKey],
  );

  const bringToFront = useCallback(() => setZIndex(nextGisPanelZIndex()), []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const r = rootRef.current.getBoundingClientRect();

    // ArcGIS-style bottom dock: full width, anchored to the map bottom.
    if (panel.dock === 'bottom') {
      const h = Math.max(minHeight, Math.min(maxHeight, panel.h || defaultHeight, Math.floor(box.height * 0.72)));
      const next = {
        ...panel,
        x: 0,
        y: Math.max(0, box.height - h),
        w: box.width,
        h,
        maximized: false,
      };
      if (next.x !== panel.x || next.y !== panel.y || next.w !== panel.w || next.h !== panel.h) {
        persist(next);
      }
      return;
    }

    if (panel.x === 0 && panel.y === 0 && panel.dock === 'float') {
      const defaultX = Math.max(8, box.width - panel.w - 12);
      const defaultY = Math.max(8, 56);
      const next = clampToContainer(defaultX, defaultY, r.width || panel.w, r.height || panel.h);
      persist({ ...panel, x: next.x, y: next.y });
      return;
    }
    setPanel(p => {
      if (p.dock === 'bottom') return p;
      const next = clampToContainer(p.x, p.y, r.width, r.height);
      if (next.x === p.x && next.y === p.y) return p;
      const merged = { ...p, ...next };
      writeState(storageKey, merged);
      return merged;
    });
  }, [open, containerRef, clampToContainer, storageKey, minHeight, maxHeight, defaultHeight]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || panel.dock !== 'float' || panel.maximized) return;
      if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-drag-exclude]')) return;
      const root = rootRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!root || !box) return;
      bringToFront();
      const r = root.getBoundingClientRect();
      dragRef.current = {
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        startX: r.left - box.left,
        startY: r.top - box.top,
        w: r.width,
        h: r.height,
      };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    [panel.dock, panel.maximized, containerRef, bringToFront],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const nx = e.clientX - box.left - dragRef.current.dx;
      const ny = e.clientY - box.top - dragRef.current.dy;
      const next = clampToContainer(nx, ny, dragRef.current.w, dragRef.current.h);
      setPanel(p => ({ ...p, x: next.x, y: next.y }));
    },
    [clampToContainer, containerRef],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (dragRef.current) {
        dragRef.current = null;
        setPanel(p => {
          writeState(storageKey, p);
          return p;
        });
      }
      setDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onResizePointerDown = useCallback(
    (dir: ResizeDir) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || panel.minimized || panel.maximized) return;
      // Bottom dock: only the top edge resizes height. Side docks: width only via e/w.
      if (panel.dock === 'bottom' && dir !== 'n') return;
      if ((panel.dock === 'left' || panel.dock === 'right') && !dir.includes('e') && !dir.includes('w')) return;
      const root = rootRef.current;
      if (!root) return;
      bringToFront();
      resizeRef.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startW: panel.w,
        startH: panel.h,
        startPosX: panel.x,
        startPosY: panel.y,
      };
      setResizing(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    [panel, bringToFront],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!resizeRef.current) return;
      const { dir, startX, startY, startW, startH, startPosX, startPosY } = resizeRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const box = containerRef.current?.getBoundingClientRect();

      // Bottom dock: drag top edge to change height; keep full width along the bottom.
      if (panel.dock === 'bottom' && box) {
        const nextH = clampSize(box.width, startH - dy).h;
        const maxH = Math.min(maxHeight, Math.floor(box.height * 0.72));
        const h = Math.max(minHeight, Math.min(maxH, nextH));
        setPanel(p => ({
          ...p,
          w: box.width,
          h,
          x: 0,
          y: Math.max(0, box.height - h),
        }));
        return;
      }

      let w = startW;
      let h = startH;
      let x = startPosX;
      let y = startPosY;
      if (dir.includes('e')) w = startW + dx;
      if (dir.includes('w')) {
        w = startW - dx;
        x = startPosX + dx;
      }
      if (dir.includes('s')) h = startH + dy;
      if (dir.includes('n')) {
        h = startH - dy;
        y = startPosY + dy;
      }
      const sized = clampSize(w, h);
      if (box) {
        if (dir.includes('w')) x = startPosX + (startW - sized.w);
        if (dir.includes('n')) y = startPosY + (startH - sized.h);
        const clamped = clampToContainer(x, y, sized.w, sized.h);
        x = clamped.x;
        y = clamped.y;
      }
      setPanel(p => ({ ...p, w: sized.w, h: sized.h, x, y }));
    },
    [clampSize, clampToContainer, containerRef, panel.dock, minHeight, maxHeight],
  );

  const endResize = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (resizeRef.current) {
        resizeRef.current = null;
        setPanel(p => {
          writeState(storageKey, p);
          return p;
        });
      }
      setResizing(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const toggleMinimize = useCallback(() => {
    persist({ ...panel, minimized: !panel.minimized, maximized: false });
  }, [panel, persist]);

  const toggleMaximize = useCallback(() => {
    if (panel.maximized) {
      const restore = preMaxRef.current ?? panel;
      preMaxRef.current = null;
      persist({ ...restore, maximized: false, minimized: false });
      return;
    }
    preMaxRef.current = panel;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    persist({
      ...panel,
      x: 8,
      y: 8,
      w: Math.min(maxWidth, box.width - 16),
      h: Math.min(maxHeight, box.height - 16),
      maximized: true,
      minimized: false,
      dock: 'float',
    });
  }, [panel, persist, containerRef, maxWidth, maxHeight]);

  const toggleDock = useCallback(
    (dock: GisPanelDock) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      if (dock === 'left' || dock === 'right') {
        persist({
          ...panel,
          dock,
          x: dock === 'left' ? 0 : Math.max(0, box.width - panel.w),
          y: 0,
          w: Math.min(panel.w, Math.max(minWidth, Math.floor(box.width * 0.42))),
          h: box.height,
          minimized: false,
          maximized: false,
        });
      } else if (dock === 'bottom') {
        const h = Math.max(
          minHeight,
          Math.min(maxHeight, panel.h || defaultHeight, Math.floor(box.height * 0.42)),
        );
        persist({
          ...panel,
          dock: 'bottom',
          x: 0,
          y: Math.max(0, box.height - h),
          w: box.width,
          h,
          minimized: false,
          maximized: false,
        });
      } else {
        persist({ ...panel, dock: 'float', maximized: false });
      }
    },
    [panel, persist, containerRef, minWidth, minHeight, maxHeight, defaultHeight],
  );

  const onHeaderDoubleClick = useCallback(() => {
    toggleMaximize();
  }, [toggleMaximize]);

  useEffect(() => {
    const onWinResize = () => {
      if (!containerRef.current || !rootRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      setPanel(p => {
        if (p.dock === 'left') return { ...p, x: 0, y: 0, h: box.height };
        if (p.dock === 'right') return { ...p, x: Math.max(0, box.width - p.w), y: 0, h: box.height };
        if (p.dock === 'bottom') {
          const h = Math.max(minHeight, Math.min(maxHeight, p.h, Math.floor(box.height * 0.72)));
          const merged = { ...p, x: 0, y: Math.max(0, box.height - h), w: box.width, h };
          writeState(storageKey, merged);
          return merged;
        }
        const r = rootRef.current!.getBoundingClientRect();
        const next = clampToContainer(p.x, p.y, r.width, r.height);
        const merged = { ...p, ...next };
        writeState(storageKey, merged);
        return merged;
      });
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampToContainer, containerRef, storageKey, minHeight, maxHeight]);

  return {
    rootRef,
    panel,
    zIndex,
    dragging,
    resizing,
    bringToFront,
    onDragPointerDown,
    onDragPointerMove,
    endDrag,
    onResizePointerDown,
    onResizePointerMove,
    endResize,
    toggleMinimize,
    toggleMaximize,
    toggleDock,
    onHeaderDoubleClick,
    persist,
  };
}
