/**
 * Reserve trailing-edge space for the map toolbox dock so popups / markers
 * stay in the visible map canvas and do not cover the analysis panel.
 */

const DEFAULT_DOCK_RESERVE_PX = 56;
const DOCK_OPEN_MIN_RESERVE_PX = 280;

/** Width of toolbox rail + open panel along the map trailing edge (px). */
export function readSiMapToolboxDockReservePx(mapContainer: HTMLElement | null | undefined): number {
  if (!mapContainer || typeof document === 'undefined') return DEFAULT_DOCK_RESERVE_PX;
  const root = mapContainer.closest('.si-map-container') ?? mapContainer;
  const dock = root.querySelector('.si-sat-ctx-dock--map') as HTMLElement | null;
  if (!dock) return DEFAULT_DOCK_RESERVE_PX;
  const rect = dock.getBoundingClientRect();
  if (!rect.width || !rect.height) return DEFAULT_DOCK_RESERVE_PX;
  const open = dock.classList.contains('si-sat-ctx-dock--open');
  return Math.max(DEFAULT_DOCK_RESERVE_PX, Math.ceil(rect.width), open ? DOCK_OPEN_MIN_RESERVE_PX : 0);
}

/** Shift marker/popup left when its screen x would intrude into the dock reserve. */
export function shiftMarkerOffsetForDock(
  screenX: number,
  popupWidth: number,
  containerWidth: number,
  dockReservePx: number,
  pad = 12,
): number {
  if (!Number.isFinite(screenX) || !Number.isFinite(containerWidth) || containerWidth <= 0) return 0;
  const reserve = Math.max(0, dockReservePx) + pad;
  const rightLimit = containerWidth - reserve;
  const popupHalf = Math.max(80, popupWidth) / 2;
  const overflow = screenX + popupHalf - rightLimit;
  return overflow > 0 ? -Math.ceil(overflow) : 0;
}

export type SiMapPopupClampInput = {
  containerWidth: number;
  containerHeight: number;
  popupWidth: number;
  popupHeight: number;
  anchorX: number;
  anchorY: number;
  dockReservePx?: number;
  pad?: number;
  offset?: number;
};

export type SiMapPopupClampResult = {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
  arrowLeft: number;
};

/** Clamp absolute popup box inside map container minus dock reserve (trailing edge). */
export function clampSiMapPopupToContainer(input: SiMapPopupClampInput): SiMapPopupClampResult {
  const pad = input.pad ?? 10;
  const offset = input.offset ?? 14;
  const w = Math.max(1, input.popupWidth);
  const h = Math.max(1, input.popupHeight);
  const reserve = Math.max(0, input.dockReservePx ?? DEFAULT_DOCK_RESERVE_PX);
  const maxX = Math.max(pad, input.containerWidth - w - pad - reserve);

  const canPlaceTop = input.anchorY - h - offset >= pad;
  const placement: 'top' | 'bottom' = canPlaceTop ? 'top' : 'bottom';
  const desiredLeft = input.anchorX - w / 2;
  const desiredTop = placement === 'top' ? input.anchorY - h - offset : input.anchorY + offset;

  const left = Math.max(pad, Math.min(maxX, desiredLeft));
  const top = Math.max(pad, Math.min(input.containerHeight - h - pad, desiredTop));
  const arrowLeft = Math.max(16, Math.min(w - 16, input.anchorX - left));
  return { left, top, placement, arrowLeft };
}
