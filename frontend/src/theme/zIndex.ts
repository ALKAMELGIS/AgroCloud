/**
 * Central z-index layers. Map legacy CSS values during migration — see docs/design-system/migration.md
 */
export const agroZIndex = {
  base: 0,
  content: 1,
  mapControls: 1300,
  mapPanel: 1400,
  appBar: 1500,
  drawer: 1600,
  floatingPanel: 1700,
  dropdown: 1800,
  popover: 1900,
  drawerOverlay: 2000,
  modal: 2400,
  gisModal: 2500,
  snackbar: 2600,
  splash: 9999,
} as const

export type AgroZIndexKey = keyof typeof agroZIndex

/** Legacy CSS value → token name (for refactors). */
export const legacyZIndexMap: Record<string, AgroZIndexKey> = {
  '11501': 'appBar',
  '12000': 'drawer',
  '24000': 'modal',
  '25000': 'gisModal',
  '99999': 'splash',
}
