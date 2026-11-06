/**
 * Typed bridges between MapLibre GL 5 `Map` and the shared, Mapbox-shaped map helpers
 * (`setMapLibreGlobeProjection`, `nudgeSiMapboxGlobeCanvas`, …) and transform-request typing.
 *
 * The helpers only call methods MapLibre also exposes (or guard optional ones like `setFog?.`),
 * so these casts are type-level only — no runtime behavior.
 */
import type { FilterSpecification, Map as MaplibreMap, RequestParameters } from 'maplibre-gl'
import type {
  bindSiMapboxGlobeCanvasBoot,
  nudgeSiMapboxGlobeCanvas,
} from '@/modules/gis/map/siGlobeCockpit'
import type { setMapLibreGlobeProjection } from '@/modules/gis/map/maplibreGlobeEnvironment'

/** Map shape accepted by `setMapLibreGlobeProjection` / `setMapLibreMercatorProjection`. */
export type DevelopEliteProjectionMap = NonNullable<Parameters<typeof setMapLibreGlobeProjection>[0]>

/** Map shape accepted by `nudgeSiMapboxGlobeCanvas` / `bindSiMapboxGlobeCanvasBoot`. */
export type DevelopEliteGlobeNudgeMap = NonNullable<Parameters<typeof nudgeSiMapboxGlobeCanvas>[0]> &
  NonNullable<ReturnType<Parameters<typeof bindSiMapboxGlobeCanvasBoot>[0]>>

/** MapLibre `ProjectionSpecification` vs `{ type } | { name }` (Mapbox) — same runtime map. */
export function asDevelopEliteProjectionMap(map: MaplibreMap): DevelopEliteProjectionMap {
  return map as unknown as DevelopEliteProjectionMap
}

/** MapLibre `setProjection` signature vs SI globe nudge helper (Mapbox `{ name }`). */
export function asDevelopEliteGlobeNudgeMap(map: MaplibreMap): DevelopEliteGlobeNudgeMap {
  return map as unknown as DevelopEliteGlobeNudgeMap
}

/** MapLibre 5 has no `setFog` (Mapbox-only); callers guard with `setFog?.()`. */
export type DevelopEliteFogCapableMap = MaplibreMap & {
  setFog?: (fog: unknown) => unknown
}

export function asDevelopEliteFogCapableMap(map: MaplibreMap): DevelopEliteFogCapableMap {
  return map as DevelopEliteFogCapableMap
}

/**
 * MapLibre `RequestParameters.credentials` omits `'omit'` in its typings, but the value is passed
 * straight to `fetch()` (where `'omit'` is valid) — keep runtime value, align typing.
 */
export function asMapLibreRequestParameters(params: {
  url: string
  credentials?: 'omit' | 'same-origin' | 'include'
}): RequestParameters {
  return params as RequestParameters
}

/** Readonly `as const` expression arrays → MapLibre `FilterSpecification` (mutable tuple typings). */
export function asMapLibreFilter(filter: readonly unknown[]): FilterSpecification {
  return filter as unknown as FilterSpecification
}
