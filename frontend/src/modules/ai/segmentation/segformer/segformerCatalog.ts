/**
 * SegFormer GIS Detection catalogue.
 *
 * Categories + stable AgroCloud class IDs from the detection toolbox spec,
 * with ADE20K label-index mappings for pretrained
 * `nvidia/segformer-b0-finetuned-ade-512-512`.
 *
 * Every class has at least one ADE20K proxy so Detect can run on the pretrained
 * checkpoint (specialty classes use the closest ADE20K labels).
 */

export type SegFormerCategoryId =
  | 'agriculture'
  | 'trees'
  | 'buildings'
  | 'roads'
  | 'vehicles'
  | 'water'
  | 'land-surface'
  | 'farm-infrastructure'
  | 'mining'
  | 'energy'
  | 'environmental-disaster'

export type SegFormerCategoryDef = {
  id: SegFormerCategoryId
  label: string
}

export type SegFormerClassDef = {
  /** Stable numeric AgroCloud class ID (from the detection toolbox spec). */
  id: number
  name: string
  categoryId: SegFormerCategoryId
  /**
   * ADE20K semantic-label indices for the pretrained SegFormer checkpoint.
   * Always non-empty — specialty classes use closest ADE20K proxies.
   */
  ade20kIndices: number[]
}

/** Kept for UI/tooltips when a class somehow has no indices. */
export const SEGFORMER_UNSUPPORTED_TOOLTIP = 'Requires fine-tuned SegFormer weights'

/**
 * ADE20K 150-class id → name for `nvidia/segformer-b0-finetuned-ade-512-512`
 * (HuggingFace `id2label`). Kept for documentation and cross-checks.
 */
export const ADE20K_ID2LABEL: Readonly<Record<number, string>> = {
  0: 'wall',
  1: 'building',
  2: 'sky',
  3: 'floor',
  4: 'tree',
  5: 'ceiling',
  6: 'road',
  7: 'bed',
  8: 'windowpane',
  9: 'grass',
  10: 'cabinet',
  11: 'sidewalk',
  12: 'person',
  13: 'earth',
  14: 'door',
  15: 'table',
  16: 'mountain',
  17: 'plant',
  18: 'curtain',
  19: 'chair',
  20: 'car',
  21: 'water',
  22: 'painting',
  23: 'sofa',
  24: 'shelf',
  25: 'house',
  26: 'sea',
  27: 'mirror',
  28: 'rug',
  29: 'field',
  30: 'armchair',
  31: 'seat',
  32: 'fence',
  33: 'desk',
  34: 'rock',
  35: 'wardrobe',
  36: 'lamp',
  37: 'bathtub',
  38: 'railing',
  39: 'cushion',
  40: 'base',
  41: 'box',
  42: 'column',
  43: 'signboard',
  44: 'chest of drawers',
  45: 'counter',
  46: 'sand',
  47: 'sink',
  48: 'skyscraper',
  49: 'fireplace',
  50: 'refrigerator',
  51: 'grandstand',
  52: 'path',
  53: 'stairs',
  54: 'runway',
  55: 'case',
  56: 'pool table',
  57: 'pillow',
  58: 'screen door',
  59: 'stairway',
  60: 'river',
  61: 'bridge',
  62: 'bookcase',
  63: 'blind',
  64: 'coffee table',
  65: 'toilet',
  66: 'flower',
  67: 'book',
  68: 'hill',
  69: 'bench',
  70: 'countertop',
  71: 'stove',
  72: 'palm',
  73: 'kitchen island',
  74: 'computer',
  75: 'swivel chair',
  76: 'boat',
  77: 'bar',
  78: 'arcade machine',
  79: 'hovel',
  80: 'bus',
  81: 'towel',
  82: 'light',
  83: 'truck',
  84: 'tower',
  85: 'chandelier',
  86: 'awning',
  87: 'streetlight',
  88: 'booth',
  89: 'television receiver',
  90: 'airplane',
  91: 'dirt track',
  92: 'apparel',
  93: 'pole',
  94: 'land',
  95: 'bannister',
  96: 'escalator',
  97: 'ottoman',
  98: 'bottle',
  99: 'buffet',
  100: 'poster',
  101: 'stage',
  102: 'van',
  103: 'ship',
  104: 'fountain',
  105: 'conveyer belt',
  106: 'canopy',
  107: 'washer',
  108: 'plaything',
  109: 'swimming pool',
  110: 'stool',
  111: 'barrel',
  112: 'basket',
  113: 'waterfall',
  114: 'tent',
  115: 'bag',
  116: 'minibike',
  117: 'cradle',
  118: 'oven',
  119: 'ball',
  120: 'food',
  121: 'step',
  122: 'tank',
  123: 'trade name',
  124: 'microwave',
  125: 'pot',
  126: 'animal',
  127: 'bicycle',
  128: 'lake',
  129: 'dishwasher',
  130: 'screen',
  131: 'blanket',
  132: 'sculpture',
  133: 'hood',
  134: 'sconce',
  135: 'vase',
  136: 'traffic light',
  137: 'tray',
  138: 'ashcan',
  139: 'fan',
  140: 'pier',
  141: 'crt screen',
  142: 'plate',
  143: 'monitor',
  144: 'bulletin board',
  145: 'shower',
  146: 'radiator',
  147: 'glass',
  148: 'clock',
  149: 'flag',
}

export const SEGFORMER_CATEGORIES: readonly SegFormerCategoryDef[] = [
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'trees', label: 'Trees' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'roads', label: 'Roads' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'water', label: 'Water' },
  { id: 'land-surface', label: 'Land Surface' },
  { id: 'farm-infrastructure', label: 'Farm Infrastructure' },
  { id: 'mining', label: 'Mining' },
  { id: 'energy', label: 'Energy' },
  { id: 'environmental-disaster', label: 'Environmental & Disaster' },
] as const

/**
 * Default Detect confidence for spaceborne AOI crops.
 * ADE20K SegFormer is trained on ground scenes, so ag/veg proxies need a lower bar.
 */
export const SEGFORMER_DEFAULT_MIN_CONFIDENCE = 0.45
export const SEGFORMER_AG_MIN_CONFIDENCE = 0.3

/** Categories that use spectral fallback when the ADE20K model returns no polygons. */
export const SEGFORMER_SPECTRAL_FALLBACK_CATEGORIES: readonly SegFormerCategoryId[] = [
  'agriculture',
  'trees',
] as const

/** All detection classes in stable ID order. */
export const SEGFORMER_CLASSES: readonly SegFormerClassDef[] = [
  // —— Agriculture (1–15) ——
  // Field pipeline (class 1): ADE20K field(29) only — instance split + SAM2 refine.
  // Other core ag classes keep broader earth/grass/plant proxies for Detect.
  { id: 1, name: 'Agricultural Field', categoryId: 'agriculture', ade20kIndices: [29] },
  { id: 2, name: 'Cultivated Land', categoryId: 'agriculture', ade20kIndices: [29, 9, 17, 13] },
  { id: 3, name: 'Fallow Field', categoryId: 'agriculture', ade20kIndices: [13, 94, 9] },
  { id: 4, name: 'Abandoned Field', categoryId: 'agriculture', ade20kIndices: [13, 94, 9] },
  { id: 5, name: 'Newly Cultivated Area', categoryId: 'agriculture', ade20kIndices: [29, 13, 9] },
  { id: 6, name: 'Irrigated Field', categoryId: 'agriculture', ade20kIndices: [29, 9, 17, 21] },
  { id: 7, name: 'Rainfed Field', categoryId: 'agriculture', ade20kIndices: [29, 9, 17, 13] },
  { id: 8, name: 'Farm Boundary', categoryId: 'agriculture', ade20kIndices: [32, 6] },
  { id: 9, name: 'Greenhouse', categoryId: 'agriculture', ade20kIndices: [1] },
  { id: 10, name: 'Nursery', categoryId: 'agriculture', ade20kIndices: [17, 4] },
  { id: 11, name: 'Orchard', categoryId: 'agriculture', ade20kIndices: [4, 17] },
  { id: 12, name: 'Plantation', categoryId: 'agriculture', ade20kIndices: [4, 17] },
  { id: 13, name: 'Pasture', categoryId: 'agriculture', ade20kIndices: [9, 17, 29] },
  { id: 14, name: 'Grassland', categoryId: 'agriculture', ade20kIndices: [9, 17, 29] },
  { id: 15, name: 'Crop Residue Area', categoryId: 'agriculture', ade20kIndices: [13, 9, 29] },

  // —— Trees (20–34) ——
  { id: 20, name: 'Tree Canopy', categoryId: 'trees', ade20kIndices: [4] },
  { id: 21, name: 'Individual Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 22, name: 'Tree Row', categoryId: 'trees', ade20kIndices: [4] },
  { id: 23, name: 'Forest Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 24, name: 'Date Palm', categoryId: 'trees', ade20kIndices: [72] },
  { id: 25, name: 'Olive Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 26, name: 'Fruit Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 27, name: 'Plantation Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 28, name: 'Shrub', categoryId: 'trees', ade20kIndices: [17] },
  { id: 29, name: 'Bush Area', categoryId: 'trees', ade20kIndices: [17] },
  { id: 30, name: 'Grass Vegetation', categoryId: 'trees', ade20kIndices: [9] },
  { id: 31, name: 'Dense Vegetation', categoryId: 'trees', ade20kIndices: [4, 17] },
  { id: 32, name: 'Sparse Vegetation', categoryId: 'trees', ade20kIndices: [9, 17] },
  { id: 33, name: 'Dead Tree', categoryId: 'trees', ade20kIndices: [4] },
  { id: 34, name: 'Tree Stress Area', categoryId: 'trees', ade20kIndices: [4, 17] },

  // —— Buildings (40–48) ——
  { id: 40, name: 'Building', categoryId: 'buildings', ade20kIndices: [1] },
  { id: 41, name: 'Residential Building', categoryId: 'buildings', ade20kIndices: [1, 25] },
  { id: 42, name: 'Industrial Building', categoryId: 'buildings', ade20kIndices: [1] },
  { id: 43, name: 'Warehouse', categoryId: 'buildings', ade20kIndices: [1] },
  { id: 44, name: 'Farm Building', categoryId: 'buildings', ade20kIndices: [1] },
  { id: 45, name: 'Greenhouse Structure', categoryId: 'buildings', ade20kIndices: [1] },
  { id: 46, name: 'Construction Area', categoryId: 'buildings', ade20kIndices: [13, 1] },
  { id: 47, name: 'Urban Area', categoryId: 'buildings', ade20kIndices: [1, 25, 48] },
  { id: 48, name: 'Settlement', categoryId: 'buildings', ade20kIndices: [1, 25, 79] },

  // —— Roads (50–57) ——
  { id: 50, name: 'Road', categoryId: 'roads', ade20kIndices: [6] },
  { id: 51, name: 'Highway', categoryId: 'roads', ade20kIndices: [6] },
  { id: 52, name: 'Street', categoryId: 'roads', ade20kIndices: [6, 11] },
  { id: 53, name: 'Railway', categoryId: 'roads', ade20kIndices: [6, 52] },
  { id: 54, name: 'Bridge', categoryId: 'roads', ade20kIndices: [61] },
  { id: 55, name: 'Airport', categoryId: 'roads', ade20kIndices: [54] },
  { id: 56, name: 'Runway', categoryId: 'roads', ade20kIndices: [54] },
  { id: 57, name: 'Parking Area', categoryId: 'roads', ade20kIndices: [6, 11] },

  // —— Vehicles (60–68) ——
  { id: 60, name: 'Car', categoryId: 'vehicles', ade20kIndices: [20] },
  { id: 61, name: 'Truck', categoryId: 'vehicles', ade20kIndices: [83] },
  { id: 62, name: 'Bus', categoryId: 'vehicles', ade20kIndices: [80] },
  { id: 63, name: 'Tractor', categoryId: 'vehicles', ade20kIndices: [83] },
  { id: 64, name: 'Motorcycle', categoryId: 'vehicles', ade20kIndices: [116] },
  { id: 65, name: 'Aircraft', categoryId: 'vehicles', ade20kIndices: [90] },
  { id: 66, name: 'Ship', categoryId: 'vehicles', ade20kIndices: [76, 103] },
  { id: 67, name: 'Container', categoryId: 'vehicles', ade20kIndices: [41] },
  { id: 68, name: 'Equipment', categoryId: 'vehicles', ade20kIndices: [83, 41] },

  // —— Water (70–79) ——
  { id: 70, name: 'River', categoryId: 'water', ade20kIndices: [60, 21] },
  { id: 71, name: 'Lake', categoryId: 'water', ade20kIndices: [128, 21] },
  { id: 72, name: 'Reservoir', categoryId: 'water', ade20kIndices: [21, 128] },
  { id: 73, name: 'Dam', categoryId: 'water', ade20kIndices: [21, 61] },
  { id: 74, name: 'Canal', categoryId: 'water', ade20kIndices: [21] },
  { id: 75, name: 'Irrigation Channel', categoryId: 'water', ade20kIndices: [21] },
  { id: 76, name: 'Water Pond', categoryId: 'water', ade20kIndices: [21] },
  { id: 77, name: 'Flood Water', categoryId: 'water', ade20kIndices: [21] },
  { id: 78, name: 'Wetland', categoryId: 'water', ade20kIndices: [21] },
  { id: 79, name: 'Coastal Water', categoryId: 'water', ade20kIndices: [26, 21] },

  // —— Land Surface (80–88) ——
  { id: 80, name: 'Bare Soil', categoryId: 'land-surface', ade20kIndices: [13] },
  { id: 81, name: 'Sand', categoryId: 'land-surface', ade20kIndices: [46] },
  { id: 82, name: 'Desert', categoryId: 'land-surface', ade20kIndices: [46, 13] },
  { id: 83, name: 'Rock', categoryId: 'land-surface', ade20kIndices: [34] },
  { id: 84, name: 'Mountain', categoryId: 'land-surface', ade20kIndices: [16, 68] },
  { id: 85, name: 'Gravel Area', categoryId: 'land-surface', ade20kIndices: [13] },
  { id: 86, name: 'Salt Flat', categoryId: 'land-surface', ade20kIndices: [46, 13] },
  { id: 87, name: 'Dry Land', categoryId: 'land-surface', ade20kIndices: [94, 13] },
  { id: 88, name: 'Erosion Area', categoryId: 'land-surface', ade20kIndices: [13, 94] },

  // —— Farm Infrastructure (90–98) ——
  { id: 90, name: 'Farm Road', categoryId: 'farm-infrastructure', ade20kIndices: [6, 91] },
  { id: 91, name: 'Field Track', categoryId: 'farm-infrastructure', ade20kIndices: [91] },
  { id: 92, name: 'Irrigation Pipe', categoryId: 'farm-infrastructure', ade20kIndices: [21] },
  { id: 93, name: 'Center Pivot', categoryId: 'farm-infrastructure', ade20kIndices: [29] },
  { id: 94, name: 'Sprinkler System', categoryId: 'farm-infrastructure', ade20kIndices: [29, 21] },
  { id: 95, name: 'Drip Irrigation Area', categoryId: 'farm-infrastructure', ade20kIndices: [29] },
  { id: 96, name: 'Water Tank', categoryId: 'farm-infrastructure', ade20kIndices: [122] },
  { id: 97, name: 'Pump Station', categoryId: 'farm-infrastructure', ade20kIndices: [1] },
  { id: 98, name: 'Agricultural Warehouse', categoryId: 'farm-infrastructure', ade20kIndices: [1] },

  // —— Mining (110–117) ——
  { id: 110, name: 'Mining Area', categoryId: 'mining', ade20kIndices: [13, 34] },
  { id: 111, name: 'Open Pit Mine', categoryId: 'mining', ade20kIndices: [13, 34] },
  { id: 112, name: 'Quarry', categoryId: 'mining', ade20kIndices: [34, 13] },
  { id: 113, name: 'Excavation Area', categoryId: 'mining', ade20kIndices: [13] },
  { id: 114, name: 'Tailings Area', categoryId: 'mining', ade20kIndices: [13, 46] },
  { id: 115, name: 'Waste Dump', categoryId: 'mining', ade20kIndices: [13] },
  { id: 116, name: 'Industrial Area', categoryId: 'mining', ade20kIndices: [1] },
  { id: 117, name: 'Factory', categoryId: 'mining', ade20kIndices: [1] },

  // —— Energy (120–127) ——
  { id: 120, name: 'Solar Farm', categoryId: 'energy', ade20kIndices: [1] },
  { id: 121, name: 'Solar Panel', categoryId: 'energy', ade20kIndices: [130, 1] },
  { id: 122, name: 'Wind Turbine', categoryId: 'energy', ade20kIndices: [84] },
  { id: 123, name: 'Power Station', categoryId: 'energy', ade20kIndices: [1] },
  { id: 124, name: 'Substation', categoryId: 'energy', ade20kIndices: [1] },
  { id: 125, name: 'Pipeline', categoryId: 'energy', ade20kIndices: [6, 91] },
  { id: 126, name: 'Oil Facility', categoryId: 'energy', ade20kIndices: [1] },
  { id: 127, name: 'Gas Facility', categoryId: 'energy', ade20kIndices: [1] },

  // —— Environmental & Disaster (130–137) ——
  { id: 130, name: 'Flood Area', categoryId: 'environmental-disaster', ade20kIndices: [21] },
  { id: 131, name: 'Burned Area', categoryId: 'environmental-disaster', ade20kIndices: [13] },
  { id: 132, name: 'Fire Damage', categoryId: 'environmental-disaster', ade20kIndices: [13, 1] },
  { id: 133, name: 'Landslide', categoryId: 'environmental-disaster', ade20kIndices: [13, 34] },
  { id: 134, name: 'Drought Area', categoryId: 'environmental-disaster', ade20kIndices: [46, 13] },
  { id: 135, name: 'Vegetation Stress Area', categoryId: 'environmental-disaster', ade20kIndices: [9, 17] },
  { id: 136, name: 'Soil Degradation', categoryId: 'environmental-disaster', ade20kIndices: [13, 94] },
  { id: 137, name: 'Desertification Area', categoryId: 'environmental-disaster', ade20kIndices: [46, 13] },
] as const

const CLASS_BY_ID = new Map<number, SegFormerClassDef>(SEGFORMER_CLASSES.map((c) => [c.id, c]))

export function getSegFormerCategory(id: SegFormerCategoryId): SegFormerCategoryDef | undefined {
  return SEGFORMER_CATEGORIES.find((c) => c.id === id)
}

export function getSegFormerClass(id: number): SegFormerClassDef | undefined {
  return CLASS_BY_ID.get(id)
}

export function getSegFormerClassesForCategory(categoryId: SegFormerCategoryId): SegFormerClassDef[] {
  return SEGFORMER_CLASSES.filter((c) => c.categoryId === categoryId)
}

/** True when pretrained ADE20K indices exist and Detect can run. */
export function isSegFormerClassMapped(classOrId: SegFormerClassDef | number): boolean {
  const def = typeof classOrId === 'number' ? CLASS_BY_ID.get(classOrId) : classOrId
  return Boolean(def && def.ade20kIndices.length > 0)
}

export function getSegFormerAde20kIndices(classId: number): number[] {
  return CLASS_BY_ID.get(classId)?.ade20kIndices ?? []
}

/** Lower Detect confidence for agriculture / trees (spaceborne ADE20K proxies). */
export function getSegFormerDefaultMinConfidence(
  categoryOrClass: SegFormerCategoryId | SegFormerClassDef | number,
): number {
  let categoryId: SegFormerCategoryId | undefined
  if (typeof categoryOrClass === 'string') {
    categoryId = categoryOrClass
  } else if (typeof categoryOrClass === 'number') {
    categoryId = CLASS_BY_ID.get(categoryOrClass)?.categoryId
  } else {
    categoryId = categoryOrClass.categoryId
  }
  if (categoryId && (SEGFORMER_SPECTRAL_FALLBACK_CATEGORIES as readonly string[]).includes(categoryId)) {
    return SEGFORMER_AG_MIN_CONFIDENCE
  }
  return SEGFORMER_DEFAULT_MIN_CONFIDENCE
}

/** True when Detect should retry with spectral builtin if ADE20K returns no polygons. */
export function isSegFormerSpectralFallbackClass(classOrId: SegFormerClassDef | number): boolean {
  const def = typeof classOrId === 'number' ? CLASS_BY_ID.get(classOrId) : classOrId
  if (!def) return false
  return (SEGFORMER_SPECTRAL_FALLBACK_CATEGORIES as readonly string[]).includes(def.categoryId)
}
