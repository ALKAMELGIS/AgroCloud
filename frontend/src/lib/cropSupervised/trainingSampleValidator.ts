import type { CropTrainingSample, TrainingSampleValidation } from './types'

const MIN_CLASSES = 2
const MIN_SAMPLES_PER_CLASS = 2

function ringBbox(ring: number[][]): [number, number, number, number] {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

function geometryBbox(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point,
): [number, number, number, number] | null {
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates
    return [lng, lat, lng, lat]
  }
  const rings: number[][][] =
    geom.type === 'Polygon'
      ? (geom.coordinates as number[][][])
      : (geom.coordinates as number[][][][]).flat()
  if (!rings.length) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const ring of rings) {
    const [rw, rs, re, rn] = ringBbox(ring)
    if (rw < w) w = rw
    if (rs < s) s = rs
    if (re > e) e = re
    if (rn > n) n = rn
  }
  return [w, s, e, n]
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
}

export function validateTrainingSamples(
  samples: CropTrainingSample[],
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): TrainingSampleValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const classCounts: Record<string, number> = {}

  if (!samples.length) {
    errors.push('Upload at least one training sample file with class labels.')
    return { valid: false, errors, warnings, classCounts, totalSamples: 0 }
  }

  for (const s of samples) {
    classCounts[s.className] = (classCounts[s.className] || 0) + 1
  }

  const classNames = Object.keys(classCounts)
  if (classNames.length < MIN_CLASSES) {
    errors.push(`Need at least ${MIN_CLASSES} crop classes in training data (found ${classNames.length}).`)
  }

  for (const [name, count] of Object.entries(classCounts)) {
    if (count < MIN_SAMPLES_PER_CLASS) {
      warnings.push(`Class "${name}" has only ${count} sample(s) — aim for ${MIN_SAMPLES_PER_CLASS}+ per class.`)
    }
  }

  if (aoi) {
    const aoiBbox = geometryBbox(aoi)
    if (aoiBbox) {
      let outside = 0
      for (const s of samples) {
        const bb = geometryBbox(s.geometry)
        if (!bb || !bboxesOverlap(bb, aoiBbox)) outside += 1
      }
      if (outside === samples.length) {
        errors.push('No training samples overlap the drawn AOI bounding box.')
      } else if (outside > 0) {
        warnings.push(`${outside} sample(s) appear outside the AOI extent and may be ignored during extraction.`)
      }
    }
  } else {
    warnings.push('Draw an AOI on the map before running supervised classification.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    classCounts,
    totalSamples: samples.length,
  }
}
