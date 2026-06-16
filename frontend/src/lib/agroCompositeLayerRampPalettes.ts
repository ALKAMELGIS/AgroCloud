/**
 * Unique per-layer anchor palettes for AgroCloud composite indices.
 * Each layer owns a distinct color trajectory — no shared ramps between layers.
 * (NDVI, NDMI, NDWI, SAVI, CHAS, ΔCHAS are defined elsewhere and unchanged.)
 */

export type AgroLayerRampAnchor = { t: number; hex: number; label: string }

export type AgroLayerRampPalette = {
  valueMin: number
  valueMax: number
  anchors: AgroLayerRampAnchor[]
  classLabels: readonly string[]
  /** Legend subtitle — scientific reading of the ramp direction. */
  subtitle: string
}

function h(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function anchors(...pairs: [number, string, string][]): AgroLayerRampAnchor[] {
  return pairs.map(([t, hex, label]) => ({ t, hex: h(hex), label }))
}

function deltaLabels(shortName: string): readonly string[] {
  return [
    `Strong ${shortName} decline`,
    `Major ${shortName} decline`,
    `Moderate ${shortName} decline`,
    `Slight ${shortName} decline`,
    `Stable · low`,
    `Stable · neutral`,
    `Slight ${shortName} gain`,
    `Moderate ${shortName} gain`,
    `Major ${shortName} gain`,
    `Strong ${shortName} gain`,
  ]
}

/** Unique delta palettes — decline (left) → stable center → gain (right). */
function deltaPalette(
  shortName: string,
  decline: string,
  stable: string,
  gain: string,
  subtitle: string,
): AgroLayerRampPalette {
  return {
    valueMin: -0.4,
    valueMax: 0.4,
    anchors: anchors(
      [0, decline, 'Strong decline'],
      [0.35, decline, 'Decline'],
      [0.5, stable, 'Stable'],
      [0.65, gain, 'Improvement'],
      [1, gain, 'Strong gain'],
    ),
    classLabels: deltaLabels(shortName),
    subtitle,
  }
}

/**
 * Static composite palettes — low value → high value semantics per index physics.
 */
export const AGRO_UNIQUE_LAYER_RAMP_PALETTES: Record<string, AgroLayerRampPalette> = {
  // 🌱 Vegetation Health Layer
  VHS: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#7f0000', 'Critical'],
      [0.33, '#d4a017', 'Weak'],
      [0.66, '#7cb342', 'Good'],
      [1, '#1b5e20', 'Excellent'],
    ),
    classLabels: [
      'Critical health',
      'Very poor',
      'Poor',
      'Below average',
      'Fair',
      'Moderate',
      'Good',
      'Very good',
      'Excellent',
      'Peak vigor',
    ],
    subtitle: 'Vegetation Health · crimson = poor · forest green = excellent',
  },
  VDI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#2e7d32', 'Moist canopy'],
      [0.33, '#aed581', 'Hydrated'],
      [0.66, '#bcaaa4', 'Drying'],
      [1, '#4e342e', 'Very dry'],
    ),
    classLabels: [
      'Fully hydrated',
      'Well hydrated',
      'Moist',
      'Slightly dry',
      'Moderate dryness',
      'Dry canopy',
      'Very dry',
      'Severe dryness',
      'Critical dryness',
      'Desiccated',
    ],
    subtitle: 'Vegetation dryness · green = moist · brown = dry canopy',
  },
  CVI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#4a148c', 'Bare / weak'],
      [0.33, '#7e57c2', 'Sparse'],
      [0.66, '#43a047', 'Moderate'],
      [1, '#1b4332', 'Dense composite'],
    ),
    classLabels: [
      'No cover',
      'Very sparse',
      'Sparse',
      'Light cover',
      'Moderate',
      'Fair composite',
      'Good composite',
      'Strong composite',
      'Very strong',
      'Full composite vigor',
    ],
    subtitle: 'Composite vegetation · purple = bare · deep green = dense mix',
  },
  CSI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#1b5e20', 'Low stress'],
      [0.33, '#fdd835', 'Watch'],
      [0.66, '#ef6c00', 'Stressed'],
      [1, '#b71c1c', 'Critical stress'],
    ),
    classLabels: [
      'Minimal stress',
      'Low stress',
      'Mild stress',
      'Moderate stress',
      'Elevated',
      'High stress',
      'Very high',
      'Severe',
      'Critical',
      'Collapse risk',
    ],
    subtitle: 'Crop stress · green = healthy · red = severe stress',
  },
  WST: {
    valueMin: -1,
    valueMax: 1,
    anchors: anchors(
      [0, '#0d47a1', 'Well watered'],
      [0.33, '#4fc3f7', 'Adequate'],
      [0.66, '#ffb74d', 'Water limited'],
      [1, '#e65100', 'Severe water stress'],
    ),
    classLabels: [
      'No water stress',
      'Very low stress',
      'Low stress',
      'Mild stress',
      'Moderate',
      'Elevated stress',
      'High stress',
      'Very high',
      'Severe',
      'Extreme water stress',
    ],
    subtitle: 'Water stress · blue = adequate moisture · orange = stressed',
  },

  // 💧 Water & Moisture Layer
  DRI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#0277bd', 'Low drought risk'],
      [0.33, '#81d4fa', 'Mild risk'],
      [0.66, '#ffcc80', 'Moderate drought'],
      [1, '#bf360c', 'Extreme drought'],
    ),
    classLabels: [
      'Minimal drought',
      'Low risk',
      'Mild risk',
      'Moderate risk',
      'Elevated',
      'High drought',
      'Very high',
      'Severe',
      'Extreme',
      'Catastrophic drought',
    ],
    subtitle: 'Drought risk · sky blue = wet · rust = extreme drought',
  },
  VMI: {
    valueMin: -0.5,
    valueMax: 0.5,
    anchors: anchors(
      [0, '#004d40', 'Very dry canopy'],
      [0.33, '#00897b', 'Dry'],
      [0.66, '#4db6ac', 'Moist'],
      [1, '#b2dfdb', 'Saturated canopy'],
    ),
    classLabels: [
      'Extremely dry',
      'Very dry',
      'Dry',
      'Slightly dry',
      'Neutral',
      'Slightly moist',
      'Moist',
      'Wet canopy',
      'Very wet',
      'Saturated',
    ],
    subtitle: 'Canopy moisture · deep teal = dry · pale aqua = wet foliage',
  },
  SMI: {
    valueMin: -0.5,
    valueMax: 0.5,
    anchors: anchors(
      [0, '#5d4037', 'Dry soil'],
      [0.33, '#a1887f', 'Low moisture'],
      [0.66, '#26c6da', 'Moist soil'],
      [1, '#006064', 'Saturated soil'],
    ),
    classLabels: [
      'Bone dry soil',
      'Very dry',
      'Dry',
      'Slightly dry',
      'Neutral',
      'Slightly moist',
      'Moist soil',
      'Wet soil',
      'Very wet',
      'Waterlogged soil',
    ],
    subtitle: 'Soil moisture · clay brown = dry · cyan = wet soil profile',
  },
  OIR: {
    valueMin: -1,
    valueMax: 1,
    anchors: anchors(
      [0, '#33691e', 'Balanced'],
      [0.33, '#fff176', 'Watch'],
      [0.66, '#29b6f6', 'Over-wet'],
      [1, '#0d47a1', 'Flood / excess irrigation'],
    ),
    classLabels: [
      'Optimal balance',
      'Normal',
      'Slight excess watch',
      'Moderate excess',
      'Elevated water',
      'High excess',
      'Over-irrigation',
      'Severe excess',
      'Very severe',
      'Critical over-irrigation',
    ],
    subtitle: 'Over-irrigation · green = balanced · navy = excess water',
  },

  // 🚜 Irrigation & Field Management
  IEI: {
    valueMin: -1,
    valueMax: 2,
    anchors: anchors(
      [0, '#c62828', 'Inefficient'],
      [0.33, '#ffa726', 'Sub-optimal'],
      [0.66, '#66bb6a', 'Efficient'],
      [1, '#1565c0', 'Highly efficient'],
    ),
    classLabels: [
      'Critical inefficiency',
      'Poor efficiency',
      'Below target',
      'Fair',
      'Moderate',
      'Good efficiency',
      'Very good',
      'Excellent',
      'Optimal',
      'Peak efficiency',
    ],
    subtitle: 'Irrigation efficiency · red = waste · blue = optimal delivery',
  },
  UII: {
    valueMin: -1,
    valueMax: 1,
    anchors: anchors(
      [0, '#1b5e20', 'Well irrigated'],
      [0.33, '#689f38', 'Adequate'],
      [0.66, '#fdd835', 'Under-irrigated'],
      [1, '#f57f17', 'Severe deficit'],
    ),
    classLabels: [
      'No deficit',
      'Minimal deficit',
      'Low deficit',
      'Mild deficit',
      'Moderate',
      'Elevated deficit',
      'High deficit',
      'Very high',
      'Severe under-irrigation',
      'Critical deficit',
    ],
    subtitle: 'Under-irrigation · dark green = sufficient · amber = deficit',
  },
  FPR: {
    valueMin: 0,
    valueMax: 2,
    anchors: anchors(
      [0, '#2e7d32', 'High performance'],
      [0.33, '#ffeb3b', 'Average'],
      [0.66, '#ff7043', 'Below target'],
      [1, '#d84315', 'Poor performance'],
    ),
    classLabels: [
      'Peak performance',
      'Excellent',
      'Good',
      'Fair',
      'Moderate',
      'Below average',
      'Poor',
      'Very poor',
      'Critical',
      'Field failure',
    ],
    subtitle: 'Field performance · green = high yield potential · red = poor',
  },
  CPI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#fff8e1', 'Low production'],
      [0.33, '#c5e1a5', 'Moderate'],
      [0.66, '#558b2f', 'Good'],
      [1, '#1b5e20', 'High production'],
    ),
    classLabels: [
      'Minimal production',
      'Very low',
      'Low',
      'Below average',
      'Moderate',
      'Fair production',
      'Good',
      'Very good',
      'High',
      'Peak production',
    ],
    subtitle: 'Crop production · straw = weak · deep green = high output',
  },

  // 🌾 Growth & Stability
  GPI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#e65100', 'Stagnant'],
      [0.33, '#ffb300', 'Slow growth'],
      [0.66, '#7cb342', 'Active growth'],
      [1, '#33691e', 'Peak growth'],
    ),
    classLabels: [
      'No growth',
      'Very slow',
      'Slow',
      'Below average',
      'Moderate growth',
      'Fair growth',
      'Good growth',
      'Strong growth',
      'Very strong',
      'Peak growth rate',
    ],
    subtitle: 'Growth performance · orange = lag · lime green = active growth',
  },
  CSI2: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#37474f', 'Unstable canopy'],
      [0.33, '#78909c', 'Variable'],
      [0.66, '#aed581', 'Stable'],
      [1, '#33691e', 'Highly stable'],
    ),
    classLabels: [
      'Highly unstable',
      'Unstable',
      'Variable',
      'Moderately variable',
      'Fair stability',
      'Stable',
      'Good stability',
      'Very stable',
      'Excellent stability',
      'Locked stable canopy',
    ],
    subtitle: 'Canopy stability · slate gray = unstable · green = stable cover',
  },
  CRI: {
    valueMin: 0,
    valueMax: 1.5,
    anchors: anchors(
      [0, '#311b92', 'Low resilience'],
      [0.33, '#5c6bc0', 'Fragile'],
      [0.66, '#81c784', 'Resilient'],
      [1, '#2e7d32', 'Highly resilient'],
    ),
    classLabels: [
      'Critical fragility',
      'Very low resilience',
      'Low',
      'Below average',
      'Moderate',
      'Fair resilience',
      'Good',
      'Strong',
      'Very resilient',
      'Maximum resilience',
    ],
    subtitle: 'Crop resilience · indigo = fragile · green = stress-tolerant',
  },
  VDG: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#1b5e20', 'Stable / no decline'],
      [0.33, '#ffca28', 'Early decline'],
      [0.66, '#ff5722', 'Active decline'],
      [1, '#3e2723', 'Severe decline gradient'],
    ),
    classLabels: [
      'No decline',
      'Minimal decline',
      'Slight decline',
      'Moderate decline',
      'Elevated decline',
      'High decline',
      'Very high',
      'Severe',
      'Critical decline',
      'Collapse gradient',
    ],
    subtitle: 'Vegetation decline · green = stable · charcoal = steep loss',
  },

  // ⚠️ Risk & Composite
  ARI: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#00c853', 'Low agro risk'],
      [0.33, '#ffeb3b', 'Watch'],
      [0.66, '#ff5722', 'High risk'],
      [1, '#d50000', 'Critical agro risk'],
    ),
    classLabels: [
      'Minimal risk',
      'Low risk',
      'Mild risk',
      'Moderate',
      'Elevated',
      'High risk',
      'Very high',
      'Severe',
      'Critical',
      'Extreme agro risk',
    ],
    subtitle: 'Agro risk · bright green = safe · red = critical composite risk',
  },
  CHS: {
    valueMin: 0,
    valueMax: 1,
    anchors: anchors(
      [0, '#880e4f', 'Poor composite health'],
      [0.33, '#f06292', 'Fair'],
      [0.66, '#81c784', 'Good'],
      [1, '#004d40', 'Excellent composite health'],
    ),
    classLabels: [
      'Critical composite',
      'Very poor',
      'Poor',
      'Below average',
      'Moderate',
      'Fair composite',
      'Good',
      'Very good',
      'Excellent',
      'Peak composite health',
    ],
    subtitle: 'Composite Health Score · magenta = poor · teal = excellent balance',
  },
  CPS: {
    valueMin: 0,
    valueMax: 2,
    anchors: anchors(
      [0, '#e8f5e9', 'Low pressure'],
      [0.33, '#fff59d', 'Moderate pressure'],
      [0.66, '#ff7043', 'High pressure'],
      [1, '#4a148c', 'Extreme crop pressure'],
    ),
    classLabels: [
      'Minimal pressure',
      'Low',
      'Mild',
      'Moderate',
      'Elevated',
      'High pressure',
      'Very high',
      'Severe',
      'Critical pressure',
      'Extreme pressure',
    ],
    subtitle: 'Crop pressure · mint = low stress load · violet = extreme pressure',
  },

  // Δ layers — each with a unique stable-center hue
  DVHS: deltaPalette('VHS', '#8b0000', '#fffde7', '#1b4332', 'ΔVHS · unique crimson→cream→forest change ramp'),
  DVDI: deltaPalette('VDI', '#4e342e', '#eceff1', '#2e7d32', 'ΔVDI · brown dry decline · gray stable · green rehydration'),
  DCVI: deltaPalette('CVI', '#4a148c', '#e1bee7', '#1b4332', 'ΔCVI · purple loss · lilac stable · green gain'),
  DCSI: deltaPalette('CSI', '#b71c1c', '#fff9c4', '#1b5e20', 'ΔCSI · stress easing vs intensification'),
  DWST: deltaPalette('WST', '#e65100', '#cfd8dc', '#0d47a1', 'ΔWST · orange stress rise · blue relief'),
  DDRI: deltaPalette('DRI', '#bf360c', '#ffe0b2', '#0277bd', 'ΔDRI · drought worsening · wetting recovery'),
  DVMI: deltaPalette('VMI', '#004d40', '#b2dfdb', '#80cbc4', 'ΔVMI · canopy moisture loss · teal recovery'),
  DSMI: deltaPalette('SMI', '#5d4037', '#d7ccc8', '#006064', 'ΔSMI · soil drying · cyan rewetting'),
  DOIR: deltaPalette('OIR', '#0d47a1', '#fff59d', '#33691e', 'ΔOIR · excess water rise · green normalization'),
  DIEI: deltaPalette('IEI', '#c62828', '#e3f2fd', '#1565c0', 'ΔIEI · efficiency drop · blue improvement'),
  DUII: deltaPalette('UII', '#f57f17', '#f0f4c3', '#1b5e20', 'ΔUII · deficit increase · irrigation recovery'),
  DFPR: deltaPalette('FPR', '#d84315', '#fff9c4', '#2e7d32', 'ΔFPR · performance drop · yield recovery'),
  DCPI: deltaPalette('CPI', '#fff8e1', '#c5e1a5', '#1b5e20', 'ΔCPI · production decline · output gain'),
  DGPI: deltaPalette('GPI', '#e65100', '#fff3e0', '#33691e', 'ΔGPI · growth slowdown · acceleration'),
  DCSI2: deltaPalette('CSI2', '#37474f', '#cfd8dc', '#33691e', 'ΔCSI2 · canopy destabilization · restabilization'),
  DCRI: deltaPalette('CRI', '#311b92', '#c5cae9', '#2e7d32', 'ΔCRI · resilience loss · recovery'),
  DVDG: deltaPalette('VDG', '#3e2723', '#ffecb3', '#1b5e20', 'ΔVDG · decline acceleration · vegetation recovery'),
  DARI: deltaPalette('ARI', '#d50000', '#fffde7', '#00c853', 'ΔARI · rising composite risk · risk reduction'),
  DCHS: deltaPalette('CHS', '#880e4f', '#f8bbd0', '#004d40', 'ΔCHS · composite health drop · recovery'),
  DCPS: deltaPalette('CPS', '#4a148c', '#e1bee7', '#e8f5e9', 'ΔCPS · pressure increase · relief'),
}
