import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields';
import { useSiInstanceScope } from '../siInstanceScope';
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import { SiImageryTimeSeriesPanel } from './SiImageryTimeSeriesPanel';
import './SiImageryTimeSeriesFloatingPanel.css';

const POS_KEY_BASE = 'si-its-float-pos-v1';
const SIZE_KEY_BASE = 'si-its-float-size-v1';

const MIN_W = 300;
const MAX_W = 960;
const MIN_BODY_H = 240;
const MAX_BODY_H = 900;
const DEFAULT_W = 420;
const DEFAULT_BODY_H = 520;

type SavedPos = { x: number; y: number };
type SavedSize = { w: number; h: number };

function readSavedPos(storageKey: string): SavedPos | null {
  try {
    const raw = localStorage.getItem(storageKey);
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

function writeSavedPos(p: SavedPos, storageKey: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function readSavedSize(storageKey: string): SavedSize | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const j = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof j.w === 'number' && typeof j.h === 'number' && Number.isFinite(j.w) && Number.isFinite(j.h)) {
      return {
        w: Math.min(MAX_W, Math.max(MIN_W, j.w)),
        h: Math.min(MAX_BODY_H, Math.max(MIN_BODY_H, j.h)),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSavedSize(s: SavedSize, storageKey: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type SiImageryTimeSeriesFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  agroStructuresMask: GeoJSON.FeatureCollection | null;
  aoiFields: SiAoiFieldRecord[];
  committedAoiGeometry: GeoJSON.Geometry | null;
  defaultLayerId: string;
  analysisDate: string;
  onMapDateFromChart: (iso: string) => void;
  selectedFieldKey?: string | null;
  onSelectedFieldKeyChange?: (fieldKey: string) => void;
};

export function SiImageryTimeSeriesFloatingPanel({
  open,
  onClose,
  containerRef,
  agroStructuresMask,
  aoiFields,
  committedAoiGeometry,
  defaultLayerId,
  analysisDate,
  onMapDateFromChart,
  selectedFieldKey,
  onSelectedFieldKeyChange,
}: SiImageryTimeSeriesFloatingPanelProps) {
  const { scopedStorageKey } = useSiInstanceScope();
  const posStorageKey = scopedStorageKey(POS_KEY_BASE);
  const sizeStorageKey = scopedStorageKey(SIZE_KEY_BASE);
  const isolation = useMapOverlayIsolation(true, { native: true });
  const { ref: isolationRef, ...isolationHandlers } = isolation;
  const rootRef = useRef<HTMLElement | null>(null);
  const headRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
    w: number;
    h: number;
    captureEl: HTMLElement;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    captureEl: HTMLElement;
  } | null>(null);
  const [pos, setPos] = useState<SavedPos | null>(() => readSavedPos(posStorageKey));
  const [size, setSize] = useState<SavedSize | null>(() => readSavedSize(sizeStorageKey));
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const setRootRef = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      isolationRef?.(node);
    },
    [isolationRef],
  );

  const clampToContainer = useCallback(
    (x: number, y: number, elW: number, elH: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return { x, y };
      const pad = 6;
      const maxX = Math.max(pad, box.width - elW - pad);
      const maxY = Math.max(pad, box.height - elH - pad);
      return {
        x: Math.min(maxX, Math.max(pad, x)),
        y: Math.min(maxY, Math.max(pad, y)),
      };
    },
    [containerRef],
  );

  const clampSize = useCallback(
    (w: number, h: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      const headH = headRef.current?.offsetHeight ?? 32;
      const pad = 12;
      let maxW = MAX_W;
      let maxH = MAX_BODY_H;
      if (box) {
        maxW = Math.min(MAX_W, Math.max(MIN_W, box.width - pad));
        maxH = Math.min(MAX_BODY_H, Math.max(MIN_BODY_H, box.height - headH - pad));
      }
      return {
        w: Math.min(maxW, Math.max(MIN_W, w)),
        h: Math.min(maxH, Math.max(MIN_BODY_H, h)),
      };
    },
    [containerRef],
  );

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const r = rootRef.current.getBoundingClientRect();
    setPos(p => {
      const origin = p ?? { x: r.left - box.left, y: r.top - box.top };
      const next = clampToContainer(origin.x, origin.y, r.width, r.height);
      if (p && next.x === p.x && next.y === p.y) return p;
      return next;
    });
  }, [open, clampToContainer, containerRef]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-drag-exclude]')) return;
      const root = rootRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!root || !box) return;
      e.preventDefault();
      e.stopPropagation();
      const captureEl = e.currentTarget;
      try {
        captureEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const r = root.getBoundingClientRect();
      const origin = pos ?? { x: r.left - box.left, y: r.top - box.top };
      if (!pos) setPos(origin);
      dragRef.current = {
        pointerId: e.pointerId,
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        w: r.width,
        h: r.height,
        captureEl,
      };
      setDragging(true);
    },
    [containerRef, pos],
  );

  const onDragPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!d || e.pointerId !== d.pointerId || !box) return;
      e.preventDefault();
      const nx = e.clientX - box.left - d.dx;
      const ny = e.clientY - box.top - d.dy;
      setPos(clampToContainer(nx, ny, d.w, d.h));
    },
    [clampToContainer, containerRef],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      try {
        d.captureEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
      setDragging(false);
      setPos(p => {
        if (p) writeSavedPos(p, posStorageKey);
        return p;
      });
    },
    [posStorageKey],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => onDragPointerMove(e);
    const end = (e: PointerEvent) => endDrag(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging, endDrag, onDragPointerMove]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const root = rootRef.current;
      if (!root) return;
      e.preventDefault();
      e.stopPropagation();
      const captureEl = e.currentTarget;
      try {
        captureEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const r = root.getBoundingClientRect();
      const body = root.querySelector<HTMLElement>('.acp-map-panel__body');
      const bodyH = body?.getBoundingClientRect().height ?? size?.h ?? DEFAULT_BODY_H;
      const startW = size?.w ?? r.width;
      const startH = size?.h ?? bodyH;
      if (!size) setSize(clampSize(startW, startH));
      resizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW,
        startH,
        captureEl,
      };
      setResizing(true);
    },
    [clampSize, size],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      e.preventDefault();
      const nw = r.startW + (e.clientX - r.startX);
      const nh = r.startH + (e.clientY - r.startY);
      setSize(clampSize(nw, nh));
    },
    [clampSize],
  );

  const endResize = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      try {
        r.captureEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      resizeRef.current = null;
      setResizing(false);
      setSize(s => {
        if (s) writeSavedSize(s, sizeStorageKey);
        return s;
      });
      setPos(p => {
        if (!p || !rootRef.current || !containerRef.current) return p;
        const box = containerRef.current.getBoundingClientRect();
        const el = rootRef.current.getBoundingClientRect();
        const next = clampToContainer(el.left - box.left, el.top - box.top, el.width, el.height);
        if (next.x === p.x && next.y === p.y) return p;
        writeSavedPos(next, posStorageKey);
        return next;
      });
    },
    [clampToContainer, containerRef, posStorageKey, sizeStorageKey],
  );

  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => onResizePointerMove(e);
    const end = (e: PointerEvent) => endResize(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [resizing, endResize, onResizePointerMove]);

  useEffect(() => {
    const onWinResize = () => {
      setSize(s => (s ? clampSize(s.w, s.h) : s));
      setPos(p => {
        if (!p || !rootRef.current || !containerRef.current) return p;
        const box = containerRef.current.getBoundingClientRect();
        const el = rootRef.current.getBoundingClientRect();
        const next = clampToContainer(el.left - box.left, el.top - box.top, el.width, el.height);
        if (next.x === p.x && next.y === p.y) return p;
        return next;
      });
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampSize, clampToContainer, containerRef]);

  if (!open) return null;

  const style: CSSProperties = {
    ...(pos != null ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}),
    ...(size != null ? { width: size.w, maxHeight: 'none' } : {}),
  };
  const bodyStyle: CSSProperties =
    size != null
      ? { height: size.h, minHeight: size.h, maxHeight: size.h, flex: '0 0 auto' }
      : { minHeight: MIN_BODY_H };

  return (
    <aside
      ref={setRootRef}
      className={
        'si-its-float acp-shell acp-map-panel acp-map-panel--timeseries' +
        (size != null ? ' si-its-float--sized' : '') +
        (dragging ? ' si-its-float--dragging' : '') +
        (resizing ? ' si-its-float--resizing' : '')
      }
      style={style}
      dir="ltr"
      role="dialog"
      aria-label="Imagery Time Series"
      aria-modal="false"
      {...isolationHandlers}
    >
      <header
        ref={headRef}
        className="acp-map-panel__head si-its-float__head"
        onPointerDown={onDragPointerDown}
        title="Drag to move panel"
      >
        <span className="si-its-float__head-main">
          <span className="si-its-float__grip" aria-hidden>
            <i className="fa-solid fa-grip-vertical" />
          </span>
          <span className="si-its-float__title">Imagery Time Series</span>
        </span>
        <button
          type="button"
          className="acp-map-panel__close"
          data-drag-exclude
          onClick={onClose}
          aria-label="Close Imagery Time Series"
          title="Close"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="acp-map-panel__body si-its-float__body" style={bodyStyle} data-agrocloud-map-wheel-scroll="">
        <SiImageryTimeSeriesPanel
          agroStructuresMask={agroStructuresMask}
          aoiFields={aoiFields}
          committedAoiGeometry={committedAoiGeometry}
          defaultLayerId={defaultLayerId}
          analysisDate={analysisDate}
          onMapDateFromChart={onMapDateFromChart}
          selectedFieldKey={selectedFieldKey}
          onSelectedFieldKeyChange={onSelectedFieldKeyChange}
        />
      </div>
      <div
        className="si-its-float__resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        title="Drag to resize"
        data-drag-exclude
        onPointerDown={onResizePointerDown}
      >
        <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
      </div>
    </aside>
  );
}
