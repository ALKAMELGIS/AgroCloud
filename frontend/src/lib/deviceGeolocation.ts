export type DeviceGeoReading = {
  lng: number
  lat: number
  accuracyM: number | null
  altitudeM: number | null
  headingDeg: number | null
  speedMps: number | null
  sampledAt: number
}

export type WatchBestDevicePositionOptions = {
  /** Stop early when horizontal accuracy is at or below this (meters). */
  targetAccuracyM?: number
  /** Max time to keep refining before returning the best fix. */
  maxWaitMs?: number
  /** Per-callback timeout passed to Geolocation API. */
  timeoutMs?: number
  onProgress?: (reading: DeviceGeoReading) => void
}

function readingFromPosition(pos: GeolocationPosition): DeviceGeoReading {
  const { longitude: lng, latitude: lat, accuracy, altitude, heading, speed } = pos.coords
  return {
    lng,
    lat,
    accuracyM: Number.isFinite(accuracy) ? accuracy : null,
    altitudeM: Number.isFinite(altitude ?? NaN) ? (altitude as number) : null,
    headingDeg: Number.isFinite(heading ?? NaN) ? (heading as number) : null,
    speedMps: Number.isFinite(speed ?? NaN) ? (speed as number) : null,
    sampledAt: pos.timestamp || Date.now(),
  }
}

function isBetterReading(next: DeviceGeoReading, prev: DeviceGeoReading | null): boolean {
  if (!prev) return true
  const na = next.accuracyM
  const pa = prev.accuracyM
  if (na != null && pa != null) return na < pa
  if (na != null) return true
  return false
}

/** Map horizontal accuracy (m) to a sensible street-level zoom. */
/** Approximate on-screen diameter (px) for GPS horizontal accuracy at map zoom. */
export function horizontalAccuracyToMapPixels(
  accuracyM: number,
  latitude: number,
  zoom: number,
): number {
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) return 28
  const latRad = (latitude * Math.PI) / 180
  const metersPerPixel = (156543.03392 * Math.cos(latRad)) / 2 ** zoom
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return 28
  const diameter = (accuracyM * 2) / metersPerPixel
  return Math.max(28, Math.min(diameter, 240))
}

export function mapZoomForHorizontalAccuracyM(accuracyM: number | null): number {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) return 18
  if (accuracyM <= 6) return 19
  if (accuracyM <= 12) return 18
  if (accuracyM <= 25) return 17
  if (accuracyM <= 60) return 16
  if (accuracyM <= 120) return 15
  return 14
}

/**
 * Uses watchPosition and returns the most accurate fix within the wait window
 * (fresh GPS — maximumAge 0, high accuracy).
 */
export function watchBestDevicePosition(
  options: WatchBestDevicePositionOptions = {},
): { promise: Promise<DeviceGeoReading>; watchId: number } {
  const targetAccuracyM = options.targetAccuracyM ?? 12
  const maxWaitMs = options.maxWaitMs ?? 28_000
  const timeoutMs = options.timeoutMs ?? 25_000

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      watchId: -1,
      promise: Promise.reject(new Error('Geolocation is not supported')),
    }
  }

  let best: DeviceGeoReading | null = null
  let settled = false
  let watchId = -1

  const promise = new Promise<DeviceGeoReading>((resolve, reject) => {
    const started = Date.now()

    const finish = (err?: GeolocationPositionError | Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(deadlineTimer)
      if (watchId >= 0) navigator.geolocation.clearWatch(watchId)
      if (best) {
        resolve(best)
        return
      }
      if (err && 'code' in err) {
        reject(err)
        return
      }
      reject(err ?? new Error('Could not determine location'))
    }

    const deadlineTimer = window.setTimeout(() => finish(), maxWaitMs)

    watchId = navigator.geolocation.watchPosition(
      pos => {
        const reading = readingFromPosition(pos)
        if (isBetterReading(reading, best)) {
          best = reading
          options.onProgress?.(reading)
        }
        const acc = reading.accuracyM
        if (acc != null && acc <= targetAccuracyM) {
          finish()
        } else if (Date.now() - started >= maxWaitMs) {
          finish()
        }
      },
      err => finish(err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      },
    )
  })

  return { promise, watchId }
}
