import type { RasterMapCoordinates } from '../../utils/FileLoader'
import type { AiDlRasterBounds } from '../aiDetection/siAiDlRasterPipeline'

/** Safe max dimension for Mapbox GL image sources (WebGL texture limits). */
export const MAPBOX_IMAGE_MAX_DIMENSION = 4096

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

/** Downscale oversized imagery so Mapbox can texture it; preserves original georeferencing. */
export async function createMapboxReadyImageUrl(
  file: File,
  maxDim = MAPBOX_IMAGE_MAX_DIMENSION,
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
