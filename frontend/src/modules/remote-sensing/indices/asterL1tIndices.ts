/**
 * ASTER L1T environmental & mineral indices for the Remote Sensing toolbox.
 * Band formulas follow ASTER VNIR / SWIR / TIR conventions (Planetary Computer STAC).
 */

import type { RemoteSensingLayerSelectGroup } from './agroCompositeIndices'

export type AsterL1tIndexDef = {
  id: string
  label: string
  /** Formula + application — shown in Layer select tooltip. */
  scientificName: string
  formula: string
  application: string
  group: 'bands' | 'vegetation' | 'thermal' | 'soil' | 'mineral'
}

export const ASTER_L1T_INDICES: readonly AsterL1tIndexDef[] = [
  {
    id: 'VNIR',
    label: 'VNIR',
    formula: 'B1 · B2 · B3',
    application: 'Visible / near-infrared true color composite',
    scientificName: 'ASTER VNIR True Color',
    group: 'bands',
  },
  {
    id: 'SWIR',
    label: 'SWIR',
    formula: 'B4 · B5 · B6–B9',
    application: 'Shortwave infrared composite for geology and moisture',
    scientificName: 'ASTER SWIR Composite',
    group: 'bands',
  },
  {
    id: 'TIR',
    label: 'TIR',
    formula: 'B10–B14',
    application: 'Thermal infrared composite for surface temperature',
    scientificName: 'ASTER TIR Composite',
    group: 'bands',
  },
  {
    id: 'NDVI',
    label: 'NDVI',
    formula: '(B3 − B2) / (B3 + B2)',
    application: 'Vegetation density and health monitoring',
    scientificName: 'Normalized Difference Vegetation Index · (B3−B2)/(B3+B2)',
    group: 'vegetation',
  },
  {
    id: 'NDWI',
    label: 'NDWI',
    formula: '(B2 − B3) / (B2 + B3)',
    application: 'Surface water detection',
    scientificName: 'Normalized Difference Water Index · (B2−B3)/(B2+B3)',
    group: 'vegetation',
  },
  {
    id: 'NDMI',
    label: 'NDMI',
    formula: '(B3 − B4) / (B3 + B4)',
    application: 'Vegetation moisture and water stress',
    scientificName: 'Normalized Difference Moisture Index · (B3−B4)/(B3+B4)',
    group: 'vegetation',
  },
  {
    id: 'SAVI',
    label: 'SAVI',
    formula: '((B3 − B2) / (B3 + B2 + L)) × (1 + L)',
    application: 'Vegetation monitoring in sparse areas',
    scientificName: 'Soil Adjusted Vegetation Index · ((B3−B2)/(B3+B2+L))×(1+L)',
    group: 'vegetation',
  },
  {
    id: 'EVI',
    label: 'EVI',
    formula: '2.5 × (B3 − B2) / (B3 + 6×B2 − 7.5×B1 + 1)',
    application: 'Enhanced vegetation analysis',
    scientificName: 'Enhanced Vegetation Index · 2.5×(B3−B2)/(B3+6×B2−7.5×B1+1)',
    group: 'vegetation',
  },
  {
    id: 'NBR',
    label: 'NBR',
    formula: '(B3 − B4) / (B3 + B4)',
    application: 'Burned area and fire impact mapping',
    scientificName: 'Normalized Burn Ratio · (B3−B4)/(B3+B4)',
    group: 'vegetation',
  },
  {
    id: 'BSI',
    label: 'BSI',
    formula: '((B4 + B2) − (B3 + B1)) / ((B4 + B2) + (B3 + B1))',
    application: 'Bare soil and exposed rock detection',
    scientificName: 'Bare Soil Index · ((B4+B2)−(B3+B1))/((B4+B2)+(B3+B1))',
    group: 'soil',
  },
  {
    id: 'LST',
    label: 'LST',
    formula: 'Derived from ASTER TIR bands (B10–B14)',
    application: 'Surface temperature monitoring',
    scientificName: 'Land Surface Temperature · ASTER TIR B10–B14',
    group: 'thermal',
  },
  {
    id: 'NDIE',
    label: 'NDIE',
    formula: '(B13 − B14) / (B13 + B14)',
    application: 'Surface emissivity analysis',
    scientificName: 'Normalized Difference Index of Emissivity · (B13−B14)/(B13+B14)',
    group: 'thermal',
  },
  {
    id: 'TAI',
    label: 'TAI',
    formula: 'B14 / B13',
    application: 'Thermal anomaly detection',
    scientificName: 'Thermal Anomaly Index · B14/B13',
    group: 'thermal',
  },
  {
    id: 'SI_SAL',
    label: 'SI',
    formula: 'B4 / B2',
    application: 'Soil salinity assessment',
    scientificName: 'Salinity Index · B4/B2',
    group: 'soil',
  },
  {
    id: 'CSI',
    label: 'CSI',
    formula: 'B5 / B6',
    application: 'Clay mineral and soil composition mapping',
    scientificName: 'Clay Soil Index · B5/B6',
    group: 'soil',
  },
  {
    id: 'CI',
    label: 'CI',
    formula: 'B7 / B8',
    application: 'Carbonate rock detection',
    scientificName: 'Carbonate Index · B7/B8',
    group: 'mineral',
  },
  {
    id: 'REI',
    label: 'REI',
    formula: 'B5 / B3',
    application: 'Exposed rock mapping',
    scientificName: 'Rock Exposure Index · B5/B3',
    group: 'soil',
  },
  {
    id: 'IOI',
    label: 'IOI',
    formula: 'B2 / B1',
    application: 'Iron oxide and alteration mapping',
    scientificName: 'Iron Oxide Index · B2/B1',
    group: 'mineral',
  },
  {
    id: 'FMI',
    label: 'FMI',
    formula: 'B6 / B8',
    application: 'Ferrous mineral detection',
    scientificName: 'Ferrous Mineral Index · B6/B8 (also B4/B3 ferrous ratio)',
    group: 'mineral',
  },
  {
    id: 'CAI',
    label: 'CAI',
    formula: 'B5 / B6',
    application: 'Hydrothermal clay alteration zones',
    scientificName: 'Clay Alteration Index · B5/B6',
    group: 'mineral',
  },
  {
    id: 'OHI',
    label: 'OHI',
    formula: 'B4 / B6',
    application: 'Hydrothermal alteration detection',
    scientificName: 'Hydroxyl Alteration Index · B4/B6',
    group: 'mineral',
  },
  {
    id: 'SILICA',
    label: 'SI·Silica',
    formula: 'B11 / B10',
    application: 'Silica-rich zone detection',
    scientificName: 'Silica Index · B11/B10',
    group: 'mineral',
  },
  {
    id: 'QI',
    label: 'QI',
    formula: 'B11 / B10',
    application: 'Quartz and siliceous alteration',
    scientificName: 'Quartz Index · B11/B10',
    group: 'mineral',
  },
  {
    id: 'CAI2',
    label: 'CAI₂',
    formula: 'B7 / B8',
    application: 'Carbonate alteration mapping',
    scientificName: 'Carbonate Alteration Index · B7/B8',
    group: 'mineral',
  },
  {
    id: 'NDAI',
    label: 'NDAI',
    formula: '(B4 − B6) / (B4 + B6)',
    application: 'Hydrothermal alteration zones',
    scientificName: 'Normalized Difference Alteration Index · (B4−B6)/(B4+B6)',
    group: 'mineral',
  },
  {
    id: 'NDMI_M',
    label: 'NDMI-M',
    formula: '(B5 − B6) / (B5 + B6)',
    application: 'Mineral spectral variation',
    scientificName: 'Normalized Difference Mineral Index · (B5−B6)/(B5+B6)',
    group: 'mineral',
  },
] as const

const GROUP_META: Record<
  AsterL1tIndexDef['group'],
  { id: string; label: string }
> = {
  bands: { id: 'aster-bands', label: 'ASTER Bands' },
  vegetation: { id: 'aster-vegetation', label: 'ASTER L1T · Vegetation & Moisture' },
  thermal: { id: 'aster-thermal', label: 'ASTER L1T · Thermal' },
  soil: { id: 'aster-soil', label: 'ASTER L1T · Soil & Geology' },
  mineral: { id: 'aster-mineral', label: 'ASTER L1T · Mineral Alteration' },
}

/** Layer dropdown groups for ASTER L1T provider. */
export function buildAsterL1tLayerSelectGroups(): RemoteSensingLayerSelectGroup[] {
  const byGroup = new Map<AsterL1tIndexDef['group'], AsterL1tIndexDef[]>()
  for (const idx of ASTER_L1T_INDICES) {
    const list = byGroup.get(idx.group) ?? []
    list.push(idx)
    byGroup.set(idx.group, list)
  }
  const order: AsterL1tIndexDef['group'][] = ['bands', 'vegetation', 'thermal', 'soil', 'mineral']
  return order
    .map(g => {
      const meta = GROUP_META[g]
      const indices = byGroup.get(g) ?? []
      return {
        id: meta.id,
        label: meta.label,
        options: indices.map(idx => ({
          id: idx.id,
          label: idx.label,
          // Band composites show short subtitle; indices keep formula + application.
          scientificName:
            g === 'bands' ? idx.scientificName : `${idx.scientificName} — ${idx.application}`,
        })),
      } satisfies RemoteSensingLayerSelectGroup
    })
    .filter(g => g.options.length > 0)
}

export function isAsterL1tIndexId(id: string | null | undefined): boolean {
  const u = String(id || '')
    .trim()
    .toUpperCase()
  if (!u) return false
  return ASTER_L1T_INDICES.some(idx => idx.id.toUpperCase() === u)
}

export function asterL1tIndexDef(id: string): AsterL1tIndexDef | undefined {
  const u = id.trim().toUpperCase()
  return ASTER_L1T_INDICES.find(idx => idx.id.toUpperCase() === u)
}
