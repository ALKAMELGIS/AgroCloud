import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Marker, useMap } from 'react-map-gl/mapbox';
import {
  readSiMapToolboxDockReservePx,
  shiftMarkerOffsetForDock,
} from '../../../lib/siMapDockReservedZone';

export type SiMapDockAwareMarkerProps = {
  longitude: number;
  latitude: number;
  anchor?: 'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset?: [number, number];
  className?: string;
  /** Estimated popup width used to nudge left before overlapping the toolbox dock. */
  popupWidth?: number;
  children: ReactNode;
};

const DEFAULT_DOCK_RESERVE_FALLBACK = 56;

/**
 * Map marker whose horizontal offset shifts left when the anchored popup would
 * cover the trailing-edge toolbox / analysis panel.
 */
export function SiMapDockAwareMarker({
  longitude,
  latitude,
  anchor = 'bottom',
  offset: baseOffset = [0, 0],
  className,
  popupWidth = 300,
  children,
}: SiMapDockAwareMarkerProps) {
  const mapRef = useMap();
  const [dockShiftX, setDockShiftX] = useState(0);
  const dockReserveRef = useRef(DEFAULT_DOCK_RESERVE_FALLBACK);
  const rafRef = useRef<number | null>(null);
  const lastShiftRef = useRef(0);

  useEffect(() => {
    const map = mapRef?.current?.getMap?.() ?? mapRef?.getMap?.();
    if (!map) return;

    const syncDockReserve = () => {
      dockReserveRef.current = readSiMapToolboxDockReservePx(map.getContainer());
    };

    const applyShift = () => {
      rafRef.current = null;
      if (popupWidth <= 0) {
        if (lastShiftRef.current !== 0) {
          lastShiftRef.current = 0;
          setDockShiftX(0);
        }
        return;
      }
      const container = map.getContainer();
      const pt = map.project([longitude, latitude]);
      const next = shiftMarkerOffsetForDock(
        pt.x,
        popupWidth,
        container.clientWidth,
        dockReserveRef.current,
      );
      if (next === lastShiftRef.current) return;
      lastShiftRef.current = next;
      setDockShiftX(next);
    };

    const scheduleShift = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(applyShift);
    };

    const onResize = () => {
      syncDockReserve();
      scheduleShift();
    };

    const onIdle = () => {
      syncDockReserve();
      scheduleShift();
    };

    syncDockReserve();
    scheduleShift();

    map.on('move', scheduleShift);
    map.on('resize', onResize);
    map.on('idle', onIdle);

    return () => {
      map.off('move', scheduleShift);
      map.off('resize', onResize);
      map.off('idle', onIdle);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [mapRef, longitude, latitude, popupWidth]);

  const offset: [number, number] = [baseOffset[0] + dockShiftX, baseOffset[1]];

  return (
    <Marker
      longitude={longitude}
      latitude={latitude}
      anchor={anchor}
      offset={offset}
      className={className}
    >
      {children}
    </Marker>
  );
}
