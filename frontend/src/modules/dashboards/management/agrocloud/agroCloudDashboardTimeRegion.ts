import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'

export type AgroCloudUnitPrefixId =
  | 'yotta'
  | 'zetta'
  | 'exa'
  | 'peta'
  | 'tera'
  | 'giga'
  | 'mega'
  | 'kilo'
  | 'deci'
  | 'centi'
  | 'milli'
  | 'micro'
  | 'nano'

export type AgroCloudUnitPrefixFormat = 'international' | 'scientific' | 'full' | 'custom'

export type AgroCloudUnitPrefixSetting = {
  enabled: boolean
  symbol: string
}

export type AgroCloudUnitPrefixDefinition = {
  id: AgroCloudUnitPrefixId
  label: string
  exponent: number
  defaultSymbol: string
  defaultEnabled: boolean
}

export const AGROCLOUD_UNIT_PREFIX_DEFINITIONS: AgroCloudUnitPrefixDefinition[] = [
  { id: 'yotta', label: 'Yotta (10²⁴)', exponent: 24, defaultSymbol: 'Y', defaultEnabled: true },
  { id: 'zetta', label: 'Zetta (10²¹)', exponent: 21, defaultSymbol: 'Z', defaultEnabled: true },
  { id: 'exa', label: 'Exa (10¹⁸)', exponent: 18, defaultSymbol: 'E', defaultEnabled: true },
  { id: 'peta', label: 'Peta (10¹⁵)', exponent: 15, defaultSymbol: 'P', defaultEnabled: true },
  { id: 'tera', label: 'Tera (10¹²)', exponent: 12, defaultSymbol: 'T', defaultEnabled: true },
  { id: 'giga', label: 'Giga (10⁹)', exponent: 9, defaultSymbol: 'G', defaultEnabled: true },
  { id: 'mega', label: 'Mega (10⁶)', exponent: 6, defaultSymbol: 'M', defaultEnabled: true },
  { id: 'kilo', label: 'Kilo (10³)', exponent: 3, defaultSymbol: 'k', defaultEnabled: true },
  { id: 'deci', label: 'Deci (10⁻¹)', exponent: -1, defaultSymbol: 'd', defaultEnabled: false },
  { id: 'centi', label: 'Centi (10⁻²)', exponent: -2, defaultSymbol: 'c', defaultEnabled: false },
  { id: 'milli', label: 'Milli (10⁻³)', exponent: -3, defaultSymbol: 'm', defaultEnabled: false },
  { id: 'micro', label: 'Micro (10⁻⁶)', exponent: -6, defaultSymbol: 'µ', defaultEnabled: false },
  { id: 'nano', label: 'Nano (10⁻⁹)', exponent: -9, defaultSymbol: 'n', defaultEnabled: false },
]

export const AGROCLOUD_TIME_ZONE_OPTIONS: { id: string; label: string }[] = [
  { id: 'Etc/UTC', label: '(UTC) Coordinated Universal Time' },
  { id: 'America/New_York', label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { id: 'America/Chicago', label: '(UTC-06:00) Central Time (US & Canada)' },
  { id: 'America/Denver', label: '(UTC-07:00) Mountain Time (US & Canada)' },
  { id: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { id: 'Europe/London', label: '(UTC+00:00) London' },
  { id: 'Europe/Paris', label: '(UTC+01:00) Paris, Berlin, Rome' },
  { id: 'Asia/Dubai', label: '(UTC+04:00) Abu Dhabi, Dubai' },
  { id: 'Asia/Riyadh', label: '(UTC+03:00) Riyadh' },
  { id: 'Asia/Kolkata', label: '(UTC+05:30) Chennai, Kolkata, Mumbai' },
  { id: 'Asia/Singapore', label: '(UTC+08:00) Singapore' },
  { id: 'Australia/Sydney', label: '(UTC+11:00) Sydney' },
]

export const AGROCLOUD_UNIT_PREFIX_FORMAT_OPTIONS: { id: AgroCloudUnitPrefixFormat; label: string }[] = [
  { id: 'international', label: 'International (K, M, B, T)' },
  { id: 'scientific', label: 'Scientific notation' },
  { id: 'full', label: 'Full numbers (no abbreviation)' },
  { id: 'custom', label: 'Custom prefix format' },
]

export type AgroCloudDashboardTimeRegionConfig = {
  unitPrefixFormat: AgroCloudUnitPrefixFormat
  specificTimeZone: string
  unitPrefixes: Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting>
}

export function buildDefaultUnitPrefixes(): Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting> {
  const out = {} as Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting>
  for (const def of AGROCLOUD_UNIT_PREFIX_DEFINITIONS) {
    out[def.id] = { enabled: def.defaultEnabled, symbol: def.defaultSymbol }
  }
  return out
}

export function unitPrefixesForFormat(format: AgroCloudUnitPrefixFormat): Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting> {
  const base = buildDefaultUnitPrefixes()
  if (format === 'full') {
    for (const def of AGROCLOUD_UNIT_PREFIX_DEFINITIONS) {
      base[def.id] = { ...base[def.id], enabled: false }
    }
    return base
  }
  if (format === 'international') {
    for (const def of AGROCLOUD_UNIT_PREFIX_DEFINITIONS) {
      const intlOn = ['kilo', 'mega', 'giga', 'tera'].includes(def.id)
      base[def.id] = {
        enabled: intlOn,
        symbol: def.id === 'giga' ? 'B' : def.defaultSymbol,
      }
    }
    return base
  }
  if (format === 'scientific') {
    for (const def of AGROCLOUD_UNIT_PREFIX_DEFINITIONS) {
      base[def.id] = { enabled: def.exponent >= 3 || def.exponent <= -3, symbol: def.defaultSymbol }
    }
    return base
  }
  return base
}

export function resolveDashboardTimeRegion(config: {
  timeZone: 'device' | 'specific'
  specificTimeZone?: string
  unitPrefixFormat?: AgroCloudUnitPrefixFormat
  unitPrefixes?: Partial<Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting>>
}): AgroCloudDashboardTimeRegionConfig {
  const format = config.unitPrefixFormat ?? 'custom'
  const base = format === 'custom' ? buildDefaultUnitPrefixes() : unitPrefixesForFormat(format)
  const merged = { ...base }
  if (config.unitPrefixes) {
    for (const def of AGROCLOUD_UNIT_PREFIX_DEFINITIONS) {
      const patch = config.unitPrefixes[def.id]
      if (patch) merged[def.id] = { ...merged[def.id], ...patch }
    }
  }
  return {
    unitPrefixFormat: format,
    specificTimeZone: config.specificTimeZone ?? 'Etc/UTC',
    unitPrefixes: merged,
  }
}

/** Format a numeric dashboard value using configured unit prefixes. */
export function formatDashboardNumber(
  value: number,
  config: {
    unitPrefixFormat?: AgroCloudUnitPrefixFormat
    unitPrefixes?: Partial<Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting>>
  },
): string {
  const resolved = resolveDashboardTimeRegion({
    timeZone: 'device',
    unitPrefixFormat: config.unitPrefixFormat,
    unitPrefixes: config.unitPrefixes,
  })

  if (resolved.unitPrefixFormat === 'full') {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
  }

  if (resolved.unitPrefixFormat === 'scientific') {
    return value.toExponential(2)
  }

  const abs = Math.abs(value)
  if (abs === 0) return '0'

  const enabled = AGROCLOUD_UNIT_PREFIX_DEFINITIONS.filter(def => resolved.unitPrefixes[def.id]?.enabled)
  const sorted = [...enabled].sort((a, b) => b.exponent - a.exponent)

  for (const def of sorted) {
    const factor = 10 ** def.exponent
    if (abs >= factor) {
      const scaled = value / factor
      const symbol = resolved.unitPrefixes[def.id]?.symbol ?? def.defaultSymbol
      const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(scaled)
      return `${formatted}${symbol}`
    }
  }

  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

export function formatDashboardDateTime(config: {
  timeZone: 'device' | 'specific'
  specificTimeZone?: string
}): string {
  const timeZone = config.timeZone === 'specific' ? config.specificTimeZone ?? 'Etc/UTC' : undefined
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  }
}

export function dashboardTimeZoneCaption(config: {
  timeZone: 'device' | 'specific'
  specificTimeZone?: string
}): string {
  if (config.timeZone === 'specific') {
    const match = AGROCLOUD_TIME_ZONE_OPTIONS.find(z => z.id === config.specificTimeZone)
    if (match) {
      const short = match.label.replace(/^\((UTC[^)]+)\)\s*/, '$1 · ')
      return short.length > 42 ? `${short.slice(0, 40)}…` : short
    }
    return config.specificTimeZone ?? 'UTC'
  }
  return `Device · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
}

export function defaultTimeRegionConfigPatch(): Pick<
  AgroCloudDashboardConfig,
  'timeZone' | 'specificTimeZone' | 'unitPrefixFormat' | 'unitPrefixes'
> {
  return {
    timeZone: 'device',
    specificTimeZone: 'Etc/UTC',
    unitPrefixFormat: 'custom',
    unitPrefixes: buildDefaultUnitPrefixes(),
  }
}
