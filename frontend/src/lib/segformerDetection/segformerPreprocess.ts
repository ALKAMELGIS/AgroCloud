/**
 * Light client-side RGB preprocess helpers for the SegFormer detect pipeline.
 * Heavy lifting (tile / infer / vectorize) stays on the Python service.
 */

/** Soft brightness normalize: mild contrast stretch toward mid-tones. */
export async function softNormalizeRgbDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl?.trim()) return dataUrl
  try {
    const img = await loadImage(dataUrl)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, w, h)
    const d = imageData.data
    let sum = 0
    let count = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!
      if (a < 8) continue
      sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3
      count++
    }
    if (count < 16) return dataUrl
    const mean = sum / count
    // Nudge mean toward ~128 without crushing shadows/highlights.
    const gain = mean > 1e-3 ? Math.min(1.35, Math.max(0.75, 128 / mean)) : 1
    if (Math.abs(gain - 1) < 0.04) return dataUrl
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 8) continue
      d[i] = clampByte(d[i]! * gain)
      d[i + 1] = clampByte(d[i + 1]! * gain)
      d[i + 2] = clampByte(d[i + 2]! * gain)
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode capture image.'))
    img.src = src
  })
}
