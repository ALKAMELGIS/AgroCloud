/**
 * Fill near-black / transparent holes in a PNG data URL by neighbour majority colour.
 * Used for Prithvi prediction rasters that inherited cloud nodata cutouts.
 */
import { PNG } from 'pngjs'

function isHole(r, g, b, a) {
  if (a < 16) return true
  return r < 8 && g < 8 && b < 8
}

export function fillBlackHolesInPngDataUrl(dataUrl, passes = 6) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return dataUrl
  try {
    const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
    const buf = Buffer.from(b64, 'base64')
    const png = PNG.sync.read(buf)
    const { width, height, data } = png
    const n = width * height
    for (let pass = 0; pass < passes; pass += 1) {
      let changed = 0
      const next = Buffer.from(data)
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4
          if (!isHole(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
          const counts = new Map()
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (!dx && !dy) continue
              const nx = x + dx
              const ny = y + dy
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
              const j = (ny * width + nx) * 4
              if (isHole(data[j], data[j + 1], data[j + 2], data[j + 3])) continue
              const key = `${data[j]},${data[j + 1]},${data[j + 2]}`
              counts.set(key, (counts.get(key) || 0) + 1)
            }
          }
          if (!counts.size) continue
          let best = null
          let bestC = -1
          for (const [k, c] of counts) {
            if (c > bestC) {
              bestC = c
              best = k
            }
          }
          if (!best) continue
          const [r, g, b] = best.split(',').map(Number)
          next[i] = r
          next[i + 1] = g
          next[i + 2] = b
          next[i + 3] = 255
          changed += 1
        }
      }
      data.set(next)
      if (!changed) break
    }
    // silence unused
    void n
    const out = PNG.sync.write(png)
    return `data:image/png;base64,${out.toString('base64')}`
  } catch {
    return dataUrl
  }
}
