/**
 * CPU helpers: cloud density sampling + displaced mesh for atmospheric 3D clouds.
 */

import mapboxgl from 'mapbox-gl'
import type { SiSentinel3dCloudDeckPayload } from './siSentinel3dCloudDeckCustomLayer'

export const SI_CLOUD_ATMOSPHERE_MESH_GRID = 28
export const SI_CLOUD_ATMOSPHERE_SHELLS = [
  { heightFrac: 0, uvScale: 1, alpha: 0.58 },
  { heightFrac: 0.38, uvScale: 1.015, alpha: 0.34 },
  { heightFrac: 0.72, uvScale: 1.03, alpha: 0.2 },
] as const

export function bilinearLngLatAtUv(
  coordinates: SiSentinel3dCloudDeckPayload['coordinates'],
  u: number,
  v: number,
): [number, number] {
  const [tl, tr, br, bl] = coordinates
  const uu = Math.max(0, Math.min(1, u))
  const vv = Math.max(0, Math.min(1, v))
  const lng =
    (1 - uu) * (1 - vv) * tl[0] +
    uu * (1 - vv) * tr[0] +
    uu * vv * br[0] +
    (1 - uu) * vv * bl[0]
  const lat =
    (1 - uu) * (1 - vv) * tl[1] +
    uu * (1 - vv) * tr[1] +
    uu * vv * br[1] +
    (1 - uu) * vv * bl[1]
  return [lng, lat]
}

/** 0–1 density from Sentinel cloud RGBA (same footprint as 2D mask). */
export function sampleCloudDensityRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const uu = Math.max(0, Math.min(1, u))
  const vv = Math.max(0, Math.min(1, v))
  const xf = uu * (width - 1)
  const yf = vv * (height - 1)
  const x0 = Math.floor(xf)
  const y0 = Math.floor(yf)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = xf - x0
  const ty = yf - y0
  const sample = (px: number, py: number) => {
    const i = (py * width + px) * 4
    const a = rgba[i + 3]! / 255
    const lum = (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 765
    return a * Math.min(1, lum * 1.15 + 0.12)
  }
  const d00 = sample(x0, y0)
  const d10 = sample(x1, y0)
  const d01 = sample(x0, y1)
  const d11 = sample(x1, y1)
  return (1 - tx) * (1 - ty) * d00 + tx * (1 - ty) * d10 + (1 - tx) * ty * d01 + tx * ty * d11
}

function hashNoise(u: number, v: number): number {
  const s = Math.sin(u * 127.1 + v * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export type AtmosphericMesh = {
  /** Interleaved: mercator x,y,z,w, uv.u, uv.v, density */
  interleaved: Float32Array
  vertexCount: number
}

/** One horizontal quad per shell altitude — texture alpha preserves exact 2D cloud pixels. */
export function buildPixelLiftCloudDeckMesh(
  payload: SiSentinel3dCloudDeckPayload,
  shellIndex: number,
): AtmosphericMesh {
  const spread = payload.deckVerticalSpreadM ?? 0
  const shell = SI_CLOUD_ATMOSPHERE_SHELLS[shellIndex] ?? SI_CLOUD_ATMOSPHERE_SHELLS[0]
  const asl =
    payload.pixelLift !== false || spread <= 0
      ? payload.deckAltitudeM
      : payload.deckAltitudeM + shell.heightFrac * spread
  const verts: number[] = []
  const corner = (u: number, v: number): number[] => {
    const [lng, lat] = bilinearLngLatAtUv(payload.coordinates, u, v)
    const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, asl)
    return [mc.x, mc.y, mc.z, 1, u, v, 1]
  }
  const p00 = corner(0, 0)
  const p10 = corner(1, 0)
  const p11 = corner(1, 1)
  const p01 = corner(0, 1)
  verts.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
  const interleaved = new Float32Array(verts)
  return { interleaved, vertexCount: interleaved.length / 7 }
}

export function buildAtmosphericCloudMesh(
  payload: SiSentinel3dCloudDeckPayload,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  shellIndex: number,
  grid = SI_CLOUD_ATMOSPHERE_MESH_GRID,
): AtmosphericMesh {
  const shell = SI_CLOUD_ATMOSPHERE_SHELLS[shellIndex] ?? SI_CLOUD_ATMOSPHERE_SHELLS[0]
  const spread = payload.deckVerticalSpreadM ?? 900
  const baseAsl = payload.deckAltitudeM
  const verts: number[] = []
  const pushTri = (a: number[], b: number[], c: number[]) => {
    verts.push(...a, ...b, ...c)
  }

  const corner = (gi: number, gj: number): number[] | null => {
    const u = gi / grid
    const v = gj / grid
    const cu = 0.5 + (u - 0.5) * shell.uvScale
    const cv = 0.5 + (v - 0.5) * shell.uvScale
    const density = sampleCloudDensityRgba(rgba, width, height, cu, cv)
    if (density < 0.02) return null
    const [lng, lat] = bilinearLngLatAtUv(payload.coordinates, u, v)
    const puff =
      density * spread * (0.55 + 0.45 * hashNoise(u * 19 + shellIndex, v * 23 + shellIndex))
    const asl = baseAsl + shell.heightFrac * spread + puff
    const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, asl)
    return [mc.x, mc.y, mc.z, 1, cu, cv, density]
  }

  for (let j = 0; j < grid; j += 1) {
    for (let i = 0; i < grid; i += 1) {
      const p00 = corner(i, j)
      const p10 = corner(i + 1, j)
      const p01 = corner(i, j + 1)
      const p11 = corner(i + 1, j + 1)
      if (p00 && p10 && p11) pushTri(p00, p10, p11)
      if (p00 && p11 && p01) pushTri(p00, p11, p01)
    }
  }

  const interleaved = new Float32Array(verts)
  return { interleaved, vertexCount: interleaved.length / 7 }
}
