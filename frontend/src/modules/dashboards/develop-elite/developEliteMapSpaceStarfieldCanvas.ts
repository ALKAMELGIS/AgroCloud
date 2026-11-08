import type { DevelopEliteSpaceCamera } from './developEliteMapSpaceEnvironment'

type Vec3 = [number, number, number]

export type DevelopEliteSpaceStar = {
  dir: Vec3
  radius: number
  alpha: number
  tint: number
  twinkle: number
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function rotateX(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}

function rotateY(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

function rotateZ(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
}

const STAR_CATALOG = buildDevelopEliteSpaceStarCatalog(2400)

/** Fixed seed — stable star positions across sessions (Google Earth–style celestial sphere). */
export function buildDevelopEliteSpaceStarCatalog(count: number): DevelopEliteSpaceStar[] {
  const rand = mulberry32(0x4a67726f)
  const stars: DevelopEliteSpaceStar[] = []
  for (let i = 0; i < count; i += 1) {
    const u = rand()
    const v = rand()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const dir: Vec3 = normalize([
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    ])
    const mag = rand()
    const radius = mag > 0.992 ? 1.65 + rand() * 0.9 : 0.35 + mag * 0.85
    const alpha = mag > 0.992 ? 0.75 + rand() * 0.25 : 0.18 + mag * 0.55
    stars.push({
      dir,
      radius,
      alpha,
      tint: rand(),
      twinkle: rand() * Math.PI * 2,
    })
  }
  return stars
}

function celestialRotation(camera: DevelopEliteSpaceCamera): (v: Vec3) => Vec3 {
  const bearingRad = (camera.bearing * Math.PI) / 180
  const pitchRad = (camera.pitch * Math.PI) / 180
  return (v) => {
    let out = rotateY(v, -bearingRad * 1.05)
    out = rotateX(out, pitchRad * 0.72)
    out = rotateZ(out, bearingRad * 0.08)
    return out
  }
}

/** Interactive celestial sphere — rotates with map bearing/pitch (not a static wallpaper). */
export function paintDevelopEliteMapSpaceStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: DevelopEliteSpaceCamera,
  blend: number,
  timeMs: number,
): void {
  const w = width
  const h = height
  const t = Math.min(1, Math.max(0, blend))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (t <= 0.015) return

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const rotate = celestialRotation(camera)
  const fov = 1.15
  const cx = w * 0.5
  const cy = h * 0.46
  const scale = Math.min(w, h) * 0.48 * fov

  for (const star of STAR_CATALOG) {
    const [x, y, z] = rotate(star.dir)
    if (y < 0.02) continue
    const inv = 1 / (y + 0.15)
    const sx = cx + x * scale * inv
    const sy = cy - z * scale * inv
    if (sx < -4 || sy < -4 || sx > w + 4 || sy > h + 4) continue

    const tw =
      star.radius > 1.2 ? 0.88 + 0.12 * Math.sin(timeMs * 0.0012 + star.twinkle) : 1
    const a = star.alpha * t * tw
    const blue = star.tint > 0.82 ? `rgba(190,210,255,${a})` : `rgba(255,255,255,${a})`

    ctx.fillStyle = blue
    ctx.beginPath()
    ctx.arc(sx, sy, star.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function __developEliteSpaceStarCatalogForTests(): DevelopEliteSpaceStar[] {
  return STAR_CATALOG
}
