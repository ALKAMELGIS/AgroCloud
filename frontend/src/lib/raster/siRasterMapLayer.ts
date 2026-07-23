import type { RasterMapCoordinates } from '../../utils/FileLoader'
export type { RasterMapCoordinates }
import type { AiDlRasterBounds } from '../aiDetection/siAiDlRasterPipeline'

/** Upper cap for Mapbox GL image sources — the effective size is clamped to the GPU's
 * real `MAX_TEXTURE_SIZE` (see {@link getMaxImageTextureDimension}). 8192 keeps typical
 * drone/aerial frames at full resolution while staying within safe GPU memory. */
export const MAPBOX_IMAGE_MAX_DIMENSION = 8192

let cachedMaxTextureDim: number | null = null

/**
 * Largest single-texture dimension the current GPU can texture, clamped to `cap`.
 * Older 4096-only GPUs are respected; modern desktops get up to 8192 for crisp overlays.
 */
export function getMaxImageTextureDimension(cap = MAPBOX_IMAGE_MAX_DIMENSION): number {
  if (cachedMaxTextureDim == null) {
    let glMax = 4096
    try {
      const canvas = document.createElement('canvas')
      const gl =
        (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
      if (gl) {
        const v = gl.getParameter(gl.MAX_TEXTURE_SIZE)
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) glMax = v
      }
    } catch {
      /* No WebGL context available — keep the conservative default. */
    }
    cachedMaxTextureDim = glMax
  }
  return Math.max(2048, Math.min(cachedMaxTextureDim, cap))
}

export function footprintGeoJsonFromMapCoordinates(coords: RasterMapCoordinates): GeoJSON.FeatureCollection {
  const ring = [...coords.map(c => [c[0], c[1]] as [number, number]), [coords[0][0], coords[0][1]]]
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'raster_extent' },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    ],
  }
}

export function boundsWgs84FromMapCoordinates(coords: RasterMapCoordinates): AiDlRasterBounds {
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  }
}

/** Aspect-preserving placement of a non-georeferenced image inside WGS84 bounds. */
export function fitImageWithinWgs84Bounds(
  bounds: AiDlRasterBounds,
  widthPx: number,
  heightPx: number,
): RasterMapCoordinates {
  const cx = (bounds.east + bounds.west) / 2
  const cy = (bounds.north + bounds.south) / 2
  const cosLat = Math.max(1e-6, Math.cos((cy * Math.PI) / 180))
  const viewWm = Math.abs(bounds.east - bounds.west) * cosLat
  const viewHm = Math.abs(bounds.north - bounds.south)
  const imgAspect = widthPx > 0 && heightPx > 0 ? widthPx / heightPx : 1
  let wm = viewWm
  let hm = wm / imgAspect
  if (hm > viewHm) {
    hm = viewHm
    wm = hm * imgAspect
  }
  const halfWdeg = wm / cosLat / 2
  const halfHdeg = hm / 2
  return [
    [cx - halfWdeg, cy + halfHdeg],
    [cx + halfWdeg, cy + halfHdeg],
    [cx + halfWdeg, cy - halfHdeg],
    [cx - halfWdeg, cy - halfHdeg],
  ]
}

type MapboxImageSource = {
  updateImage?: (data: { url?: string; coordinates?: RasterMapCoordinates }) => void
}

type MapboxCanvas = {
  getSource: (id: string) => unknown
  addSource: (id: string, spec: object) => void
  getLayer: (id: string) => unknown
  addLayer: (spec: object, beforeId?: string) => void
  setLayoutProperty?: (id: string, name: string, value: unknown) => void
}

/** Create or refresh a Mapbox `image` source + `raster` layer for georeferenced imagery. */
export function syncMapboxGeoreferencedImageLayer(
  map: MapboxCanvas,
  sourceId: string,
  url: string,
  coordinates: RasterMapCoordinates,
  opts: { visible: boolean; opacity: number; beforeId?: string },
): void {
  const rasterLayerId = `${sourceId}-raster`
  const existing = map.getSource(sourceId) as MapboxImageSource | undefined

  if (existing?.updateImage) {
    existing.updateImage({ url, coordinates })
  } else if (existing) {
    try {
      ;(map as { removeLayer?: (id: string) => void }).removeLayer?.(rasterLayerId)
    } catch {
      /* ignore */
    }
    try {
      ;(map as { removeSource?: (id: string) => void }).removeSource?.(sourceId)
    } catch {
      /* ignore */
    }
    map.addSource(sourceId, { type: 'image', url, coordinates })
  } else {
    map.addSource(sourceId, { type: 'image', url, coordinates })
  }

  const layout = { visibility: opts.visible ? 'visible' : 'none' } as const
  const paint = {
    'raster-opacity': opts.opacity,
    'raster-fade-duration': 0,
    'raster-resampling': 'linear',
  }

  if (!map.getLayer(rasterLayerId)) {
    map.addLayer(
      {
        id: rasterLayerId,
        type: 'raster',
        source: sourceId,
        layout,
        paint,
      },
      opts.beforeId,
    )
  } else {
    try {
      map.setLayoutProperty?.(rasterLayerId, 'visibility', layout.visibility)
    } catch {
      /* ignore */
    }
    try {
      ;(map as { setPaintProperty?: (id: string, name: string, value: unknown) => void }).setPaintProperty?.(
        rasterLayerId,
        'raster-opacity',
        opts.opacity,
      )
    } catch {
      /* ignore */
    }
  }
}

/**
 * Decode a GeoTIFF with geotiff.js and encode an RGB(A) PNG preview for Mapbox `image` sources.
 * Browsers cannot texture raw TIFF blobs — never pass `.tif` to createImageBitmap / Image.
 */
export async function createGeoTiffPngPreviewUrl(
  file: File,
  maxDim = getMaxImageTextureDimension(),
): Promise<{ url: string; widthPx: number; heightPx: number; downscaled: boolean }> {
  if (file.size <= 0) {
    throw new Error('Raster image file is empty (0 bytes). Download the file locally before importing.')
  }
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(await file.arrayBuffer())
  const image = await tiff.getImage()
  const iw = image.getWidth()
  const ih = image.getHeight()
  const scale = Math.min(1, maxDim / Math.max(iw, ih, 1))
  const tw = Math.max(1, Math.floor(iw * scale))
  const th = Math.max(1, Math.floor(ih * scale))
  const samples = image.getSamplesPerPixel()
  const rasters = await image.readRasters(
    samples >= 3 ? { width: tw, height: th, interleave: true } : { width: tw, height: th },
  )

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas for GeoTIFF preview.')
  const imgData = ctx.createImageData(tw, th)
  const out = imgData.data

  if (samples >= 3 && rasters && (rasters as ArrayLike<number>).length >= tw * th * 3) {
    const data = rasters as ArrayLike<number>
    let mx = 1e-9
    const px = tw * th
    for (let i = 0; i < px * 3; i++) {
      const v = Math.abs(Number(data[i]))
      if (Number.isFinite(v) && v > mx) mx = v
    }
    const gain = mx > 255 ? 255 / mx : 1
    let p = 0
    for (let i = 0; i < px; i++) {
      const o = i * 3
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o]) * gain)))
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o + 1]) * gain)))
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o + 2]) * gain)))
      out[p++] = 255
    }
  } else {
    const band0 = Array.isArray(rasters) ? (rasters as ArrayLike<number>[])[0] : rasters
    const flat: number[] =
      band0 && (band0 as ArrayLike<number>).length ? Array.from(band0 as ArrayLike<number>) : []
    let mn = Number.POSITIVE_INFINITY
    let mx = Number.NEGATIVE_INFINITY
    for (const v of flat) {
      if (!Number.isFinite(v)) continue
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx <= mn) {
      mn = 0
      mx = 255
    }
    for (let i = 0; i < tw * th; i++) {
      const v = flat[i]
      const t = Number.isFinite(v) ? (v - mn) / (mx - mn) : 0
      const g = Math.max(0, Math.min(255, Math.round(t * 255)))
      const o = i * 4
      out[o] = g
      out[o + 1] = g
      out[o + 2] = g
      out[o + 3] = 255
    }
  }
  ctx.putImageData(imgData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('GeoTIFF preview encoding failed.'))), 'image/png', 0.92)
  })
  return {
    url: URL.createObjectURL(blob),
    widthPx: tw,
    heightPx: th,
    downscaled: tw < iw || th < ih,
  }
}

/** Downscale oversized imagery so Mapbox can texture it; preserves original georeferencing. */
export async function createMapboxReadyImageUrl(
  file: File,
  maxDim = getMaxImageTextureDimension(),
): Promise<{ url: string; widthPx: number; heightPx: number; downscaled: boolean }> {
  if (file.size <= 0) {
    throw new Error('Raster image file is empty (0 bytes). Download the file locally before importing.')
  }

  const readSize = async (): Promise<{ width: number; height: number }> => {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file)
        const size = { width: bmp.width, height: bmp.height }
        bmp.close?.()
        if (size.width > 0 && size.height > 0) return size
      } catch {
        /* fall through */
      }
    }
    return await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Could not read raster image dimensions.'))
      }
      img.src = objectUrl
    })
  }

  const { width, height } = await readSize()
  if (width <= maxDim && height <= maxDim) {
    return { url: URL.createObjectURL(file), widthPx: width, heightPx: height, downscaled: false }
  }

  const scale = Math.min(maxDim / width, maxDim / height)
  const tw = Math.max(1, Math.round(width * scale))
  const th = Math.max(1, Math.round(height * scale))

  const bitmap =
    typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' })
      : null

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare raster preview canvas.')

  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, tw, th)
    bitmap.close?.()
  } else {
    const objectUrl = URL.createObjectURL(file)
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, tw, th)
        URL.revokeObjectURL(objectUrl)
        resolve()
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Could not decode raster image for preview.'))
      }
      img.src = objectUrl
    })
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Raster preview encoding failed.'))), 'image/jpeg', 0.92)
  })

  return { url: URL.createObjectURL(blob), widthPx: tw, heightPx: th, downscaled: true }
}
