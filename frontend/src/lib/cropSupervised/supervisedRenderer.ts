import type { SupervisedClassDef } from './types'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function rgbaToPngDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  const imgData = ctx.createImageData(width, height)
  imgData.data.set(rgba)
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

export function renderClassificationMaps(
  labels: Int16Array,
  confidence: Float32Array,
  valid: Uint8Array,
  width: number,
  height: number,
  classDefs: SupervisedClassDef[],
): {
  predictionUrl: string
  confidenceUrl: string
  classStats: Array<{ id: string; name: string; pct: number }>
} {
  const n = width * height
  const rgb = classDefs.map(d => hexToRgb(d.color))
  const pred = new Uint8ClampedArray(n * 4)
  const conf = new Uint8ClampedArray(n * 4)
  const tally = new Array(classDefs.length).fill(0)
  let validPixels = 0

  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    if (!valid[p] || labels[p]! < 0) {
      pred[i + 3] = 0
      conf[i + 3] = 0
      continue
    }
    const l = labels[p]!
    const [r, g, b] = rgb[l] ?? [128, 128, 128]
    pred[i] = r
    pred[i + 1] = g
    pred[i + 2] = b
    pred[i + 3] = 255
    const c = Math.max(0, Math.min(1, confidence[p]!))
    const v = Math.round(c * 255)
    conf[i] = v
    conf[i + 1] = v
    conf[i + 2] = v
    conf[i + 3] = 220
    tally[l] = (tally[l] || 0) + 1
    validPixels += 1
  }

  const classStats = classDefs
    .map((d, idx) => ({
      id: String(idx),
      name: d.name,
      pct: validPixels ? Number(((tally[idx] / validPixels) * 100).toFixed(1)) : 0,
    }))
    .filter(s => s.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  return {
    predictionUrl: rgbaToPngDataUrl(pred, width, height),
    confidenceUrl: rgbaToPngDataUrl(conf, width, height),
    classStats,
  }
}

export function meanFeaturesByClass(
  signatures: Array<{ className: string; features: Float32Array }>,
): Array<{ className: string; meanFeatures: number[]; sampleCount: number }> {
  const byClass = new Map<string, Float32Array[]>()
  for (const s of signatures) {
    const arr = byClass.get(s.className) || []
    arr.push(s.features)
    byClass.set(s.className, arr)
  }
  return [...byClass.entries()].map(([className, feats]) => {
    const dim = feats[0]?.length ?? 0
    const mean = new Array(dim).fill(0)
    for (const f of feats) {
      for (let i = 0; i < dim; i += 1) mean[i] += f[i]!
    }
    const n = feats.length || 1
    return { className, meanFeatures: mean.map(v => Number((v / n).toFixed(4))), sampleCount: feats.length }
  })
}
