import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type SiAddSourceAnchoredPanelProps = {
  open: boolean;
  onClose: () => void;
  anchorId?: string;
  wide?: boolean;
  panelClassName?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
};

export function SiAddSourceAnchoredPanel({
  open,
  onClose,
  anchorId = 'map-toolbox-add-gis-layer-btn',
  wide = false,
  panelClassName = '',
  ariaLabelledBy,
  children,
}: SiAddSourceAnchoredPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const anchor = document.getElementById(anchorId);
    const panel = panelRef.current;
    if (!anchor) return;
    const ar = anchor.getBoundingClientRect();
    const pw = panel?.offsetWidth || (wide ? 320 : 268);
    const ph = panel?.offsetHeight || 360;
    const margin = 8;
    let left = ar.left - pw - margin;
    if (left < margin) left = Math.max(margin, ar.right - pw);
    if (left + pw > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pw - margin);
    }
    let top = ar.top;
    if (top + ph > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - ph - margin);
    }
    setCoords({ top, left });
  }, [anchorId, wide]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const raf = window.requestAnimationFrame(() => place());
    return () => window.cancelAnimationFrame(raf);
  }, [open, place, wide]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (document.getElementById(anchorId)?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onReflow = () => place();
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, onClose, anchorId, place]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="si-add-source-anchored-scrim" aria-hidden onMouseDown={onClose} />
      <div
        ref={panelRef}
        className={
          'si-add-source-anchored' +
          (wide ? ' si-add-source-anchored--wide' : '') +
          (panelClassName ? ` ${panelClassName}` : '')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        style={coords ? { top: coords.top, left: coords.left } : { visibility: 'hidden' as const }}
        onMouseDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
