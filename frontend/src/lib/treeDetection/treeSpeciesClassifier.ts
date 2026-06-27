/**
 * Tree species classifier (modular) for the Tree Detections tool.
 *
 * This is the pluggable "Tree Species Classification Model" stage of Mode 2
 * (Detection + Species Classification). It takes per-crown features extracted
 * from the VHR RGB basemap and returns the most likely species with a
 * calibrated confidence. When confidence falls below the threshold the crown is
 * labelled `unknown` rather than forcing an incorrect class.
 *
 * Architecture
 * ------------
 * The species set is a data-driven registry (`TREE_SPECIES`) and the classifier
 * scores a crown's feature vector against per-species prototypes. A trained
 * model (e.g. an exported TF.js / ONNX crown classifier) can later replace
 * `scoreSpecies()` without touching the engine, panel, or detection workflow —
 * only the feature vector contract (`CrownFeatures`) must stay stable. The same
 * pattern lets future analysis stages (health, biomass, carbon) plug in as
 * additional, independent classifiers.
 */

export type TreeSpeciesId =
  | 'date-palm'
  | 'palm'
  | 'olive'
  | 'citrus'
  | 'mango'
  | 'apple'
  | 'pear'
  | 'avocado'
  | 'coconut'
  | 'banana'
  | 'pine'
  | 'cypress'
  | 'eucalyptus'
  | 'acacia'
  | 'oak'
  | 'poplar'
  | 'unknown'

export type TreeSpeciesMeta = {
  id: TreeSpeciesId
  label: string
  color: string
}

/** Display registry — expandable: add an entry + a prototype to support a new species. */
export const TREE_SPECIES: Record<TreeSpeciesId, TreeSpeciesMeta> = {
  'date-palm': { id: 'date-palm', label: 'Date Palm', color: '#b45309' },
  palm: { id: 'palm', label: 'Palm', color: '#d97706' },
  olive: { id: 'olive', label: 'Olive', color: '#84cc16' },
  citrus: { id: 'citrus', label: 'Citrus', color: '#f59e0b' },
  mango: { id: 'mango', label: 'Mango', color: '#16a34a' },
  apple: { id: 'apple', label: 'Apple', color: '#ef4444' },
  pear: { id: 'pear', label: 'Pear', color: '#a3e635' },
  avocado: { id: 'avocado', label: 'Avocado', color: '#15803d' },
  coconut: { id: 'coconut', label: 'Coconut', color: '#ca8a04' },
  banana: { id: 'banana', label: 'Banana', color: '#65a30d' },
  pine: { id: 'pine', label: 'Pine', color: '#065f46' },
  cypress: { id: 'cypress', label: 'Cypress', color: '#047857' },
  eucalyptus: { id: 'eucalyptus', label: 'Eucalyptus', color: '#0d9488' },
  acacia: { id: 'acacia', label: 'Acacia', color: '#a16207' },
  oak: { id: 'oak', label: 'Oak', color: '#4d7c0f' },
  poplar: { id: 'poplar', label: 'Poplar', color: '#22c55e' },
  unknown: { id: 'unknown', label: 'Other / Unknown', color: '#94a3b8' },
}

/** Order used for legends / statistics (Unknown last). */
export const TREE_SPECIES_ORDER: TreeSpeciesId[] = [
  'date-palm',
  'palm',
  'olive',
  'citrus',
  'mango',
  'apple',
  'pear',
  'avocado',
  'coconut',
  'banana',
  'pine',
  'cypress',
  'eucalyptus',
  'acacia',
  'oak',
  'poplar',
  'unknown',
]

/**
 * Per-crown features extracted from the RGB basemap. Kept deliberately small and
 * normalised so the contract is stable across classifier implementations.
 */
export type CrownFeatures = {
  /** Estimated crown diameter (m). */
  crownDiameterM: number
  /** Estimated crown area (m²). */
  crownAreaM2: number
  /** Green dominance in [0,1] (illumination-invariant vegetation strength). */
  greenDominance: number
  /** Mean luminance in [0,1]. */
  luminance: number
  /** Mean red / green ratio (>1 → warmer / silvery foliage). */
  redGreenRatio: number
  /** Mean blue / green ratio. */
  blueGreenRatio: number
  /** Std-dev of green dominance within the crown ([0,~0.3]) → canopy texture. */
  greenTexture: number
  /** Crown compactness in [0,1] (1 = perfectly round/filled, low = sparse/elongated). */
  compactness: number
  /**
   * Radial frond / star-pattern strength in [0,1]. Palms (date palm, palm,
   * coconut) show bright/dark spokes radiating from the crown centre; broadleaf
   * crowns are angularly smooth. This is the single most discriminative palm cue
   * in VHR RGB imagery.
   */
  radialFrond: number
}

export type SpeciesPrediction = {
  species: TreeSpeciesId
  confidence: number
}

export type SpeciesClassifyOptions = {
  /** Confidence below this → `unknown`. Default 0.42. */
  threshold?: number
}

/** Normalised feature axes used by the prototype scorer. */
type Proto = {
  id: Exclude<TreeSpeciesId, 'unknown'>
  size: number // crownDiameterM / 10, clamped
  green: number // greenDominance
  texture: number // greenTexture / 0.3
  compact: number // compactness
  warmth: number // redGreenRatio mapped to ~[0,1] around 1.0
  radial: number // radial frond / star-pattern strength
}

// Heuristic prototypes (priors). Tuned for typical orchard / arid-region crowns
// seen in VHR RGB imagery. These are intentionally coarse — a trained model can
// replace `scoreSpecies` for production-grade accuracy. The `radial` axis is the
// key palm-family discriminator (date palm / palm / coconut score high).
const PROTOTYPES: Proto[] = [
  { id: 'date-palm', size: 0.7, green: 0.3, texture: 0.78, compact: 0.66, warmth: 0.56, radial: 0.9 },
  { id: 'palm', size: 0.52, green: 0.35, texture: 0.74, compact: 0.64, warmth: 0.52, radial: 0.85 },
  { id: 'coconut', size: 0.74, green: 0.36, texture: 0.85, compact: 0.56, warmth: 0.5, radial: 0.82 },
  { id: 'olive', size: 0.36, green: 0.26, texture: 0.5, compact: 0.62, warmth: 0.62, radial: 0.3 },
  { id: 'acacia', size: 0.42, green: 0.3, texture: 0.68, compact: 0.48, warmth: 0.6, radial: 0.5 },
  { id: 'citrus', size: 0.4, green: 0.52, texture: 0.3, compact: 0.85, warmth: 0.46, radial: 0.18 },
  { id: 'mango', size: 0.56, green: 0.5, texture: 0.45, compact: 0.8, warmth: 0.47, radial: 0.22 },
  { id: 'apple', size: 0.4, green: 0.46, texture: 0.45, compact: 0.76, warmth: 0.5, radial: 0.24 },
  { id: 'pear', size: 0.42, green: 0.43, texture: 0.45, compact: 0.7, warmth: 0.5, radial: 0.26 },
  { id: 'avocado', size: 0.5, green: 0.52, texture: 0.45, compact: 0.78, warmth: 0.46, radial: 0.24 },
  { id: 'banana', size: 0.4, green: 0.56, texture: 0.32, compact: 0.5, warmth: 0.45, radial: 0.4 },
  { id: 'pine', size: 0.5, green: 0.4, texture: 0.55, compact: 0.66, warmth: 0.48, radial: 0.42 },
  { id: 'cypress', size: 0.3, green: 0.38, texture: 0.35, compact: 0.86, warmth: 0.48, radial: 0.22 },
  { id: 'eucalyptus', size: 0.6, green: 0.4, texture: 0.7, compact: 0.55, warmth: 0.5, radial: 0.45 },
  { id: 'oak', size: 0.7, green: 0.45, texture: 0.65, compact: 0.7, warmth: 0.49, radial: 0.32 },
  { id: 'poplar', size: 0.42, green: 0.45, texture: 0.35, compact: 0.6, warmth: 0.48, radial: 0.28 },
]

// Per-axis weights → which features matter most for separating species. The
// radial frond axis dominates because it is what visually defines a palm.
const AXIS_WEIGHTS = { size: 1.2, green: 1.4, texture: 1.1, compact: 0.9, warmth: 0.8, radial: 2.4 }

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function toAxes(f: CrownFeatures) {
  return {
    size: clamp01(f.crownDiameterM / 10),
    green: clamp01(f.greenDominance),
    texture: clamp01(f.greenTexture / 0.3),
    compact: clamp01(f.compactness),
    // map red/green ~[0.6..1.4] → [0..1] around 1.0
    warmth: clamp01((f.redGreenRatio - 0.6) / 0.8),
    radial: clamp01(f.radialFrond),
  }
}

/**
 * Score a crown against all species prototypes and return a probability-like
 * distribution (softmax of negative weighted distance). Replace this function
 * to swap in a trained model.
 */
function scoreSpecies(f: CrownFeatures): Array<{ id: Proto['id']; p: number }> {
  const a = toAxes(f)
  const raw = PROTOTYPES.map(proto => {
    const d =
      AXIS_WEIGHTS.size * (a.size - proto.size) ** 2 +
      AXIS_WEIGHTS.green * (a.green - proto.green) ** 2 +
      AXIS_WEIGHTS.texture * (a.texture - proto.texture) ** 2 +
      AXIS_WEIGHTS.compact * (a.compact - proto.compact) ** 2 +
      AXIS_WEIGHTS.warmth * (a.warmth - proto.warmth) ** 2 +
      AXIS_WEIGHTS.radial * (a.radial - proto.radial) ** 2
    // sharper temperature → more decisive separation
    return { id: proto.id, s: Math.exp(-d * 7) }
  })
  const sum = raw.reduce((acc, r) => acc + r.s, 0) || 1
  return raw.map(r => ({ id: r.id, p: r.s / sum }))
}

/**
 * Strong, decisive palm-family detector. A palm crown in VHR RGB is unmistakable:
 * radiating fronds (high `radialFrond`) on a crown of palm-typical size. When
 * that signature is present we commit to the palm family directly (Date Palm for
 * larger crowns, Palm for smaller ornamentals) with high confidence, bypassing
 * the softmax ambiguity that otherwise leaks palms into Olive/Acacia/Unknown.
 */
function detectPalmFamily(f: CrownFeatures): SpeciesPrediction | null {
  // `radialFrond` is now an angular-harmonic spokiness score: even a moderate
  // value is strong palm evidence because broadleaf crowns score near 0.
  if (f.radialFrond < 0.34) return null
  if (f.greenDominance < 0.04) return null // not vegetation
  if (f.crownDiameterM < 1.8) return null
  // Confidence grows with how palm-like the frond pattern is.
  const conf = clamp01(0.6 + (f.radialFrond - 0.34) * 1.1)
  // Date palms dominate arid orchards and have the larger, fuller stars; smaller
  // ornamental crowns fall back to generic Palm.
  const isDatePalm = f.crownDiameterM >= 3.6
  return {
    species: isDatePalm ? 'date-palm' : 'palm',
    confidence: Number(Math.min(0.98, conf).toFixed(3)),
  }
}

/**
 * Classify a single crown. Returns `unknown` when the top probability is below
 * `threshold` so low-confidence crowns are never force-labelled.
 */
export function classifyCrownSpecies(
  f: CrownFeatures,
  opts: SpeciesClassifyOptions = {},
): SpeciesPrediction {
  const threshold = opts.threshold ?? 0.42
  // A crown with negligible vegetation evidence cannot be a species.
  if (f.greenDominance < 0.04) return { species: 'unknown', confidence: 0 }

  // Palm family takes priority — it is the dominant, critical regional class.
  const palm = detectPalmFamily(f)
  if (palm) return palm

  const dist = scoreSpecies(f)
  let best = dist[0]!
  for (const d of dist) if (d.p > best.p) best = d

  if (best.p < threshold) {
    return { species: 'unknown', confidence: Number(best.p.toFixed(3)) }
  }
  return { species: best.id, confidence: Number(best.p.toFixed(3)) }
}
