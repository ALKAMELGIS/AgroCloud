/**
 * ESRI D8 Flow Direction symbology (GIS Dictionary).
 * Codes are powers of 2; colours match the standard 8-direction wheel.
 */

import type { HydroLegend } from './hydroEngine'

/** Neighbour offsets matching ESRI D8 order (E→SE→S→SW→W→NW→N→NE). Image y grows south. */
export const ESRI_D8_DX = [1, 1, 0, -1, -1, -1, 0, 1] as const
export const ESRI_D8_DY = [0, 1, 1, 1, 0, -1, -1, -1] as const
export const ESRI_D8_DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2] as const

export type EsriD8FlowDirection = {
  /** Power-of-two ESRI code (1…128). */
  code: number
  /** Index into ESRI_D8_DX/DY (0…7). */
  dirIndex: number
  name: string
  /** Cardinal / intercardinal arrow for legends. */
  arrow: string
  rgb: readonly [number, number, number]
}

/** Official ESRI-style D8 direction palette (report + interactive map). */
export const ESRI_D8_FLOW_DIRECTIONS: readonly EsriD8FlowDirection[] = [
  { code: 1, dirIndex: 0, name: 'East', arrow: '→', rgb: [0, 166, 81] },
  { code: 2, dirIndex: 1, name: 'Southeast', arrow: '↘', rgb: [154, 205, 50] },
  { code: 4, dirIndex: 2, name: 'South', arrow: '↓', rgb: [176, 196, 222] },
  { code: 8, dirIndex: 3, name: 'Southwest', arrow: '↙', rgb: [0, 191, 255] },
  { code: 16, dirIndex: 4, name: 'West', arrow: '←', rgb: [65, 105, 225] },
  { code: 32, dirIndex: 5, name: 'Northwest', arrow: '↖', rgb: [147, 112, 219] },
  { code: 64, dirIndex: 6, name: 'North', arrow: '↑', rgb: [220, 20, 60] },
  { code: 128, dirIndex: 7, name: 'Northeast', arrow: '↗', rgb: [255, 185, 15] },
] as const

/** Flat / sink / no-data (ESRI NoData). */
export const ESRI_D8_NODATA_RGB: readonly [number, number, number] = [90, 90, 90]

const BY_DIR_INDEX = new Map(ESRI_D8_FLOW_DIRECTIONS.map(d => [d.dirIndex, d]))
const BY_CODE = new Map(ESRI_D8_FLOW_DIRECTIONS.map(d => [d.code, d]))

export function esriD8CodeFromDirIndex(dirIndex: number): number {
  return BY_DIR_INDEX.get(dirIndex)?.code ?? 0
}

export function esriD8RgbFromDirIndex(dirIndex: number): readonly [number, number, number] {
  return BY_DIR_INDEX.get(dirIndex)?.rgb ?? ESRI_D8_NODATA_RGB
}

export function esriD8RgbFromCode(code: number): readonly [number, number, number] {
  if (!(code > 0)) return ESRI_D8_NODATA_RGB
  return BY_CODE.get(code)?.rgb ?? ESRI_D8_NODATA_RGB
}

/** Semi-transparent so the satellite basemap remains readable under the D8 wheel. */
export const ESRI_D8_MAP_ALPHA = 178

export function buildEsriD8FlowDirectionLegend(): HydroLegend {
  return {
    title: 'Flow Direction (D8)',
    kind: 'classes',
    swatches: [
      ...ESRI_D8_FLOW_DIRECTIONS.map(d => ({
        color: `rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`,
        label: `${d.arrow} ${d.name} (${d.code})`,
      })),
      {
        color: `rgb(${ESRI_D8_NODATA_RGB[0]},${ESRI_D8_NODATA_RGB[1]},${ESRI_D8_NODATA_RGB[2]})`,
        label: '○ Flat / sink (NoData)',
      },
    ],
    note: 'ESRI D8 · colour = flow direction · basemap visible underneath',
  }
}
