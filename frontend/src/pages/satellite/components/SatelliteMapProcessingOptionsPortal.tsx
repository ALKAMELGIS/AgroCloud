import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renders processing UI either inside the map toolbox embed host (portal) or inline (fallback).
 */
export function SatelliteMapProcessingOptionsPortal(props: {
  portalTarget: HTMLElement | null;
  children: ReactNode;
}) {
  const { portalTarget, children } = props;
  if (!children) return null;
  if (portalTarget) return createPortal(children, portalTarget);
  return <>{children}</>;
}
