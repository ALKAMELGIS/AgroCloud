import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';

export type MapToolsDockProps = {
  /** react-map-gl ref — `ref.current.getMap()` returns the Mapbox `Map` instance. */
  mapRef: RefObject<any>;
  mapLoaded: boolean;
  children: ReactNode;
};

/**
 * Renders children inside `map.getCanvasContainer()` so tools are a true docked overlay
 * on the map canvas (same stacking context as the WebGL canvas), not a sibling above the page.
 *
 * The host uses `pointer-events: none` so pan/zoom hit the canvas; interactive tool UI opts in with `pointer-events: auto`.
 */
export function MapToolsDock({ mapRef, mapLoaded, children }: MapToolsDockProps) {
  const [canvasContainer, setCanvasContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      setCanvasContainer(null);
      return;
    }

    let cancelled = false;

    const resolve = () => {
      if (cancelled) return;
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      const el =
        map && typeof map.getCanvasContainer === 'function' ? (map.getCanvasContainer() as HTMLElement) : null;
      setCanvasContainer(el ?? null);
    };

    resolve();
    const raf = window.requestAnimationFrame(resolve);

    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const onReady = () => resolve();
    if (map && typeof map.on === 'function') {
      map.on('load', onReady);
      map.on('styledata', onReady);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(raf);
        map.off('load', onReady);
        map.off('styledata', onReady);
      };
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [mapLoaded, mapRef]);

  /* Keep toolbox mounted during basemap style swaps — only hide until canvas container exists. */
  if (!canvasContainer) return null;

  return createPortal(
    <div className="si-map-tools-dock-host" data-si-map-tools-dock="" role="presentation">
      {children}
    </div>,
    canvasContainer,
  );
}
