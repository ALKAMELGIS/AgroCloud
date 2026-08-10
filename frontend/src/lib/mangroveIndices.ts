/**
 * Mangrove spectral indices (Sentinel-2 L2A).
 *
 * MVI  — Mangrove Vegetation Index (Baloloy et al.): (B08−B03)/(B11−B03)
 * REMI — Red-Edge Mangrove Index: ((B06−B05)/(B06+B05))·((B03−B11)/(B03+B11))
 * MI   — Mangrove Index: (B08−B04)/(B11+B04)
 * MFI  — Mangrove Forest Index: (RE_mean−B8A)/(RE_mean+B8A), RE_mean=(B05+B06+B07)/3
 * NDRE-B5/B6/B7 — (B8A−RE)/(B8A+RE) with RE = B05 / B06 / B07
 * CI-RE — Chlorophyll Index Red Edge: (B8A/B05)−1
 * GCI-CHL — Green Chlorophyll Index: (B08/B03)−1 (ID avoids gold-exploration GCI)
 * MTCI — MERIS Terrestrial Chlorophyll Index: (B06−B05)/(B05−B04)
 * REIP — Red Edge Inflection Point (Guyot & Baret): 705+35×(((B04+B07)/2−B05)/(B06−B05))
 */

export const MVI_LAYER_ID = 'MVI'
export const REMI_LAYER_ID = 'REMI'
export const MI_LAYER_ID = 'MI'
export const MFI_LAYER_ID = 'MFI'
export const NDRE_B5_LAYER_ID = 'NDRE-B5'
export const NDRE_B6_LAYER_ID = 'NDRE-B6'
export const NDRE_B7_LAYER_ID = 'NDRE-B7'
export const CI_RE_LAYER_ID = 'CI-RE'
export const GCI_CHL_LAYER_ID = 'GCI-CHL'
export const MTCI_LAYER_ID = 'MTCI'
export const REIP_LAYER_ID = 'REIP'

export const MANGROVE_LAYER_IDS = [
  MVI_LAYER_ID,
  REMI_LAYER_ID,
  MI_LAYER_ID,
  MFI_LAYER_ID,
  NDRE_B5_LAYER_ID,
  NDRE_B6_LAYER_ID,
  NDRE_B7_LAYER_ID,
  CI_RE_LAYER_ID,
  GCI_CHL_LAYER_ID,
  MTCI_LAYER_ID,
  REIP_LAYER_ID,
] as const

export type MangroveLayerId = (typeof MANGROVE_LAYER_IDS)[number]

export const MVI_SCIENTIFIC_NAME =
  'Mangrove Vegetation Index — (B08−B03)/(B11−B03) · mangrove detection'
export const REMI_SCIENTIFIC_NAME =
  'Red-Edge Mangrove Index — ((B06−B05)/(B06+B05))·((B03−B11)/(B03+B11)) · mangrove discrimination'
export const MI_SCIENTIFIC_NAME =
  'Mangrove Index — (B08−B04)/(B11+B04) · mangrove extraction'
export const MFI_SCIENTIFIC_NAME =
  'Mangrove Forest Index — ((B05+B06+B07)/3−B8A)/((B05+B06+B07)/3+B8A) · mangrove forest discrimination'
export const NDRE_B5_SCIENTIFIC_NAME =
  'Normalized Difference Red Edge (B5) — (B8A−B05)/(B8A+B05) · 10-class · mangrove / chlorophyll sensitivity'
export const NDRE_B6_SCIENTIFIC_NAME =
  'Normalized Difference Red Edge (B6) — (B8A−B06)/(B8A+B06) · 10-class · mangrove / chlorophyll sensitivity'
export const NDRE_B7_SCIENTIFIC_NAME =
  'Normalized Difference Red Edge (B7) — (B8A−B07)/(B8A+B07) · 10-class · mangrove / chlorophyll sensitivity'
export const CI_RE_SCIENTIFIC_NAME =
  'Chlorophyll Index Red Edge — (B8A/B05)−1 · sensitive to chlorophyll content'
export const GCI_CHL_SCIENTIFIC_NAME =
  'Green Chlorophyll Index — (B08/B03)−1 · relative chlorophyll / vegetation vigor'
export const MTCI_SCIENTIFIC_NAME =
  'MERIS Terrestrial Chlorophyll Index — (B06−B05)/(B05−B04) · highly sensitive to chlorophyll variation'
export const REIP_SCIENTIFIC_NAME =
  'Red Edge Inflection Point — 705+35×(((B04+B07)/2−B05)/(B06−B05)) · Guyot & Baret · chlorophyll / condition'

/** Safe JS expressions evaluated after CORE_INDICES_BLOCK defines these locals. */
export const MVI_EXPR = 'mvi'
export const REMI_EXPR = 'remi'
export const MI_EXPR = 'mi'
export const MFI_EXPR = 'mfi'
export const NDRE_B5_EXPR = 'ndre_b5'
export const NDRE_B6_EXPR = 'ndre_b6'
export const NDRE_B7_EXPR = 'ndre_b7'
export const CI_RE_EXPR = 'cire'
export const GCI_CHL_EXPR = 'gci_chl'
export const MTCI_EXPR = 'mtci'
export const REIP_EXPR = 'reip'

export type MangroveIndexDef = {
  id: string
  label: string
  scientificName: string
  deltaId: string
  deltaLabel: string
  expr: string
}

export const MANGROVE_INDEX_DEFS: readonly MangroveIndexDef[] = [
  {
    id: MVI_LAYER_ID,
    label: 'MVI',
    scientificName: MVI_SCIENTIFIC_NAME,
    deltaId: 'DMVI',
    deltaLabel: 'ΔMVI',
    expr: MVI_EXPR,
  },
  {
    id: REMI_LAYER_ID,
    label: 'REMI',
    scientificName: REMI_SCIENTIFIC_NAME,
    deltaId: 'DREMI',
    deltaLabel: 'ΔREMI',
    expr: REMI_EXPR,
  },
  {
    id: MI_LAYER_ID,
    label: 'MI',
    scientificName: MI_SCIENTIFIC_NAME,
    deltaId: 'DMI',
    deltaLabel: 'ΔMI',
    expr: MI_EXPR,
  },
  {
    id: MFI_LAYER_ID,
    label: 'MFI',
    scientificName: MFI_SCIENTIFIC_NAME,
    deltaId: 'DMFI',
    deltaLabel: 'ΔMFI',
    expr: MFI_EXPR,
  },
  {
    id: NDRE_B5_LAYER_ID,
    label: 'NDRE-B5',
    scientificName: NDRE_B5_SCIENTIFIC_NAME,
    deltaId: 'DNDRE-B5',
    deltaLabel: 'ΔNDRE-B5',
    expr: NDRE_B5_EXPR,
  },
  {
    id: NDRE_B6_LAYER_ID,
    label: 'NDRE-B6',
    scientificName: NDRE_B6_SCIENTIFIC_NAME,
    deltaId: 'DNDRE-B6',
    deltaLabel: 'ΔNDRE-B6',
    expr: NDRE_B6_EXPR,
  },
  {
    id: NDRE_B7_LAYER_ID,
    label: 'NDRE-B7',
    scientificName: NDRE_B7_SCIENTIFIC_NAME,
    deltaId: 'DNDRE-B7',
    deltaLabel: 'ΔNDRE-B7',
    expr: NDRE_B7_EXPR,
  },
  {
    id: CI_RE_LAYER_ID,
    label: 'CI-RE',
    scientificName: CI_RE_SCIENTIFIC_NAME,
    deltaId: 'DCI-RE',
    deltaLabel: 'ΔCI-RE',
    expr: CI_RE_EXPR,
  },
  {
    id: GCI_CHL_LAYER_ID,
    label: 'GCI-CHL',
    scientificName: GCI_CHL_SCIENTIFIC_NAME,
    deltaId: 'DGCI-CHL',
    deltaLabel: 'ΔGCI-CHL',
    expr: GCI_CHL_EXPR,
  },
  {
    id: MTCI_LAYER_ID,
    label: 'MTCI',
    scientificName: MTCI_SCIENTIFIC_NAME,
    deltaId: 'DMTCI',
    deltaLabel: 'ΔMTCI',
    expr: MTCI_EXPR,
  },
  {
    id: REIP_LAYER_ID,
    label: 'REIP',
    scientificName: REIP_SCIENTIFIC_NAME,
    deltaId: 'DREIP',
    deltaLabel: 'ΔREIP',
    expr: REIP_EXPR,
  },
]

export function isMangroveLayerId(layerId: string | null | undefined): boolean {
  const u = String(layerId || '')
    .trim()
    .toUpperCase()
  return (MANGROVE_LAYER_IDS as readonly string[]).some(id => id.toUpperCase() === u)
}

/** Evalscript lines inside CORE_INDICES_BLOCK / coreAt (requires B03–B07 + B08 + B8A). */
export const MANGROVE_CORE_INDEX_LINES = `let mviDen = samples.B11 - samples.B03;
  let mvi = Math.abs(mviDen) > 1e-6 ? (samples.B08 - samples.B03) / mviDen : NaN;
  let remiADen = samples.B06 + samples.B05;
  let remiBDen = samples.B03 + samples.B11;
  let remi = remiADen > 1e-6 && remiBDen > 1e-6
    ? ((samples.B06 - samples.B05) / remiADen) * ((samples.B03 - samples.B11) / remiBDen)
    : NaN;
  let miDen = samples.B11 + samples.B04;
  let mi = miDen > 1e-6 ? (samples.B08 - samples.B04) / miDen : NaN;
  let reMean = (samples.B05 + samples.B06 + samples.B07) / 3.0;
  let mfiDen = reMean + samples.B8A;
  let mfi = mfiDen > 1e-6 ? (reMean - samples.B8A) / mfiDen : NaN;
  let ndre_b5 = index(samples.B8A, samples.B05);
  let ndre_b6 = index(samples.B8A, samples.B06);
  let ndre_b7 = index(samples.B8A, samples.B07);
  let cire = samples.B05 > 1e-6 ? samples.B8A / samples.B05 - 1.0 : NaN;
  let gci_chl = samples.B03 > 1e-6 ? samples.B08 / samples.B03 - 1.0 : NaN;
  let mtciDen = samples.B05 - samples.B04;
  let mtci = Math.abs(mtciDen) > 1e-6 ? (samples.B06 - samples.B05) / mtciDen : NaN;
  let reipDen = samples.B06 - samples.B05;
  let reip = Math.abs(reipDen) > 1e-6
    ? 705.0 + 35.0 * (((samples.B04 + samples.B07) * 0.5 - samples.B05) / reipDen)
    : NaN;`
