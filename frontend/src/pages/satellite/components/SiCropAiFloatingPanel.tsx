import { type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import './SiCropAiFloatingPanel.css';

export type SiCropAiFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  containerRef?: RefObject<HTMLElement | null>;
};

/**
 * Crop AI runs in its own floating shell — isolated from the shared processing stack,
 * dock embed host, and other toolbox panels (same pattern as Imagery Time Series).
 */
export function SiCropAiFloatingPanel({
  open,
  onClose,
  children,
  containerRef,
}: SiCropAiFloatingPanelProps) {
  const isolation = useMapOverlayIsolation(true, { native: true });
  const { ref: isolationRef, ...isolationHandlers } = isolation;

  if (!open || typeof document === 'undefined') return null;

  const host = containerRef?.current ?? document.body;

  const panel = (
    <aside
      className="si-crop-ai-float"
      role="dialog"
      aria-label="Crop AI"
      aria-modal="false"
      dir="ltr"
      ref={isolationRef as (node: HTMLElement | null) => void}
      {...isolationHandlers}
    >
      <header className="si-crop-ai-float__head">
        <div className="si-crop-ai-float__head-text">
          <span className="si-crop-ai-float__kicker">Prithvi</span>
          <h2 className="si-crop-ai-float__title">Crop AI</h2>
        </div>
        <button
          type="button"
          className="si-crop-ai-float__close"
          onClick={onClose}
          aria-label="Close Crop AI"
          title="Close"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="si-crop-ai-float__body" data-agrocloud-map-wheel-scroll="">
        {children}
      </div>
    </aside>
  );

  return createPortal(panel, host);
}
