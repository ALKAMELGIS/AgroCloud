/**
 * SegFormer GIS Detection — pretrained ADE20K SegFormer inference proxy.
 *
 * Primary:  forwards to the Python FastAPI service (backend/services/segformer-detection/).
 * Fallback: built-in spectral segmentation using sharp + color-space analysis.
 *           No external API calls — runs entirely on the local machine.
 *
 * Configure with env vars:
 *   SEGFORMER_DETECTION_URL   (optional) service base (default http://127.0.0.1:8095)
 *   SEGFORMER_DETECTION_TOKEN (optional) sent as `Authorization: Bearer <token>`
 */

import express from 'express'

// ─── ADE20K class → spectral classification rules ──────────────────────────
// Each ADE20K index maps to a color-space rule for satellite imagery.
// Rules operate on RGB + derived indices (ExG, ExR, brightness, water index).

const ADE20K_SPECTRAL_RULES = {
  // vegetation / field / tree / grass / plant / palm / shrub
  4:  { type: 'vegetation', label: 'tree' },
  9:  { type: 'vegetation', label: 'grass' },
  17: { type: 'vegetation', label: 'plant' },
  29: { type: 'vegetation', label: 'field' },
  72: { type: 'vegetation', label: 'palm' },
  // water / river / lake / sea
  21: { type: 'water', label: 'water' },
  26: { type: 'water', label: 'sea' },
  60: { type: 'water', label: 'river' },
  128:{ type: 'water', label: 'lake' },
  // earth / soil / land / sand / dirt
  13: { type: 'soil', label: 'earth' },
  46: { type: 'soil', label: 'sand' },
  91: { type: 'soil', label: 'dirt track' },
  94: { type: 'soil', label: 'land' },
  // rock / mountain / hill
  34: { type: 'rock', label: 'rock' },
  16: { type: 'rock', label: 'mountain' },
  68: { type: 'rock', label: 'hill' },
  // building / house / hovel / skyscraper
  1:  { type: 'building', label: 'building' },
  25: { type: 'building', label: 'house' },
  48: { type: 'building', label: 'skyscraper' },
  79: { type: 'building', label: 'hovel' },
  // road / sidewalk / path / runway / bridge
  6:  { type: 'road', label: 'road' },
  11: { type: 'road', label: 'sidewalk' },
  52: { type: 'road', label: 'path' },
  54: { type: 'road', label: 'runway' },
  61: { type: 'road', label: 'bridge' },
  // vehicle types
  20: { type: 'vehicle', label: 'car' },
  80: { type: 'vehicle', label: 'bus' },
  83: { type: 'vehicle', label: 'truck' },
  90: { type: 'vehicle', label: 'airplane' },
  76: { type: 'vehicle', label: 'boat' },
  103:{ type: 'vehicle', label: 'ship' },
  116:{ type: 'vehicle', label: 'minibike' },
  // fence
  32: { type: 'road', label: 'fence' },
  // industrial / tower / tank
  84: { type: 'building', label: 'tower' },
  122:{ type: 'building', label: 'tank' },
  130:{ type: 'building', label: 'screen' },
  41: { type: 'building', label: 'box' },
}

const CLASS_NAMES = {
  1:'Agricultural Field',2:'Cultivated Land',3:'Fallow Field',4:'Abandoned Field',
  5:'Newly Cultivated Area',6:'Irrigated Field',7:'Rainfed Field',8:'Farm Boundary',
  9:'Greenhouse',10:'Nursery',11:'Orchard',12:'Plantation',13:'Pasture',14:'Grassland',
  15:'Crop Residue Area',20:'Tree Canopy',21:'Individual Tree',22:'Tree Row',
  23:'Forest Tree',24:'Date Palm',25:'Olive Tree',26:'Fruit Tree',27:'Plantation Tree',
  28:'Shrub',29:'Bush Area',30:'Grass Vegetation',31:'Dense Vegetation',
  32:'Sparse Vegetation',33:'Dead Tree',34:'Tree Stress Area',
  40:'Building',41:'Residential Building',42:'Industrial Building',43:'Warehouse',
  44:'Farm Building',45:'Greenhouse Structure',46:'Construction Area',47:'Urban Area',
  48:'Settlement',50:'Road',51:'Highway',52:'Street',53:'Railway',54:'Bridge',
  55:'Airport',56:'Runway',57:'Parking Area',60:'Car',61:'Truck',62:'Bus',
  63:'Tractor',64:'Motorcycle',65:'Aircraft',66:'Ship',67:'Container',68:'Equipment',
  70:'River',71:'Lake',72:'Reservoir',73:'Dam',74:'Canal',75:'Irrigation Channel',
  76:'Water Pond',77:'Flood Water',78:'Wetland',79:'Coastal Water',
  80:'Bare Soil',81:'Sand',82:'Desert',83:'Rock',84:'Mountain',85:'Gravel Area',
  86:'Salt Flat',87:'Dry Land',88:'Erosion Area',
  90:'Farm Road',91:'Field Track',92:'Irrigation Pipe',93:'Center Pivot',
  94:'Sprinkler System',95:'Drip Irrigation Area',96:'Water Tank',97:'Pump Station',
  98:'Agricultural Warehouse',110:'Mining Area',111:'Open Pit Mine',112:'Quarry',
  113:'Excavation Area',114:'Tailings Area',115:'Waste Dump',116:'Industrial Area',
  117:'Factory',120:'Solar Farm',121:'Solar Panel',122:'Wind Turbine',
  123:'Power Station',124:'Substation',125:'Pipeline',126:'Oil Facility',
  127:'Gas Facility',130:'Flood Area',131:'Burned Area',132:'Fire Damage',
  133:'Landslide',134:'Drought Area',135:'Vegetation Stress Area',
  136:'Soil Degradation',137:'Desertification Area',
}

const CLASS_ADE20K = {
  // Core ag field classes: field(29)+earth(13)+grass(9)+plant(17) spaceborne proxies
  // Class 1 field pipeline: ADE20K field(29) only (no earth/grass/plant soup).
  1:[29],2:[29,9,17,13],3:[13,94,9],4:[13,94,9],5:[29,13,9],6:[29,9,17,21],7:[29,9,17,13],8:[32,6],
  9:[1],10:[17,4],11:[4,17],12:[4,17],13:[9,17,29],14:[9,17,29],15:[13,9,29],
  20:[4],21:[4],22:[4],23:[4],24:[72],25:[4],26:[4],27:[4],28:[17],29:[17],
  30:[9],31:[4,17],32:[9,17],33:[4],34:[4,17],
  40:[1],41:[1,25],42:[1],43:[1],44:[1],45:[1],46:[13,1],47:[1,25,48],48:[1,25,79],
  50:[6],51:[6],52:[6,11],53:[6,52],54:[61],55:[54],56:[54],57:[6,11],
  60:[20],61:[83],62:[80],63:[83],64:[116],65:[90],66:[76,103],67:[41],68:[83,41],
  70:[60,21],71:[128,21],72:[21,128],73:[21,61],74:[21],75:[21],76:[21],77:[21],78:[21],79:[26,21],
  80:[13],81:[46],82:[46,13],83:[34],84:[16,68],85:[13],86:[46,13],87:[94,13],88:[13,94],
  90:[6,91],91:[91],92:[21],93:[29],94:[29,21],95:[29],96:[122],97:[1],98:[1],
  110:[13,34],111:[13,34],112:[34,13],113:[13],114:[13,46],115:[13],116:[1],117:[1],
  120:[1],121:[130,1],122:[84],123:[1],124:[1],125:[6,91],126:[1],127:[1],
  130:[21],131:[13],132:[13,1],133:[13,34],134:[46,13],135:[9,17],136:[13,94],137:[46,13],
}

/** Agriculture (1–15) + trees (20–34) — spectral retry when ADE20K returns empty. */
const SPECTRAL_FALLBACK_CLASS_IDS = new Set([
  ...Array.from({ length: 15 }, (_, i) => i + 1),
  ...Array.from({ length: 15 }, (_, i) => i + 20),
])
const AG_DEFAULT_MIN_CONFIDENCE = 0.3
const DEFAULT_MIN_CONFIDENCE = 0.45

function isSpectralFallbackClass(classId) {
  return SPECTRAL_FALLBACK_CLASS_IDS.has(Number(classId))
}

function defaultMinConfidenceForClass(classId) {
  return isSpectralFallbackClass(classId) ? AG_DEFAULT_MIN_CONFIDENCE : DEFAULT_MIN_CONFIDENCE
}

/**
 * True when Python ADE20K returned no polygons for an ag/veg class — retry spectral.
 */
function shouldSpectralFallbackEmpty(body, json) {
  if (!json || typeof json !== 'object') return false
  const classId = Number(body?.classId ?? body?.class_id ?? json.class_id ?? json.classId)
  if (!isSpectralFallbackClass(classId)) return false
  const features = json.geojson?.features
  const count = Number(json.count)
  const emptyFeatures = Array.isArray(features) ? features.length === 0 : true
  const emptyCount = !Number.isFinite(count) || count <= 0
  return emptyFeatures && emptyCount
}

// ─── Built-in spectral segmentation engine ──────────────────────────────────

/**
 * Classify a single pixel into a spectral type based on RGB values.
 * Handles both true-color satellite imagery AND false-color index overlays
 * (NDVI, NDWI, etc.) where colormaps encode the vegetation/water/soil classes.
 *
 * NDVI false-color palettes typically use:
 *   Bright green     → high NDVI (healthy vegetation)
 *   Yellow-green     → moderate vegetation
 *   Orange / brown   → low NDVI (bare soil / fallow)
 *   Red / dark red   → very low NDVI (stressed / burned)
 *   Blue / cyan      → water (NDWI) or negative NDVI
 */
function classifyPixel(r, g, b) {
  const sum = r + g + b || 1
  const rn = r / sum, gn = g / sum, bn = b / sum
  const exg = 2 * gn - rn - bn          // excess green index (-1..1)
  const brightness = (r + g + b) / 3     // 0..255
  const waterIdx = bn - rn               // blue dominance

  // ── Vegetation: natural green OR false-color green ──
  // Natural imagery: green-dominant pixels (crops, trees, grass)
  if (g > 40 && g > r && g > b && exg > 0.02) return 'vegetation'
  // NDVI false-color: vivid green (g high, r low-to-moderate)
  if (g > 80 && g > r * 0.8 && g > b * 1.2) return 'vegetation'
  // Yellow-green (moderate vegetation in NDVI overlay)
  if (g > 100 && r > 80 && r < g * 1.15 && b < g * 0.6 && g > b * 1.5) return 'vegetation'
  // Dark green (dense canopy / forest)
  if (g > 30 && g > r * 1.3 && g > b * 1.3 && brightness < 120) return 'vegetation'

  // ── Water: blue-dominant OR dark pixels ──
  if (waterIdx > 0.08 && b > 50 && b > r * 1.15) return 'water'
  if (b > 100 && b > r * 1.4 && b > g * 1.2) return 'water'
  // Very dark = deep water or shadow
  if (brightness < 30) return 'water'
  // Cyan tones (NDWI / water index overlays)
  if (b > 80 && g > 80 && r < 60 && bn > 0.3) return 'water'

  // ── Building / urban: bright neutral (white/grey rooftops) ──
  if (brightness > 190 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'building'
  // Medium grey (concrete / asphalt structures)
  if (brightness > 130 && brightness < 200 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20
      && Math.abs(r - b) < 20) return 'building'

  // ── Soil: warm tones (orange, brown, tan) ──
  // Orange in NDVI overlay = bare soil / fallow
  if (r > 140 && r > g * 1.1 && r > b * 1.5 && g > 60) return 'soil'
  // Brown / tan (natural or overlay)
  if (r > 100 && g > 60 && b < 80 && r > g && r > b * 1.3) return 'soil'
  // Light beige / sand
  if (brightness > 160 && r > g && r > b && rn > 0.38) return 'soil'
  // Red / dark red in NDVI overlay = stressed / very low NDVI
  if (r > 100 && r > g * 1.6 && r > b * 1.6) return 'soil'

  // ── Rock: grey-brown with low saturation ──
  if (brightness > 80 && brightness < 160 && Math.abs(r - g) < 25 && r > b
      && Math.abs(r - b) < 40) return 'rock'

  // ── Road: medium neutral grey ──
  if (brightness > 100 && brightness < 190 && Math.abs(r - g) < 25
      && Math.abs(g - b) < 25 && Math.abs(r - b) < 25) return 'road'

  return 'unknown'
}

/**
 * Run spectral segmentation on raw RGB pixel data.
 * Returns a binary mask (Uint8Array) of matching pixels.
 */
function spectralSegment(rgbData, width, height, targetTypes) {
  const mask = new Uint8Array(width * height)
  const typeSet = new Set(targetTypes)

  for (let i = 0; i < width * height; i++) {
    const r = rgbData[i * 3]
    const g = rgbData[i * 3 + 1]
    const b = rgbData[i * 3 + 2]
    const type = classifyPixel(r, g, b)
    if (typeSet.has(type)) mask[i] = 1
  }

  // Morphological cleanup: remove isolated pixels, fill small holes
  // Simple 3x3 erosion then dilation
  const eroded = morphErode(mask, width, height)
  const dilated = morphDilate(eroded, width, height)
  // Fill small holes with dilation then erosion
  const filled = morphDilate(dilated, width, height)
  return morphErode(filled, width, height)
}

function morphErode(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] && mask[i-1] && mask[i+1] && mask[i-w] && mask[i+w]) {
        out[i] = 1
      }
    }
  }
  return out
}

function morphDilate(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] || mask[i-1] || mask[i+1] || mask[i-w] || mask[i+w]) {
        out[i] = 1
      }
    }
  }
  return out
}

/**
 * Find connected components in a binary mask using flood-fill.
 * Returns array of components with edge pixel arrays.
 */
function findComponents(mask, width, height, minPixels = 16) {
  const visited = new Uint8Array(width * height)
  const components = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!mask[idx] || visited[idx]) continue

      const pixels = []
      const queue = [idx]
      visited[idx] = 1

      while (queue.length > 0) {
        const ci = queue.pop()
        pixels.push(ci)
        const cy = (ci / width) | 0
        const cx = ci % width

        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = ny * width + nx
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1
              queue.push(ni)
            }
          }
        }
      }

      if (pixels.length >= minPixels) {
        // Extract edge pixels
        const edgePixels = []
        for (const pi of pixels) {
          const py = (pi / width) | 0
          const px = pi % width
          let isEdge = false
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = px + dx, ny = py + dy
            if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
              isEdge = true; break
            }
          }
          if (isEdge) edgePixels.push([px, py])
        }
        components.push({ pixels, edgePixels, pixelCount: pixels.length })
      }
    }
  }
  return components
}

/**
 * Convex hull via Andrew's monotone chain.
 */
function convexHull(points) {
  if (points.length <= 2) return points.slice()
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Simplify a polygon ring using Douglas-Peucker.
 */
function simplifyRing(ring, epsilon) {
  if (ring.length <= 3) return ring
  let maxDist = 0, maxIdx = 0
  const first = ring[0], last = ring[ring.length - 1]
  for (let i = 1; i < ring.length - 1; i++) {
    const d = pointToLineDist(ring[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = simplifyRing(ring.slice(0, maxIdx + 1), epsilon)
    const right = simplifyRing(ring.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

function pointToLineDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function metersPerDeg(lat) {
  const r = lat * Math.PI / 180
  const mLat = 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r)
  const mLon = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r)
  return { mLon: Math.max(mLon, 1), mLat: Math.max(mLat, 1) }
}

function pointInPolygon(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

/**
 * Convert component edge pixels to a simplified GeoJSON polygon.
 */
function componentToGeoPolygon(comp, width, height, bbox) {
  const [west, south, east, north] = bbox
  const hull = convexHull(comp.edgePixels)
  if (hull.length < 3) return null

  // Convert to geographic coordinates
  let geoRing = hull.map(([px, py]) => [
    west + (px / Math.max(width - 1, 1)) * (east - west),
    north - (py / Math.max(height - 1, 1)) * (north - south),
  ])

  // Simplify
  const diagDeg = Math.hypot(east - west, north - south)
  const epsilon = diagDeg * 0.002
  geoRing = simplifyRing(geoRing, epsilon)
  if (geoRing.length < 3) return null

  // Close ring
  geoRing.push([...geoRing[0]])

  // Compute metrics
  const latMid = (south + north) / 2
  const { mLon, mLat } = metersPerDeg(latMid)
  const mCoords = geoRing.map(([lon, lat]) => [lon * mLon, lat * mLat])

  let area = 0
  for (let i = 0; i < mCoords.length - 1; i++) {
    area += mCoords[i][0] * mCoords[i + 1][1]
    area -= mCoords[i + 1][0] * mCoords[i][1]
  }
  area = Math.abs(area) / 2

  let perimeter = 0
  for (let i = 0; i < mCoords.length - 1; i++) {
    perimeter += Math.hypot(
      mCoords[i + 1][0] - mCoords[i][0],
      mCoords[i + 1][1] - mCoords[i][1],
    )
  }

  return { ring: geoRing, areaM2: area, perimeterM: perimeter }
}

/**
 * Apply AOI clipping to a binary mask.
 */
function applyAoiMask(mask, width, height, bbox, aoi) {
  if (!aoi) return
  const rings = extractAoiPolygons(aoi)
  if (!rings.length) return

  const [west, south, east, north] = bbox
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!mask[idx]) continue
      const lon = west + (x / Math.max(width - 1, 1)) * (east - west)
      const lat = north - (y / Math.max(height - 1, 1)) * (north - south)
      let inside = false
      for (const ring of rings) {
        if (pointInPolygon(lon, lat, ring)) { inside = true; break }
      }
      if (!inside) mask[idx] = 0
    }
  }
}

function extractAoiPolygons(aoi) {
  if (!aoi || typeof aoi !== 'object') return []
  const rings = []
  const addGeom = (g) => {
    if (!g) return
    if (g.type === 'Polygon') rings.push(...(g.coordinates || []))
    if (g.type === 'MultiPolygon') for (const p of g.coordinates || []) rings.push(...p)
  }
  if (aoi.type === 'FeatureCollection') {
    for (const f of aoi.features || []) addGeom(f?.geometry)
  } else if (aoi.type === 'Feature') {
    addGeom(aoi.geometry)
  } else {
    addGeom(aoi)
  }
  return rings
}

/**
 * Full built-in detection pipeline: decode image → spectral segment → polygons.
 */
async function detectBuiltIn(body) {
  const sharp = (await import('sharp')).default

  const imageDataUrl = body.imageDataUrl || body.image
  const classId = Number(body.classId ?? body.class_id)
  const className = body.className || body.class_name || CLASS_NAMES[classId] || `Class ${classId}`
  const ade20kIndices = body.ade20kIndices || body.ade20k_indices || CLASS_ADE20K[classId] || []
  const minConfidence = Number(
    body.minConfidence ?? body.min_confidence ?? defaultMinConfidenceForClass(classId),
  )
  const bbox = body.bbox

  if (!ade20kIndices.length) {
    return { status: 422, json: { error: 'No ADE20K indices mapped for this class.' } }
  }

  // Determine target spectral types from ADE20K indices
  const targetTypes = new Set()
  for (const idx of ade20kIndices) {
    const rule = ADE20K_SPECTRAL_RULES[idx]
    if (rule) targetTypes.add(rule.type)
  }
  if (!targetTypes.size) {
    // Default to vegetation for unknown indices
    targetTypes.add('vegetation')
  }

  // Decode image
  const raw = imageDataUrl.includes(',') && imageDataUrl.trim().startsWith('data:')
    ? imageDataUrl.split(',')[1]
    : imageDataUrl
  const imgBuf = Buffer.from(raw, 'base64')

  const img = sharp(imgBuf)
  const meta = await img.metadata()
  const width = meta.width
  const height = meta.height

  // Resize to max 512px edge for performance
  const maxEdge = 512
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const workW = Math.max(1, Math.round(width * scale))
  const workH = Math.max(1, Math.round(height * scale))

  const { data: rgbData } = await img
    .resize(workW, workH, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  console.log(`[segformer-builtin] ${workW}x${workH} image, target types: [${[...targetTypes].join(', ')}]`)

  // Run spectral segmentation
  const mask = spectralSegment(rgbData, workW, workH, [...targetTypes])

  // Apply AOI clip
  if (body.aoi) {
    applyAoiMask(mask, workW, workH, bbox, body.aoi)
  }

  // Count mask pixels for confidence score
  let maskCount = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) maskCount++
  const coverage = maskCount / (workW * workH)
  const score = Math.min(0.95, 0.5 + coverage * 0.4)

  console.log(`[segformer-builtin] mask: ${maskCount}/${workW * workH} pixels (${(coverage * 100).toFixed(1)}% coverage)`)

  if (maskCount < 4) {
    return {
      status: 200,
      json: {
        geojson: { type: 'FeatureCollection', features: [] },
        count: 0, score: 0, mask_png: null,
        width, height, class_id: classId, classId,
        class_name: className, className,
        aoi_applied: Boolean(body.aoi), aoiApplied: Boolean(body.aoi),
        device: 'spectral-builtin', model: 'spectral-segmentation',
      },
    }
  }

  // Find connected components (min 8 pixels to form a feature)
  const components = findComponents(mask, workW, workH, 8)

  console.log(`[segformer-builtin] ${maskCount} mask pixels, ${components.length} components`)

  // Convert to GeoJSON features
  const dateIso = String(body.date || body.Date || '').trim() || new Date().toISOString()
  const provider =
    String(body.provider || body.Provider || '').trim() || 'segformer-spectral'
  const features = []
  let objectIdx = 1

  for (const comp of components) {
    const poly = componentToGeoPolygon(comp, workW, workH, bbox)
    if (!poly || poly.areaM2 < 1) continue

    const objectId = `SF-${String(objectIdx).padStart(5, '0')}`
    features.push({
      type: 'Feature',
      id: objectId,
      geometry: { type: 'Polygon', coordinates: [poly.ring] },
      properties: {
        Feature_ID: objectId,
        Class_Name: className,
        Confidence: Math.round(score * 10000) / 10000,
        Area_m2: Math.round(poly.areaM2 * 100) / 100,
        Area_Hectare: Math.round(poly.areaM2 / 10000 * 1e6) / 1e6,
        Perimeter: Math.round(poly.perimeterM * 100) / 100,
        Date: dateIso,
        Provider: provider,
        objectId, object_id: objectId,
        className, class_name: className,
        classId, class_id: classId,
        confidence: Math.round(score * 10000) / 10000,
        areaM2: Math.round(poly.areaM2 * 100) / 100,
        area_m2: Math.round(poly.areaM2 * 100) / 100,
        areaHa: Math.round(poly.areaM2 / 10000 * 1e6) / 1e6,
        area_ha: Math.round(poly.areaM2 / 10000 * 1e6) / 1e6,
        perimeterM: Math.round(poly.perimeterM * 100) / 100,
        perimeter_m: Math.round(poly.perimeterM * 100) / 100,
        date: dateIso,
        provider,
        source: 'segformer-spectral',
        crs: 'EPSG:4326',
      },
    })
    objectIdx++
  }

  // Generate mask PNG overlay
  let maskPng = null
  try {
    const rgba = Buffer.alloc(workW * workH * 4)
    for (let i = 0; i < workW * workH; i++) {
      if (mask[i]) {
        rgba[i * 4] = 34       // R
        rgba[i * 4 + 1] = 197  // G
        rgba[i * 4 + 2] = 94   // B
        rgba[i * 4 + 3] = 170  // A
      }
    }
    const pngBuf = await sharp(rgba, { raw: { width: workW, height: workH, channels: 4 } })
      .png()
      .toBuffer()
    maskPng = 'data:image/png;base64,' + pngBuf.toString('base64')
  } catch { /* non-critical */ }

  return {
    status: 200,
    json: {
      geojson: { type: 'FeatureCollection', features },
      count: features.length,
      score: Math.round(score * 10000) / 10000,
      mask_png: maskPng,
      maskPng,
      width, height,
      class_id: classId, classId,
      class_name: className, className,
      aoi_applied: Boolean(body.aoi), aoiApplied: Boolean(body.aoi),
      device: 'spectral-builtin',
      model: 'spectral-segmentation',
    },
  }
}

// ─── Main route registration ────────────────────────────────────────────────

/**
 * Register the SegFormer-detection proxy routes.
 * @param {import('express').Express} app
 */
export function registerSegFormerDetectionRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const RAW = String(process.env.SEGFORMER_DETECTION_URL || 'http://127.0.0.1:8095').trim()
  const TOKEN = String(process.env.SEGFORMER_DETECTION_TOKEN || '').trim()

  const SERVICE_BASE = RAW.replace(/\/detect\/?$/, '').replace(/\/$/, '')
  const DETECT_URL = `${SERVICE_BASE}/detect`
  const HEALTH_URL = `${SERVICE_BASE}/health`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateDetectBody(body) {
    if (!body || typeof body !== 'object') {
      return 'Expected JSON { imageDataUrl|image, bbox, classId } for SegFormer detection.'
    }
    const image = body.imageDataUrl ?? body.image
    if (typeof image !== 'string' || !String(image).trim()) {
      return 'Expected JSON { imageDataUrl|image, bbox, classId } for SegFormer detection.'
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
    }
    const classId = body.classId ?? body.class_id
    if (classId == null || !Number.isFinite(Number(classId))) {
      return 'classId must be a finite number.'
    }
    return null
  }

  /**
   * Normalize optional tiling fields on the request body before forward / builtin.
   * Builtin spectral path ignores tiling (single-pass resize); Python service uses them.
   */
  function normalizeTilingFields(body) {
    if (!body || typeof body !== 'object') return body
    const ALLOWED = new Set([256, 512, 1024])
    let tileSize = Number(body.tileSize ?? body.tile_size ?? 512)
    if (!ALLOWED.has(tileSize)) tileSize = 512
    let overlap = Number(body.overlap ?? body.overlap_pct ?? 0.2)
    if (!Number.isFinite(overlap)) overlap = 0.2
    if (overlap > 1) overlap = overlap / 100
    overlap = Math.max(0, Math.min(0.5, overlap))
    return {
      ...body,
      tileSize,
      tile_size: tileSize,
      overlap,
      overlap_pct: overlap,
    }
  }

  async function forwardJson(url, { method = 'GET', body, timeoutMs = 60_000 } = {}) {
    const headers = authHeaders(body != null ? { 'Content-Type': 'application/json' } : {})
    const upstream = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await upstream.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      return { status: 502, json: { error: 'Non-JSON response.', detail: text.slice(0, 600) } }
    }
    if (!upstream.ok) {
      const passthrough = upstream.status === 400 || upstream.status === 404 || upstream.status === 422
      return {
        status: passthrough ? upstream.status : 502,
        json: {
          error: json?.error || json?.detail || `Service error (HTTP ${upstream.status}).`,
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  async function isLocalServiceOnline() {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3_000) })
      return res.ok
    } catch {
      return false
    }
  }

  console.log(
    `[segformer-detection] routes registered — proxy target ${SERVICE_BASE} (token ${TOKEN ? 'set' : 'NOT set'}, built-in fallback enabled)`,
  )

  app.get('/api/segformer-detection/config', (_req, res) => {
    res.json({ configured: true, endpoint: true })
  })

  app.get('/api/segformer-detection/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5_000) })
      const json = await upstream.json().catch(() => ({}))
      return res.status(200).json({ ...json, builtin_fallback: true })
    } catch {
      return res.status(200).json({
        status: 'ok',
        engine: 'spectral-builtin',
        model: 'spectral-segmentation',
        device: 'cpu',
        model_ready: true,
        builtin_fallback: true,
      })
    }
  })

  app.post(
    '/api/segformer-detection/detect',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })
      const body = normalizeTilingFields(req.body)

      // Try local Python service first
      if (await isLocalServiceOnline()) {
        try {
          const { status, json } = await forwardJson(DETECT_URL, {
            method: 'POST',
            body,
            timeoutMs: 10 * 60 * 1000,
          })
          // ADE20K rarely labels satellite fields — retry spectral for ag/veg empties.
          if (status === 200 && shouldSpectralFallbackEmpty(body, json)) {
            console.log(
              `[segformer-detection] ADE20K empty for class ${body.classId ?? body.class_id} — spectral fallback`,
            )
            try {
              // Builtin ignores tileSize/overlap (single-pass spectral crop).
              const builtin = await detectBuiltIn(body)
              return res.status(builtin.status).json({
                ...builtin.json,
                fallback: 'spectral-builtin',
                primary_engine: 'segformer-ade20k',
                primary_count: 0,
                tile_size: body.tileSize,
                tileSize: body.tileSize,
                overlap: body.overlap,
                tile_count: 1,
                tileCount: 1,
              })
            } catch (fallbackErr) {
              console.log(
                `[segformer-detection] spectral fallback failed, returning ADE20K empty: ${fallbackErr.message}`,
              )
            }
          }
          return res.status(status).json(json)
        } catch (error) {
          console.log(`[segformer-detection] local service error, using built-in: ${error.message}`)
        }
      }

      // Built-in spectral segmentation fallback
      try {
        console.log('[segformer-detection] using built-in spectral segmentation…')
        const { status, json } = await detectBuiltIn(body)
        return res.status(status).json({
          ...json,
          tile_size: body.tileSize,
          tileSize: body.tileSize,
          overlap: body.overlap,
          tile_count: 1,
          tileCount: 1,
        })
      } catch (error) {
        console.error(`[segformer-detection] built-in failed: ${error.message}`)
        return res.status(500).json({
          error: `Detection failed: ${error.message}`,
          detail: error.stack?.slice(0, 500),
        })
      }
    },
  )
}
