export type SiGlobeSkyGl = {
  destroy: () => void
}

export function raDecToSkyCanvas(ra: number, dec: number, width: number, height: number): { x: number; y: number } {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  return {
    x: (((ra % 360) + 360) % 360 / 360) * w,
    y: (0.5 - dec / 180) * h,
  }
}

export function createSiGlobeSkyGl(_canvas: HTMLCanvasElement): SiGlobeSkyGl | null {
  return null
}
