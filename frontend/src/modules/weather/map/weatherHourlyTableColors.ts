/** ArcGIS Operations Dashboard table temperature fills (Adelaide sample). */
export function hourlyTableTempCellColors(tempC: number | null): {
  backgroundColor: string
  color: string
} {
  if (tempC == null || !Number.isFinite(tempC)) {
    return { backgroundColor: '#141414', color: '#ffffff' }
  }
  const t = Math.round(tempC)
  let bg: string
  if (t <= 17) bg = '#a8a355'
  else if (t <= 19) bg = '#af9254'
  else if (t <= 22) bg = '#a67451'
  else if (t <= 26) bg = '#a6514f'
  else if (t <= 30) bg = '#b05b5b'
  else bg = '#b84848'
  return { backgroundColor: bg, color: '#ffffff' }
}

/** ArcGIS Operations Dashboard table humidity fills (Adelaide sample). */
export function hourlyTableHumidityCellColors(humidityPct: number | null): {
  backgroundColor: string
  color: string
} {
  if (humidityPct == null || !Number.isFinite(humidityPct)) {
    return { backgroundColor: '#141414', color: '#ffffff' }
  }
  const h = Math.round(humidityPct)
  let bg: string
  if (h >= 80) bg = '#702682'
  else if (h >= 70) bg = '#7a3a88'
  else if (h >= 58) bg = '#8a4f96'
  else if (h >= 45) bg = '#7d62a8'
  else if (h >= 35) bg = '#6e6ebf'
  else bg = '#9575cd'
  return { backgroundColor: bg, color: '#ffffff' }
}
