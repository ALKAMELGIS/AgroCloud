import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { ensureDemPxToLngLat } from './cutFillEngine'

export type CutFillProfileSample = {
  distanceM: number
  existingZ: number
  designZ: number
  lng: number
  lat: number
}

export type CutFillProfile = {
  axis: 'row' | 'col'
  samples: CutFillProfileSample[]
}

export type CutFillProfileChartBand = {
  kind: 'cut' | 'fill'
  points: Array<[number, number]>
}

export type CutFillProfileChart = {
  width: number
  height: number
  bands: CutFillProfileChartBand[]
  existing: Array<[number, number]>
  design: Array<[number, number]>
  yMaxLabel: string
  yMinLabel: string
  xEndLabel: string
}

function longestFiniteAxis(
  width: number,
  height: number,
  isFiniteCell: (x: number, y: number) => boolean,
): { axis: 'row' | 'col'; index: number; from: number; to: number; count: number } | null {
  let best: { axis: 'row' | 'col'; index: number; from: number; to: number; count: number } | null = null
  const consider = (axis: 'row' | 'col', index: number, length: number, cell: (i: number) => boolean) => {
    let count = 0
    let from = length
    let to = -1
    for (let i = 0; i < length; i += 1) {
      if (!cell(i)) continue
      count += 1
      if (i < from) from = i
      if (i > to) to = i
    }
    if (count < 2) return
    const span = to - from
    if (!best || span > best.to - best.from || (span === best.to - best.from && count > best.count)) {
      best = { axis, index, from, to, count }
    }
  }
  for (let y = 0; y < height; y += 1) consider('row', y, width, x => isFiniteCell(x, y))
  for (let x = 0; x < width; x += 1) consider('col', x, height, y => isFiniteCell(x, y))
  return best
}

/** Longest existing-vs-design section through the analyzed surface. */
export function buildCutFillProfile(
  dem: DemGrid,
  existingElev: Float32Array,
  designElev: Float32Array,
  difference: Float32Array,
): CutFillProfile | null {
  const grid = ensureDemPxToLngLat(dem)
  const { width, height } = grid
  const axis = longestFiniteAxis(width, height, (x, y) => {
    const i = y * width + x
    return Number.isFinite(difference[i]!) && Number.isFinite(existingElev[i]!) && Number.isFinite(designElev[i]!)
  })
  if (!axis) return null
  const step = Math.max(grid.metersPerPixel || 1, 0.01)
  const samples: CutFillProfileSample[] = []
  for (let i = axis.from; i <= axis.to; i += 1) {
    const x = axis.axis === 'row' ? i : axis.index
    const y = axis.axis === 'row' ? axis.index : i
    const cell = y * width + x
    if (!Number.isFinite(difference[cell]!) || !Number.isFinite(existingElev[cell]!) || !Number.isFinite(designElev[cell]!)) {
      continue
    }
    const [lng, lat] = grid.pxToLngLat(x + 0.5, y + 0.5)
    samples.push({
      distanceM: (i - axis.from) * step,
      existingZ: existingElev[cell]!,
      designZ: designElev[cell]!,
      lng,
      lat,
    })
  }
  if (samples.length < 2) return null
  return { axis: axis.axis, samples }
}

function elevLabel(z: number): string {
  return Math.abs(z) >= 100 ? z.toFixed(0) : z.toFixed(1)
}

function distanceLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

/** View-space profile: cut is red where existing ground is above design. */
export function buildCutFillProfileChart(profile: CutFillProfile, width = 260, height = 108): CutFillProfileChart | null {
  const samples = profile.samples
  if (samples.length < 2) return null
  let zMin = Infinity
  let zMax = -Infinity
  let dMax = 0
  for (const s of samples) {
    zMin = Math.min(zMin, s.existingZ, s.designZ)
    zMax = Math.max(zMax, s.existingZ, s.designZ)
    dMax = Math.max(dMax, s.distanceM)
  }
  if (!Number.isFinite(zMin) || dMax <= 0) return null
  const padZ = Math.max(0.4, (zMax - zMin) * 0.12)
  const z0 = zMin - padZ
  const z1 = zMax + padZ
  const padL = 32
  const padR = 6
  const padT = 8
  const padB = 16
  const plotW = Math.max(1, width - padL - padR)
  const plotH = Math.max(1, height - padT - padB)
  const xOf = (d: number) => padL + (d / dMax) * plotW
  const yOf = (z: number) => padT + ((z1 - z) / (z1 - z0)) * plotH
  const bands: CutFillProfileChartBand[] = []
  const existing: Array<[number, number]> = []
  const design: Array<[number, number]> = []
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!
    existing.push([xOf(s.distanceM), yOf(s.existingZ)])
    design.push([xOf(s.distanceM), yOf(s.designZ)])
    const next = samples[i + 1]
    if (!next) continue
    const cut = (s.existingZ + next.existingZ) * 0.5 >= (s.designZ + next.designZ) * 0.5
    bands.push({
      kind: cut ? 'cut' : 'fill',
      points: [
        [xOf(s.distanceM), yOf(s.existingZ)],
        [xOf(next.distanceM), yOf(next.existingZ)],
        [xOf(next.distanceM), yOf(next.designZ)],
        [xOf(s.distanceM), yOf(s.designZ)],
      ],
    })
  }
  return {
    width,
    height,
    bands,
    existing,
    design,
    yMaxLabel: elevLabel(zMax),
    yMinLabel: elevLabel(zMin),
    xEndLabel: distanceLabel(dMax),
  }
}

export function cutFillProfileLine(profile: CutFillProfile): GeoJSON.Feature<GeoJSON.LineString> | null {
  if (profile.samples.length < 2) return null
  return {
    type: 'Feature',
    properties: { kind: 'cutfill-profile' },
    geometry: {
      type: 'LineString',
      coordinates: profile.samples.map(s => [s.lng, s.lat]),
    },
  }
}
