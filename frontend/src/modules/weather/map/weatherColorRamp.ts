export type ColorStop = { value: number; color: string }

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function interpolateColor(stops: ColorStop[], value: number): string {
  if (!stops.length) return 'rgba(0,0,0,0)'
  const sorted = [...stops].sort((a, b) => a.value - b.value)
  if (value <= sorted[0].value) return sorted[0].color
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].color
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / Math.max(b.value - a.value, 1e-9)
      const [r1, g1, b1] = parseHex(a.color)
      const [r2, g2, b2] = parseHex(b.color)
      const r = Math.round(r1 + (r2 - r1) * t)
      const g = Math.round(g1 + (g2 - g1) * t)
      const bl = Math.round(b1 + (b2 - b1) * t)
      return `rgb(${r},${g},${bl})`
    }
  }
  return sorted[sorted.length - 1].color
}

/** Windy-style hue for wind direction (degrees). */
export function windDirectionColor(deg: number): string {
  const h = ((deg % 360) + 360) % 360
  return `hsl(${h}, 72%, 58%)`
}
