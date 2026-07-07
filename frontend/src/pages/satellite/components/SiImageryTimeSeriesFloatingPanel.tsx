import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields';
import { useSiInstanceScope } from '../siInstanceScope';
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import { SiImageryTimeSeriesPanel } from './SiImageryTimeSeriesPanel';
import './SiImageryTimeSeriesFloatingPanel.css';

const POS_KEY_BASE = 'si-its-float-pos-v2';
const SIZE_KEY_BASE = 'si-its-float-size-v1';

const MIN_W = 300;
const MAX_W = 960;
const MIN_BODY_H = 240;
const MAX_BODY_H = 900;
const DEFAULT_BODY_H = 520;
const VIEWPORT_PAD = 8;

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

function clampToViewport(x: number, y: number, elW: number, elH: number): SavedPos {
  const pad = VIEWPORT_PAD;
  const maxX = Math.max(pad, window.innerWidth - elW - pad);
  const maxY = Math.max(pad, window.innerHeight - elH - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

export type SiImageryTimeSeriesFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Used only for the initial open position anchor (map area). */
  containerRef: RefObject<HTMLElement | null>;
  agroStructuresMask: GeoJSON.FeatureCollection | null;
  aoiFields: SiAoiFieldRecord[];
  committedAoiGeometry: GeoJSON.Geometry | null;
  defaultLayerId: string;
  analysisDate: string;
  onMapDateFromChart: (iso: string) => void;
  selectedFieldKey?: string | null;
  onSelectedFieldKeyChange?: (fieldKey: string) => void;
  onRequestDrawAoi?: () => void;
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
  onRequestDrawAoi,
}: SiImageryTimeSeriesFloatingPanelProps) {
  const { scopedStorageKey } = useSiInstanceScope();
  const posStorageKey = scopedStorageKey(POS_KEY_BASE);
  const sizeStorageKey = scopedStorageKey(SIZE_KEY_BASE);
  const isolation = useMapOverlayIsolation(true, { native: true });
  const { ref: isolationRef, ...isolationHandlers } = isolation;
  const rootRef = useRef<HTMLElement | null>(null);
  const headRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [pos, setPos] = useState<SavedPos | null>(() => readSavedPos(posStorageKey));
  const [size, setSize] = useState<SavedSize | null>(() => readSavedSize(sizeStorageKey));
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const setBodyIsolationRef = useCallback(
    (node: HTMLElement | null) => {
      isolationRef?.(node);
    },
    [isolationRef],
  );

  const clampSize = useCallback((w: number, h: number) => {
    const headH = headRef.current?.offsetHeight ?? 34;
    const pad = VIEWPORT_PAD;
    const maxW = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - pad * 2));
    const maxH = Math.min(MAX_BODY_H, Math.max(MIN_BODY_H, window.innerHeight - headH - pad * 2));
    return {
      w: Math.min(maxW, Math.max(MIN_W, w)),
      h: Math.min(maxH, Math.max(MIN_BODY_H, h)),
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setPos(p => {
      if (p) return clampToViewport(p.x, p.y, r.width, r.height);
      const box = containerRef.current?.getBoundingClientRect();
      const anchorX = box ? box.left + 10 : 14;
      const anchorY = box ? box.top + 56 : 72;
      return clampToViewport(anchorX, anchorY, r.width, r.height);
    });
  }, [open, containerRef]);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-drag-exclude]')) return;
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const nx = e.clientX - dragRef.current.dx;
    const ny = e.clientY - dragRef.current.dy;
    setPos(clampToViewport(nx, ny, dragRef.current.w, dragRef.current.h));
    e.preventDefault();
  }, []);

  const onDragPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (dragRef.current) {
        dragRef.current = null;
        setPos(p => {
          if (p) writeSavedPos(p, posStorageKey);
          return p;
        });
      }
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [posStorageKey],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const body = root.querySelector<HTMLElement>('.acp-map-panel__body');
      const bodyH = body?.getBoundingClientRect().height ?? size?.h ?? DEFAULT_BODY_H;
      const startW = size?.w ?? r.width;
      const startH = size?.h ?? bodyH;
      if (!size) setSize(clampSize(startW, startH));
      resizeRef.current = { startX: e.clientX, startY: e.clientY, startW, startH };
      setResizing(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [clampSize, size],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!resizeRef.current) return;
      const nw = resizeRef.current.startW + (e.clientX - resizeRef.current.startX);
      const nh = resizeRef.current.startH + (e.clientY - resizeRef.current.startY);
      setSize(clampSize(nw, nh));
      e.preventDefault();
    },
    [clampSize],
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (resizeRef.current) {
        resizeRef.current = null;
        setSize(s => {
          if (s) writeSavedSize(s, sizeStorageKey);
          return s;
        });
        setPos(p => {
          if (!p || !rootRef.current) return p;
          const r = rootRef.current.getBoundingClientRect();
          const next = clampToViewport(p.x, p.y, r.width, r.height);
          if (next.x === p.x && next.y === p.y) return p;
          writeSavedPos(next, posStorageKey);
          return next;
        });
      }
      setResizing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [posStorageKey, sizeStorageKey],
  );

  useEffect(() => {
    const onWinResize = () => {
      setSize(s => (s ? clampSize(s.w, s.h) : s));
      setPos(p => {
        if (!p || !rootRef.current) return p;
        const r = rootRef.current.getBoundingClientRect();
        const next = clampToViewport(p.x, p.y, r.width, r.height);
        if (next.x === p.x && next.y === p.y) return p;
        return next;
      });
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampSize]);

  if (!open || typeof document === 'undefined') return null;

  const style: CSSProperties = {
    position: 'fixed',
    zIndex: 9200,
    ...(pos != null ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : { left: 14, top: 72 }),
    ...(size != null ? { width: size.w, maxHeight: 'none' } : {}),
  };
  const bodyStyle: CSSProperties =
    size != null
      ? { height: size.h, minHeight: size.h, maxHeight: size.h, flex: '0 0 auto' }
      : { minHeight: MIN_BODY_H };

  const panel = (
    <aside
      ref={rootRef}
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
    >
      <header
        ref={headRef}
        className="acp-map-panel__head si-its-float__head"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        title="Drag to move anywhere on screen"
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
      <div
        ref={setBodyIsolationRef}
        className="si-its-float__chrome"
        {...isolationHandlers}
      >
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
            onRequestDrawAoi={onRequestDrawAoi}
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
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        >
          <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
        </div>
      </div>
    </aside>
  );

  return createPortal(panel, document.body);
}
