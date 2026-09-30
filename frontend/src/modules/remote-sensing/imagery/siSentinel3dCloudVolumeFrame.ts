/** Local ENU volume frame for ray-marched 3D clouds (meters). */

export type CloudDeckLngLat = [number, number]

export type CloudDeckVolumeFrame = {
  centerLng: number
  centerLat: number
  halfWidthM: number
  halfHeightM: number
}

function haversineM(a: CloudDeckLngLat, b: CloudDeckLngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLng / 2)
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function computeCloudDeckVolumeFrame(
  coordinates: [CloudDeckLngLat, CloudDeckLngLat, CloudDeckLngLat, CloudDeckLngLat],
): CloudDeckVolumeFrame {
  const [tl, tr, br, bl] = coordinates
  const centerLng = (tl[0] + tr[0] + br[0] + bl[0]) / 4
  const centerLat = (tl[1] + tr[1] + br[1] + bl[1]) / 4
  const halfWidthM = Math.max(40, (haversineM(tl, tr) + haversineM(bl, br)) * 0.25)
  const halfHeightM = Math.max(40, (haversineM(tl, bl) + haversineM(tr, br)) * 0.25)
  return { centerLng, centerLat, halfWidthM, halfHeightM }
}
