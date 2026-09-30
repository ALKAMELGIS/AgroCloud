/** Bright-star / constellation overlay data for the globe cockpit sky. */

export const SI_SKY_OVERLAY_DEFAULTS = {
  stars: true,
  constellations: false,
}

export type SiSkyBrightStar = {
  ra: number
  dec: number
  mag: number
  name?: string
}

export const SI_SKY_BRIGHT_STARS: SiSkyBrightStar[] = []

/** RA/Dec pairs forming constellation line segments. */
export const SI_SKY_CONSTELLATION_LINES: Array<[number, number, number, number]> = []
