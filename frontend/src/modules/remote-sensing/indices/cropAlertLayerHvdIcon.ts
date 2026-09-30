import type { DchasRiskTier } from './siCropAlertDchasBeacon'
import { DCHAS_RISK_COLORS } from './siCropAlertDchasBeacon'

/** Mapbox image id — single SDF template tinted per alert tier. */
export const CROP_ALERT_HVD_MAP_ICON_ID = 'crop-alert-hvd-icon'

export const CROP_ALERT_HVD_VIEWBOX = '0 0 32 32'

/** Monochrome template for Mapbox SDF (black shapes on transparent). */
export function buildCropAlertHvdTemplateSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CROP_ALERT_HVD_VIEWBOX}" width="64" height="64">
  <circle cx="16" cy="16" r="11.5" fill="#000"/>
  <path fill="#000" d="M16 9.2c-1.4 3.1-3.1 5.8-3.1 8.4 0 2.1 1.6 3.4 3.1 4.2 1.5-.8 3.1-2.1 3.1-4.2 0-2.6-1.7-5.3-3.1-8.4z"/>
  <circle cx="22.8" cy="9.6" r="3.6" fill="#000"/>
  <rect x="21.6" y="7.1" width="1.2" height="3.2" rx="0.5" fill="#000"/>
  <circle cx="22.2" cy="11.6" r="0.75" fill="#000"/>
  <rect x="11.2" y="22.4" width="9.6" height="4.2" rx="1.2" fill="#000"/>
  <text x="16" y="25.2" font-family="system-ui,sans-serif" font-size="2.8" font-weight="700" text-anchor="middle" fill="#000">HVD</text>
</svg>`
}

export function cropAlertHvdTierColor(tier: DchasRiskTier): string {
  return DCHAS_RISK_COLORS[tier]
}

export function cropAlertHvdTierFromLightweightTier(tier: number): DchasRiskTier {
  if (tier >= 3) return 'critical'
  if (tier === 2) return 'stress'
  if (tier === 1) return 'watch'
  return 'stable'
}

export function cropAlertHvdLightweightTierColor(tier: number): string {
  return cropAlertHvdTierColor(cropAlertHvdTierFromLightweightTier(tier))
}

function rasterizeSvgToImageData(svg: string, size = 64): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image(size, size)
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D unavailable'))
          return
        }
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size)
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to rasterize Crop Alert HVD icon'))
    img.src = url
  })
}

type MapboxMapLike = {
  hasImage?: (id: string) => boolean
  addImage?: (id: string, image: ImageData, options?: { sdf?: boolean }) => void
  isStyleLoaded?: () => boolean
  once?: (event: string, handler: () => void) => void
  off?: (event: string, handler: () => void) => void
}

/** Register the lightweight HVD SDF icon once per Mapbox style. */
export async function ensureCropAlertHvdMapIcon(map: MapboxMapLike | null | undefined): Promise<boolean> {
  if (!map?.addImage) return false
  if (map.hasImage?.(CROP_ALERT_HVD_MAP_ICON_ID)) return true

  const add = async () => {
    if (map.hasImage?.(CROP_ALERT_HVD_MAP_ICON_ID)) return true
    const imageData = await rasterizeSvgToImageData(buildCropAlertHvdTemplateSvg(), 64)
    map.addImage!(CROP_ALERT_HVD_MAP_ICON_ID, imageData, { sdf: true })
    return true
  }

  if (map.isStyleLoaded?.()) {
    return add()
  }

  return new Promise(resolve => {
    const onLoad = () => {
      map.off?.('load', onLoad)
      add()
        .then(() => resolve(true))
        .catch(() => resolve(false))
    }
    map.once?.('load', onLoad)
  })
}

export const CROP_ALERT_HVD_MAP_ICON_COLOR_EXPR = [
  'match',
  ['get', 'tier'],
  3,
  DCHAS_RISK_COLORS.critical,
  2,
  DCHAS_RISK_COLORS.stress,
  1,
  DCHAS_RISK_COLORS.watch,
  DCHAS_RISK_COLORS.stable,
] as const

export const CROP_ALERT_HVD_MAP_ICON_SIZE_EXPR = [
  'match',
  ['get', 'tier'],
  3,
  0.88,
  2,
  0.8,
  1,
  0.74,
  0.68,
] as const

/** Scale HVD icons up at regional zoom so alerts stay visible on the 2D dashboard canvas. */
export const CROP_ALERT_HVD_MAP_ICON_ZOOM_SCALE_EXPR = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0.5,
  3.4,
  3,
  2.6,
  5,
  1.85,
  8,
  1.15,
  12,
  0.78,
] as const

export const CROP_ALERT_HVD_MAP_ICON_SIZE_AT_ZOOM_EXPR = [
  '*',
  CROP_ALERT_HVD_MAP_ICON_SIZE_EXPR,
  CROP_ALERT_HVD_MAP_ICON_ZOOM_SCALE_EXPR,
] as const
