import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renders processing UI inside the map toolbox embed host once the dock mounts it.
 * Avoids inline fallback that duplicated panels and desynced rail active state.
 */
export function SatelliteMapProcessingOptionsPortal(props: {
  portalTarget: HTMLElement | null;
  children: ReactNode;
}) {
  const { portalTarget, children } = props;
  if (!children || !portalTarget) return null;
  return createPortal(children, portalTarget);
}
