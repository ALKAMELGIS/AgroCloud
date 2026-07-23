/**
 * Smart Auto Georeference — align an added raster to the basemap automatically.
 *
 * Two interchangeable engines (the user picks which to run):
 *   • 'ondevice' — deterministic computer vision. Renders the raster and a basemap
 *     snapshot of the current footprint to equal grids, takes their Sobel gradient
 *     magnitude (robust to the drone-vs-satellite modality gap), then finds the
 *     rotation + translation that maximises normalised cross-correlation. Returns a
 *     rigid transform (move + rotate) relative to the current footprint, plus a 0–1
 *     confidence (the NCC peak). No API key, offline, free.
 *   • 'ai' — Google Gemini vision. Sends the raster image and the basemap snapshot and
 *     asks for corresponding landmark points; those become ground control points.
 *
 * Nothing here mutates the map — callers preview the proposed placement and confidence,
 * then apply or discard.
 */

import { geminiGenerateContent, type GeminiContent } from '../geoExplorerGemini'

export type SmartAlignEngine = 'ondevice' | 'ai'

/** Geographic bounds (WGS84) of the basemap snapshot passed to the engine. */
export type SmartBounds = { west: number; south: number; east: number; north: number }

/** A rigid refinement relative to the raster's current footprint. */
export type SmartRigidResult = {
  kind: 'rigid'
  /** Fraction of footprint width to move east (+) / west (−). */
  dxFrac: number
  /** Fraction of footprint height to move north (+) / south (−). */
  dyFrac: number
  /** Rotation to apply about the footprint centre, degrees (CCW+). */
  rotationDeg: number
  scale: number
  confidence: number
  engine: SmartAlignEngine
  note: string
}

/** Control-point correspondences in normalised image space (0–1) ↔ geographic. */
export type SmartGcpResult = {
  kind: 'gcps'
  points: Array<{ x01: number; y01: number; lon: number; lat: number }>
  confidence: number
  engine: SmartAlignEngine
  note: string
}

export type SmartAlignResult = SmartRigidResult | SmartGcpResult

// ── Image helpers ───────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for matching.'))
    img.src = src
  })
}

/** Draw an image (optionally rotated about its centre) into an S×S grayscale grid. */
function drawGray(img: HTMLImageElement, S: number, rotDeg = 0): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, S, S)
  ctx.save()
  ctx.translate(S / 2, S / 2)
  if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180)
  ctx.drawImage(img, -S / 2, -S / 2, S, S)
  ctx.restore()
  const { data } = ctx.getImageData(0, 0, S, S)
  const out = new Float32Array(S * S)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return out
}

/**
 * Exhaustive rotation + translation search of the raster's edge map against the basemap's
 * at a given grid size. `shiftRange` bounds the ± pixel shift (grid px); `center` seeds the
 * translation window so a fine pass can refine a coarse result.
 */
function searchRigid(
  rasterImg: HTMLImageElement,
  baseGrad: Float32Array,
  S: number,
  rotations: number[],
  shiftRange: number,
  center: { sx: number; sy: number } = { sx: 0, sy: 0 },
): { corr: number; sx: number; sy: number; rot: number } {
  let best = { corr: -Infinity, sx: center.sx, sy: center.sy, rot: 0 }
  const lo = -shiftRange
  const hi = shiftRange
  for (const rot of rotations) {
    const rasterGrad = gradientMagnitude(drawGray(rasterImg, S, rot), S)
    for (let dy = lo; dy <= hi; dy++) {
      const sy = center.sy + dy
      if (sy <= -S || sy >= S) continue
      for (let dx = lo; dx <= hi; dx++) {
        const sx = center.sx + dx
        if (sx <= -S || sx >= S) continue
        const corr = nccShift(rasterGrad, baseGrad, S, sx, sy)
        if (corr > best.corr) best = { corr, sx, sy, rot }
      }
    }
  }
  return best
}

/** Sobel gradient magnitude — bridges the drone/satellite modality gap for correlation. */
function gradientMagnitude(gray: Float32Array, S: number): Float32Array {
  const out = new Float32Array(S * S)
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x
      const gx =
        -gray[i - S - 1] - 2 * gray[i - 1] - gray[i + S - 1] +
        gray[i - S + 1] + 2 * gray[i + 1] + gray[i + S + 1]
      const gy =
        -gray[i - S - 1] - 2 * gray[i - S] - gray[i - S + 1] +
        gray[i + S - 1] + 2 * gray[i + S] + gray[i + S + 1]
      out[i] = Math.hypot(gx, gy)
    }
  }
  return out
}

/**
 * Normalised cross-correlation of `a` shifted by (sx,sy) against `b` over the overlap.
 * Returns the cosine similarity in [-1, 1].
 */
function nccShift(a: Float32Array, b: Float32Array, S: number, sx: number, sy: number): number {
  let dot = 0
  let na = 0
  let nb = 0
  const x0 = Math.max(0, -sx)
  const x1 = Math.min(S, S - sx)
  const y0 = Math.max(0, -sy)
  const y1 = Math.min(S, S - sy)
  for (let y = y0; y < y1; y++) {
    const ay = (y + sy) * S
    const by = y * S
    for (let x = x0; x < x1; x++) {
      const av = a[ay + x + sx]
      const bv = b[by + x]
      dot += av * bv
      na += av * av
      nb += bv * bv
    }
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

// ── On-device engine ─────────────────────────────────────────────────────────

export async function estimateAlignmentOnDevice(
  rasterUrl: string,
  basemapUrl: string,
  opts?: { size?: number; maxShiftFrac?: number; rotations?: number[] },
): Promise<SmartRigidResult> {
  const [rasterImg, baseImg] = await Promise.all([loadImage(rasterUrl), loadImage(basemapUrl)])

  // ── Pass 1: coarse grid, wide rotation + translation sweep. ────────────────
  const Sc = 80
  const coarseShift = Math.max(6, Math.round((opts?.maxShiftFrac ?? 0.24) * Sc))
  const coarseRots =
    opts?.rotations ?? [-12, -9, -6, -4, -2, 0, 2, 4, 6, 9, 12]
  const baseGradC = gradientMagnitude(drawGray(baseImg, Sc), Sc)
  const coarse = searchRigid(rasterImg, baseGradC, Sc, coarseRots, coarseShift)

  // ── Pass 2: fine grid, refine rotation (±2° @ 0.5°) and translation locally. ─
  const Sf = 140
  const scaleUp = Sf / Sc
  const seed = { sx: Math.round(coarse.sx * scaleUp), sy: Math.round(coarse.sy * scaleUp) }
  const fineRots: number[] = []
  for (let r = coarse.rot - 2; r <= coarse.rot + 2 + 1e-6; r += 0.5) fineRots.push(Number(r.toFixed(2)))
  const baseGradF = gradientMagnitude(drawGray(baseImg, Sf), Sf)
  const fine = searchRigid(rasterImg, baseGradF, Sf, fineRots, 5, seed)

  // Keep whichever pass correlated better (fine can only help, but guard anyway).
  const best =
    fine.corr >= coarse.corr
      ? { corr: fine.corr, sx: fine.sx / Sf, sy: fine.sy / Sf, rot: fine.rot }
      : { corr: coarse.corr, sx: coarse.sx / Sc, sy: coarse.sy / Sc, rot: coarse.rot }

  // Image x → east (+lon); image y (down) → south (−lat). The winning shift is how far
  // the raster must move (as a fraction of footprint) to sit on the basemap.
  return {
    kind: 'rigid',
    dxFrac: best.sx,
    dyFrac: -best.sy,
    // Grid was rotated to match the basemap, so undo it on the placement.
    rotationDeg: -best.rot,
    scale: 1,
    confidence: Math.max(0, Math.min(1, best.corr)),
    engine: 'ondevice',
    note:
      best.corr < 0.25
        ? 'Weak match — the image and basemap share few edges. Review carefully or add control points.'
        : 'Aligned by matching image edges to the basemap.',
  }
}

// ── AI engine (Gemini vision) ────────────────────────────────────────────────

async function urlToInlineImage(src: string): Promise<{ mime_type: string; data: string }> {
  const img = await loadImage(src)
  const S = 768
  const scale = Math.min(1, S / Math.max(img.naturalWidth || S, img.naturalHeight || S))
  const w = Math.max(1, Math.round((img.naturalWidth || S) * scale))
  const h = Math.max(1, Math.round((img.naturalHeight || S) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable.')
  ctx.drawImage(img, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' }
}

function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) throw new Error('AI did not return JSON.')
  return JSON.parse(raw.slice(start, end + 1))
}

export async function estimateAlignmentWithGemini(params: {
  rasterUrl: string
  basemapUrl: string
  bounds: SmartBounds
  apiKey: string
}): Promise<SmartGcpResult> {
  const { rasterUrl, basemapUrl, bounds, apiKey } = params
  if (!apiKey) throw new Error('Add a Gemini API key (System Settings → API Tokens) to use AI matching.')

  const [rasterPart, basePart] = await Promise.all([
    urlToInlineImage(rasterUrl),
    urlToInlineImage(basemapUrl),
  ])

  const system =
    'You are a precise photogrammetry assistant. You match ground features between two ' +
    'top-down images of the same area and output pixel correspondences as strict JSON only.'
  const prompt =
    'IMAGE 1 is a raster to be georeferenced. IMAGE 2 is the reference basemap of the same ' +
    'geographic area. Identify at least 4 (up to 8) clearly corresponding, well-spread ground ' +
    'landmarks (road junctions, field corners, building corners, water edges). For each, give ' +
    'its normalised position in IMAGE 1 and IMAGE 2 with the ORIGIN AT THE TOP-LEFT, x to the ' +
    'right, y downward, each in [0,1]. Respond with JSON ONLY in exactly this shape:\n' +
    '{"confidence":0.0,"matches":[{"raster":[x,y],"basemap":[x,y]}]}\n' +
    'confidence is your 0–1 certainty the two images overlap and the points are correct.'

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [
        { text: prompt },
        { text: 'IMAGE 1 (raster to georeference):' },
        { inline_data: rasterPart },
        { text: 'IMAGE 2 (reference basemap):' },
        { inline_data: basePart },
      ],
    },
  ]

  const text = await geminiGenerateContent({ apiKey, systemInstruction: system, contents })
  const parsed = extractJsonBlock(text) as {
    confidence?: number
    matches?: Array<{ raster?: [number, number]; basemap?: [number, number] }>
  }
  const matches = Array.isArray(parsed.matches) ? parsed.matches : []
  const points: SmartGcpResult['points'] = []
  for (const m of matches) {
    const r = m.raster
    const b = m.basemap
    if (!Array.isArray(r) || !Array.isArray(b)) continue
    const [rx, ry] = r
    const [bx, by] = b
    if (![rx, ry, bx, by].every(v => typeof v === 'number' && v >= -0.05 && v <= 1.05)) continue
    // Basemap normalised (top-left origin) → WGS84 within the snapshot bounds.
    const lon = bounds.west + bx * (bounds.east - bounds.west)
    const lat = bounds.north - by * (bounds.north - bounds.south)
    points.push({ x01: Math.min(1, Math.max(0, rx)), y01: Math.min(1, Math.max(0, ry)), lon, lat })
  }
  if (points.length < 2) {
    throw new Error('AI could not find enough matching landmarks — try a clearer basemap zoom or use on-device matching.')
  }
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6
  return {
    kind: 'gcps',
    points,
    confidence,
    engine: 'ai',
    note: `Gemini matched ${points.length} landmark${points.length === 1 ? '' : 's'} between the image and the basemap.`,
  }
}
