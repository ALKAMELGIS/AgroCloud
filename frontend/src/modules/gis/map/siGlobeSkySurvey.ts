/**
 * Public astronomical sky surveys for the globe cockpit backdrop.
 * Imagery is STScI DSS + SDSS via CDS HiPS.
 */

export type SiSkySurveyId = 'dss2' | 'sdss'

export const SI_SKY_DSS_HIPS_ID = 'CDS/P/DSS2/color'
export const SI_SKY_SDSS_HIPS_ID = 'CDS/P/SDSS9/color'

export const SI_SKY_ATTRIBUTION =
  'DSS2 — STScI Digitized Sky Survey. SDSS — Sloan Digital Sky Survey. HiPS — CDS Strasbourg.'

export const SI_SKY_PROGRESSIVE_SIZES = [1024, 2048] as const

export function siSkyEquirectUrl(_id: SiSkySurveyId, _size: number): string {
  return ''
}

export function siSkyProxyEquirectPath(_id: SiSkySurveyId, _size: number): string {
  return ''
}
