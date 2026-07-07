export type GoToXyFormat =
  | 'meters'
  | 'feet'
  | 'us-feet'
  | 'dd'
  | 'dms'
  | 'ddm'
  | 'mgrs'
  | 'usng'
  | 'utm';

export const GO_TO_XY_FORMAT_OPTIONS: Array<{ id: GoToXyFormat; label: string }> = [
  { id: 'meters', label: 'Meters' },
  { id: 'feet', label: 'Feet' },
  { id: 'us-feet', label: 'US Feet' },
  { id: 'dd', label: 'Decimal Degrees' },
  { id: 'dms', label: 'Degrees Minutes Seconds' },
  { id: 'ddm', label: 'Degrees Decimal Minutes' },
  { id: 'mgrs', label: 'MGRS' },
  { id: 'usng', label: 'US National Grid' },
  { id: 'utm', label: 'UTM' },
];

const US_FEET_PER_METER = 3937 / 1200;

export type GoToXyPair = { x: string; y: string };

function pad2(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

function toDmsParts(value: number): { deg: number; min: number; sec: number } {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = (abs - deg - min / 60) * 3600;
  if (sec >= 60 - 1e-9) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }
  return { deg: deg * sign, min, sec };
}

function formatDms(value: number, axis: 'lat' | 'lon'): string {
  const { deg, min, sec } = toDmsParts(value);
  const hemi =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(deg)}°${pad2(min)}'${sec.toFixed(1)}"${hemi}`;
}

function formatDdm(value: number, axis: 'lat' | 'lon'): string {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const hemi =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${deg * sign < 0 ? '-' : ''}${Math.abs(deg)}°${min.toFixed(3)}'${hemi}`;
}

function parseDmsLike(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(
    /^(-?\d+(?:\.\d+)?)[°d]\s*(\d+(?:\.\d+)?)?[''′]?\s*(\d+(?:\.\d+)?)?["″]?\s*([NSEW])?$/i,
  );
  if (!m) {
    const n = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const deg = Number(m[1]);
  const min = m[2] != null && m[2] !== '' ? Number(m[2]) : 0;
  const sec = m[3] != null && m[3] !== '' ? Number(m[3]) : 0;
  const hemi = (m[4] ?? '').toUpperCase();
  if (![deg, min, sec].every(Number.isFinite)) return null;
  let val = Math.abs(deg) + min / 60 + sec / 3600;
  if (deg < 0 || hemi === 'S' || hemi === 'W') val *= -1;
  return val;
}

function lngLatToWebMercatorMeters(lng: number, lat: number): { x: number; y: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lng * 20037508.342789244) / 180;
  const y =
    (Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) * 20037508.342789244) / Math.PI;
  return { x, y };
}

function webMercatorMetersToLngLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x * 180) / 20037508.342789244;
  const lat =
    (180 / Math.PI) * (2 * Math.atan(Math.exp((y * Math.PI) / 20037508.342789244)) - Math.PI / 2);
  return { lng, lat };
}

function latLonToUtm(lat: number, lon: number): {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
} {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const tanLat = Math.tan(latRad);
  const rho = a * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const p = lonRad - lonOrigin;
  const A = a * (1 - n + (5 / 4) * (n2 - n3) + (81 / 64) * (n4 - n3));
  const B = (3 * a * n) / 2 * (1 - n + (7 / 8) * (n2 - n3) + (55 / 64) * n4);
  const C = (15 * a * n2) / 16 * (1 - n + (3 / 4) * (n2 - n3));
  const D = (35 * a * n3) / 48 * (1 - n + (11 / 16) * (n2 - n3));
  const E = (315 * a * n4) / 512 * (1 - n);
  const s =
    B * Math.sin(2 * latRad) +
    C * Math.sin(4 * latRad) +
    D * Math.sin(6 * latRad) +
    E * Math.sin(8 * latRad);
  const K1 = s * k0;
  const K2 = k0 * nu * sinLat * cosLat;
  const K3 = (k0 * nu * sinLat * cosLat ** 3) / 6 * (nu / rho - tanLat ** 2);
  const K4 =
    (k0 * nu * sinLat * cosLat ** 5) /
    120 *
    (5 + 3 * tanLat ** 2 + 10 * e2 * cosLat ** 2 - 4 * e2 ** 2 * cosLat ** 4 - 9 * tanLat ** 4);
  const easting = k0 * nu * cosLat * p + (k0 * nu * cosLat ** 3 * p ** 3) / 6 * (1 - tanLat ** 2 + e2 * cosLat ** 2) + 500000;
  let northing = K1 + K2 * p ** 2 + K3 * p ** 4 + K4 * p ** 6;
  if (lat < 0) northing += 10000000;
  return { easting, northing, zone, hemisphere: lat >= 0 ? 'N' : 'S' };
}

function utmToLatLon(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S',
): { lng: number; lat: number } {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const n = f / (2 - f);
  const x = easting - 500000;
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const M = y / k0;
  const mu =
    M /
    (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    (3 * e1) / 2 * Math.sin(2 * mu) +
    (21 * e1 ** 2) / 16 * Math.sin(4 * mu) +
    (151 * e1 ** 3) / 96 * Math.sin(6 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const nu1 = a / Math.sqrt(1 - e2 * sinPhi ** 2);
  const rho1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi ** 2, 1.5);
  const T1 = tanPhi ** 2;
  const C1 = (e2 / (1 - e2)) * cosPhi ** 2;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi ** 2, 1.5);
  const D = x / (nu1 * k0);
  const lat =
    phi1 -
    (nu1 * tanPhi) / R1 *
      (D ** 2 / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e2) * D ** 4 / 24 +
        (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lng =
    lonOrigin +
    (D -
      (1 + 2 * T1 + C1) * D ** 3 / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e2 + 24 * T1 ** 2) * D ** 5 / 120) /
      cosPhi;
  return { lng: (lng * 180) / Math.PI, lat: (lat * 180) / Math.PI };
}

function formatMgrs(lat: number, lon: number): GoToXyPair {
  const utm = latLonToUtm(lat, lon);
  const zoneStr = `${pad2(utm.zone)}${utm.hemisphere}`;
  const e = Math.round(utm.easting);
  const n = Math.round(utm.northing);
  return {
    x: `${zoneStr} ${e}`,
    y: String(n),
  };
}

function parseMgrs(xRaw: string, yRaw: string, fallbackLon: number): { lng: number; lat: number } | null {
  const zoneMatch = xRaw.trim().match(/^(\d{1,2})([NnSs])?\s*(\d+)/);
  const easting = zoneMatch ? Number(zoneMatch[3]) : Number(xRaw);
  const northing = Number(yRaw);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  const zone = zoneMatch ? Number(zoneMatch[1]) : Math.min(60, Math.max(1, Math.floor((fallbackLon + 180) / 6) + 1));
  const hemi = zoneMatch?.[2]?.toUpperCase() === 'S' ? 'S' : 'N';
  return utmToLatLon(easting, northing, zone, hemi);
}

export function formatGoToXyPair(format: GoToXyFormat, lng: number, lat: number): GoToXyPair {
  switch (format) {
    case 'dd':
      return { x: lng.toFixed(6), y: lat.toFixed(6) };
    case 'dms':
      return { x: formatDms(lng, 'lon'), y: formatDms(lat, 'lat') };
    case 'ddm':
      return { x: formatDdm(lng, 'lon'), y: formatDdm(lat, 'lat') };
    case 'utm': {
      const u = latLonToUtm(lat, lng);
      return { x: u.easting.toFixed(2), y: u.northing.toFixed(2) };
    }
    case 'mgrs':
    case 'usng':
      return formatMgrs(lat, lng);
    case 'meters': {
      const m = lngLatToWebMercatorMeters(lng, lat);
      return { x: m.x.toFixed(2), y: m.y.toFixed(2) };
    }
    case 'feet': {
      const m = lngLatToWebMercatorMeters(lng, lat);
      return { x: (m.x * 3.28084).toFixed(2), y: (m.y * 3.28084).toFixed(2) };
    }
    case 'us-feet': {
      const m = lngLatToWebMercatorMeters(lng, lat);
      return { x: (m.x * US_FEET_PER_METER).toFixed(2), y: (m.y * US_FEET_PER_METER).toFixed(2) };
    }
    default:
      return { x: String(lng), y: String(lat) };
  }
}

export function parseGoToXyPair(
  format: GoToXyFormat,
  xRaw: string,
  yRaw: string,
  hintLng = 0,
): { lng: number; lat: number } | null {
  const x = xRaw.trim();
  const y = yRaw.trim();
  if (!x || !y) return null;

  switch (format) {
    case 'dd': {
      const lng = Number(x);
      const lat = Number(y);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lng, lat };
    }
    case 'dms':
    case 'ddm': {
      const lng = parseDmsLike(x);
      const lat = parseDmsLike(y);
      if (lng == null || lat == null) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lng, lat };
    }
    case 'utm': {
      const easting = Number(x);
      const northing = Number(y);
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
      const zone = Math.min(60, Math.max(1, Math.floor((hintLng + 180) / 6) + 1));
      const hemi = northing > 5000000 ? 'S' : 'N';
      return utmToLatLon(easting, northing, zone, hemi);
    }
    case 'mgrs':
    case 'usng':
      return parseMgrs(x, y, hintLng);
    case 'meters': {
      const mx = Number(x);
      const my = Number(y);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
      return webMercatorMetersToLngLat(mx, my);
    }
    case 'feet': {
      const mx = Number(x) / 3.28084;
      const my = Number(y) / 3.28084;
      if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
      return webMercatorMetersToLngLat(mx, my);
    }
    case 'us-feet': {
      const mx = Number(x) / US_FEET_PER_METER;
      const my = Number(y) / US_FEET_PER_METER;
      if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
      return webMercatorMetersToLngLat(mx, my);
    }
    default:
      return null;
  }
}

export function goToXyAxisLabels(format: GoToXyFormat): { x: string; y: string } {
  switch (format) {
    case 'dd':
    case 'dms':
    case 'ddm':
      return { x: 'Long:', y: 'Lat:' };
    case 'utm':
    case 'mgrs':
    case 'usng':
      return { x: 'Easting:', y: 'Northing:' };
    default:
      return { x: 'X:', y: 'Y:' };
  }
}

export function goToXyFormatShortLabel(format: GoToXyFormat): string {
  switch (format) {
    case 'dd':
      return 'dd';
    case 'dms':
      return 'dms';
    case 'ddm':
      return 'ddm';
    case 'utm':
      return 'utm';
    case 'mgrs':
      return 'mgrs';
    case 'usng':
      return 'usng';
    case 'meters':
      return 'm';
    case 'feet':
      return 'ft';
    case 'us-feet':
      return 'usft';
    default:
      return format;
  }
}
