/**
 * AgroCloud Mapbox mouse navigation — portable spec + React integration.
 *
 * ## نقل السلوك إلى نظام Mapbox / react-map-gl آخر
 *
 * ```tsx
 * import Map from 'react-map-gl/mapbox'
 * import { useAgroCloudMapboxMouseHost } from '@/lib/agroCloudMapMouseBehavior'
 *
 * const mouse = useAgroCloudMapboxMouseHost({
 *   setViewState,
 *   getViewState: () => viewStateRef.current,
 *   getMapInstance: () => mapRef.current?.getMap?.(),
 * })
 *
 * <Map
 *   ref={mapRef}
 *   {...viewState}
 *   onMove={e => setViewState(e.viewState)}
 *   {...mouse.mapProps}
 *   {...mouse.mapPointerHandlers}
 *   style={{ width: '100%', height: '100%', cursor: mouse.mapCursor }}
 *   onLoad={e => mouse.applyBranding(e.target.getContainer())}
 * />
 * ```
 *
 * ## Satellite Intelligence (رسم + تحرير)
 * استخدم نفس `useAgroCloudMapOrbitNavigation` ثم:
 * - `tryStartOrbitFromMapEvent` في آخر `onMouseDown` بعد أدوات الرسم
 * - `applyOrbitMoveFromMapEvent` أول سطر في `onMouseMove`
 * - `endOrbitDrag` في `pointerup` / `pointercancel`
 * - `setMapboxDragPanEnabled(map, false)` أثناء السحب المخصص
 */
import { useMemo, type Dispatch, type SetStateAction } from 'react'
import {
  AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS,
  AGRO_CLOUD_MAP_MAX_PITCH,
  AGRO_CLOUD_MAP_MIN_PITCH,
  AGRO_CLOUD_ORBIT_BEARING_SENSITIVITY,
  AGRO_CLOUD_ORBIT_PITCH_SENSITIVITY,
  applyAgroCloudMapboxBranding,
  hideAgroCloudMapboxAttribution,
  useAgroCloudMapOrbitNavigation,
  type AgroCloudMapViewState,
  type AgroCloudMapboxMapLike,
} from './agroCloudMapNavigation'

export {
  AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS,
  AGRO_CLOUD_MAP_MAX_PITCH,
  AGRO_CLOUD_MAP_MIN_PITCH,
  AGRO_CLOUD_MAP_WHEEL_ZOOM_RATE,
  AGRO_CLOUD_ORBIT_BEARING_SENSITIVITY,
  AGRO_CLOUD_ORBIT_PITCH_SENSITIVITY,
  applyAgroCloudMapboxBranding,
  applyAgroCloudMapPerformanceTuning,
  applyAgroCloudMapWheelZoomAtPoint,
  bindAgroCloudMapWheelZoomPassthrough,
  ensureAgroCloudMapScrollZoom,
  syncAgroCloudMapboxCamera,
  useAgroCloudMapOrbitNavigation,
  clampAgroCloudMapPitch,
  computeAgroCloudOrbitViewState,
  canStartAgroCloudOrbitDrag,
  canStartAgroCloudRightElevationOrbitDrag,
  canStartAgroCloudShiftOrbitDrag,
  setMapboxDragPanEnabled,
  readMapBearingPitch,
} from './agroCloudMapNavigation'

export type AgroCloudMapPointerHandlers = {
  onMouseDown: (evt: { originalEvent?: MouseEvent }) => boolean
  onMouseMove: (evt: { originalEvent?: MouseEvent }) => boolean
  onTouchStart: (evt: { originalEvent?: MouseEvent }) => boolean
  onTouchMove: (evt: { originalEvent?: MouseEvent }) => boolean
}

/** مواصفات سلوك الماوس — للنسخ إلى أنظمة أخرى (Mapbox GL / react-map-gl). */
export const AGRO_CLOUD_MAP_MOUSE_BEHAVIOR_SPEC = {
  pan: {
    gesture: 'زر الماوس الأيسر + سحب',
    cursor: 'grab',
    notes: 'السحب الافتراضي لـ Mapbox dragPan',
  },
  orbit: {
    gesture: 'Shift + زر الماوس الأيسر + سحب',
    cursor: 'grab',
    disablesPanWhileActive: true,
    bearingSensitivity: AGRO_CLOUD_ORBIT_BEARING_SENSITIVITY,
    pitchSensitivity: AGRO_CLOUD_ORBIT_PITCH_SENSITIVITY,
    pitchClamp: { min: AGRO_CLOUD_MAP_MIN_PITCH, max: AGRO_CLOUD_MAP_MAX_PITCH },
    notes: 'أفقي = bearing، عمودي = pitch (معكوس)',
  },
  elevation3d: {
    gesture: 'زر الماوس الأيمن + سحب',
    cursor: 'grab',
    disablesPanWhileActive: true,
    autoEnable3dElevation: true,
    notes: 'يفعّل تلقائياً عرض الارتفاع 3D أثناء السحب',
  },
  zoom: {
    wheel: true,
    doubleClick: true,
    touchPinch: true,
    cooperativeGestures: false,
  },
  rotate: {
    rightButtonDrag: false,
    touchRotate: true,
    pitchWithRotate: true,
    notes: 'Right-drag uses custom 3D elevation orbit instead of native dragRotate',
  },
  mapboxProps: AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS,
} as const

export type UseAgroCloudMapboxMouseHostOptions = {
  setViewState: Dispatch<SetStateAction<AgroCloudMapViewState>>
  getViewState: () => AgroCloudMapViewState
  getMapInstance: () => AgroCloudMapboxMapLike | null | undefined
  isOrbitBlocked?: () => boolean
  onOrbitMoved?: () => void
  /** Cursor when map is idle (default grab). */
  idleCursor?: string
}

/**
 * Hook جاهز لخرائط Mapbox بسيطة (مثل GIS Map globe).
 * للخرائط المعقدة (رسم/تحرير) استخدم `useAgroCloudMapOrbitNavigation` مباشرة.
 */
export function useAgroCloudMapboxMouseHost({
  setViewState,
  getViewState,
  getMapInstance,
  isOrbitBlocked,
  onOrbitMoved,
  idleCursor = 'grab',
}: UseAgroCloudMapboxMouseHostOptions) {
  const orbit = useAgroCloudMapOrbitNavigation({
    setViewState,
    getViewState,
    getMapInstance,
    isOrbitBlocked,
    onOrbitMoved,
  })

  const mapPointerHandlers: AgroCloudMapPointerHandlers = useMemo(
    () => ({
      onMouseDown: orbit.tryStartOrbitFromMapEvent,
      onMouseMove: orbit.applyOrbitMoveFromMapEvent,
      onTouchStart: orbit.tryStartOrbitFromMapEvent,
      onTouchMove: orbit.applyOrbitMoveFromMapEvent,
    }),
    [orbit.tryStartOrbitFromMapEvent, orbit.applyOrbitMoveFromMapEvent],
  )

  return {
    spec: AGRO_CLOUD_MAP_MOUSE_BEHAVIOR_SPEC,
    mapProps: AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS,
    mapPointerHandlers,
    mapCursor: idleCursor,
    orbit,
    applyBranding: applyAgroCloudMapboxBranding,
    setDragPanEnabled: orbit.setDragPanEnabled,
  }
}

/** معالجات الماوس فقط (بدون hook) — عند وجود orbit navigation مسبقاً. */
export function getAgroCloudMapboxPointerHandlers(orbit: {
  tryStartOrbitFromMapEvent: AgroCloudMapPointerHandlers['onMouseDown']
  applyOrbitMoveFromMapEvent: AgroCloudMapPointerHandlers['onMouseMove']
}): AgroCloudMapPointerHandlers {
  return {
    onMouseDown: orbit.tryStartOrbitFromMapEvent,
    onMouseMove: orbit.applyOrbitMoveFromMapEvent,
    onTouchStart: orbit.tryStartOrbitFromMapEvent,
    onTouchMove: orbit.applyOrbitMoveFromMapEvent,
  }
}
