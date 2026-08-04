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
import type { SiAoiMaskBuilderLayerLike } from '../../../lib/siAoiMaskBuilder';
import { useSiInstanceScope } from '../siInstanceScope';
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import { SiImageryTimeSeriesPanel } from './SiImageryTimeSeriesPanel';
import './SiImageryTimeSeriesFloatingPanel.css';

const POS_KEY_BASE = 'si-its-float-pos-v3';
const SIZE_KEY_BASE = 'si-its-float-size-v2';

const MIN_W = 300;
const MAX_W = 960;
const MIN_BODY_H = 240;
const MAX_BODY_H = 900;
const VIEWPORT_PAD = 8;

type SavedPos = { x: number; y: number };
type SavedSize = { w: number; h: number };

const DEFAULT_BODY_H = 333;
const DEFAULT_W = 518;
const DEFAULT_POS: SavedPos = { x: 110, y: 147 };
const DEFAULT_SIZE: SavedSize = { w: DEFAULT_W, h: DEFAULT_BODY_H };

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

function clampDefaultSize(): SavedSize {
  const pad = VIEWPORT_PAD;
  const headH = 38;
  return {
    w: Math.min(MAX_W, Math.max(MIN_W, Math.min(DEFAULT_SIZE.w, window.innerWidth - pad * 2))),
    h: Math.min(
      MAX_BODY_H,
      Math.max(MIN_BODY_H, Math.min(DEFAULT_SIZE.h, window.innerHeight - headH - pad * 2)),
    ),
  };
}

function readInitialPos(storageKey: string): SavedPos {
  return readSavedPos(storageKey) ?? DEFAULT_POS;
}

function readInitialSize(storageKey: string): SavedSize {
  return readSavedSize(storageKey) ?? clampDefaultSize();
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
  /** KMZ/KML/SHP/GeoJSON layers from the map Layers panel (polygon features → AOI pickers). */
  vectorLayers?: SiAoiMaskBuilderLayerLike[] | null;
  committedAoiGeometry: GeoJSON.Geometry | null;
  defaultLayerId: string;
  analysisDate: string;
  imageryDateAutoFollow?: boolean;
  onMapDateFromChart: (iso: string) => void;
  selectedFieldKey?: string | null;
  onSelectedFieldKeyChange?: (fieldKey: string) => void;
  onHighlightFieldKeysChange?: (fieldKeys: string[]) => void;
  mapboxToken?: string;
  onStormMapOverlayChange?: (overlay: import('../lib/imageryStormAnalysis').SiTsWeatherStormMapOverlay | null) => void;
  stormOverlayDismissEpoch?: number;
};

export function SiImageryTimeSeriesFloatingPanel({
  open,
  onClose,
  containerRef,
  agroStructuresMask,
  aoiFields,
  vectorLayers = null,
  committedAoiGeometry,
  defaultLayerId,
  analysisDate,
  imageryDateAutoFollow = true,
  onMapDateFromChart,
  selectedFieldKey,
  onSelectedFieldKeyChange,
  onHighlightFieldKeysChange,
  mapboxToken,
  onStormMapOverlayChange,
  stormOverlayDismissEpoch = 0,
}: SiImageryTimeSeriesFloatingPanelProps) {
  const { scopedStorageKey } = useSiInstanceScope();
  const posStorageKey = scopedStorageKey(POS_KEY_BASE);
  const sizeStorageKey = scopedStorageKey(SIZE_KEY_BASE);
  const isolation = useMapOverlayIsolation(true, { native: true });
  const { ref: isolationRef, ...isolationHandlers } = isolation;
  const rootRef = useRef<HTMLElement | null>(null);
  const headRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number; w: number; h: number } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const [pos, setPos] = useState<SavedPos>(() => readInitialPos(posStorageKey));
  const [size, setSize] = useState<SavedSize>(() => readInitialSize(sizeStorageKey));
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
    setPos(p => clampToViewport(p.x, p.y, r.width, r.height));
    setSize(s => clampSize(s.w, s.h));
  }, [open, clampSize]);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-drag-exclude]')) return;
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      h: r.height,
    };
    setDragging(true);
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const nx = e.clientX - drag.dx;
    const ny = e.clientY - drag.dy;
    setPos(clampToViewport(nx, ny, drag.w, drag.h));
  }, []);

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
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
    window.addEventListener('pointermove', onDragPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onDragPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, endDrag, onDragPointerMove]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const root = rootRef.current;
      if (!root) return;
      const startW = size.w;
      const startH = size.h;
      resizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW,
        startH,
      };
      setResizing(true);
      e.preventDefault();
      e.stopPropagation();
    },
    [size],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize || e.pointerId !== resize.pointerId) return;
      const nw = resize.startW + (e.clientX - resize.startX);
      const nh = resize.startH + (e.clientY - resize.startY);
      setSize(clampSize(nw, nh));
    },
    [clampSize],
  );

  const endResize = useCallback(
    (e: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize || e.pointerId !== resize.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
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
    },
    [posStorageKey, sizeStorageKey],
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

  const resetSize = useCallback(() => {
    const next = clampDefaultSize();
    setSize(next);
    writeSavedSize(next, sizeStorageKey);
  }, [sizeStorageKey]);

  useEffect(() => {
    const onWinResize = () => {
      setSize(s => (s ? clampSize(s.w, s.h) : clampDefaultSize()));
      setPos(p => {
        if (!rootRef.current) return p;
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
    left: pos.x,
    top: pos.y,
    right: 'auto',
    bottom: 'auto',
    width: size.w,
    maxHeight: 'none',
  };
  const bodyStyle: CSSProperties = {
    height: size.h,
    minHeight: size.h,
    maxHeight: size.h,
    flex: '0 0 auto',
  };

  const panel = (
    <aside
      ref={rootRef}
      className={
        'si-its-float acp-shell acp-map-panel acp-map-panel--timeseries si-its-float--sized' +
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
      <div className="si-its-float__chrome">
        <div
          ref={setBodyIsolationRef}
          className="acp-map-panel__body si-its-float__body"
          style={bodyStyle}
          data-agrocloud-map-wheel-scroll=""
          {...isolationHandlers}
        >
          <SiImageryTimeSeriesPanel
            agroStructuresMask={agroStructuresMask}
            aoiFields={aoiFields}
            vectorLayers={vectorLayers}
            committedAoiGeometry={committedAoiGeometry}
            defaultLayerId={defaultLayerId}
            analysisDate={analysisDate}
            imageryDateAutoFollow={imageryDateAutoFollow}
            onMapDateFromChart={onMapDateFromChart}
            selectedFieldKey={selectedFieldKey}
            onSelectedFieldKeyChange={onSelectedFieldKeyChange}
            onHighlightFieldKeysChange={onHighlightFieldKeysChange}
            mapboxToken={mapboxToken}
            onStormMapOverlayChange={onStormMapOverlayChange}
            stormOverlayDismissEpoch={stormOverlayDismissEpoch}
          />
        </div>
        <button
          type="button"
          className="si-its-float__resize"
          aria-label="Resize panel (double-click to reset)"
          title="Drag to resize · double-click to reset"
          data-drag-exclude
          onPointerDown={onResizePointerDown}
          onDoubleClick={resetSize}
        >
          <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
        </button>
      </div>
    </aside>
  );

  return createPortal(panel, document.body);
}
