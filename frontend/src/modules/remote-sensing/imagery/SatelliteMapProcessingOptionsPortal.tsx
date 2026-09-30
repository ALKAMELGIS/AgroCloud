import { createPortal } from 'react-dom';

import type { ReactNode } from 'react';



/**

 * Renders processing UI inside the map toolbox embed host when the dock panel is open.

 * Falls back to inline rendering in the proc stack until the embed host mounts — otherwise

 * Remote sensing / WMS tools appear blank on first rail click.

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

