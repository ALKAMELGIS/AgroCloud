import {
  resolveAgroStructuresCountryCode,
  resolveAgroStructuresCountryDisplayName,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'

function normalizePortfolioLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const COUNTRY_NAME_ALIASES: Record<string, string[]> = {
  uae: ['united arab emirates', 'u.a.e'],
  'united arab emirates': ['uae', 'u.a.e'],
  ksa: ['saudi arabia'],
  'saudi arabia': ['ksa'],
}

function labelsMatch(a: string, b: string): boolean {
  const left = normalizePortfolioLabel(a)
  const right = normalizePortfolioLabel(b)
  if (!left || !right) return false
  if (left === right) return true
  return (COUNTRY_NAME_ALIASES[left] ?? []).includes(right)
}

function lookupCountryCodeInDomain(label: string, domain: Map<string, string>): string {
  if (!normalizePortfolioLabel(label)) return ''
  for (const [code, name] of domain) {
    if (labelsMatch(name, label)) return code
  }
  return ''
}

function readPortfolioCountryLabel(props: Record<string, unknown>): string {
  const raw =
    props.ALL_COUNTRY ??
    props.all_country ??
    props.COUNTRYAFF ??
    props.Country_Name ??
    props.COUNTRY ??
    props.country
  return raw != null && raw !== '' ? String(raw).trim() : ''
}

/** Agro_Structures row matches sidebar / map country filter (coded domain + portfolio labels). */
export function structureFeatureMatchesCountryFilter(
  props: Record<string, unknown>,
  want: string,
  ctx?: {
    countryLabels?: Map<string, string> | null
    worldCountryDomain?: Map<string, string> | null
  },
): boolean {
  const country = want?.trim()
  if (!country || country === 'all') return true

  const labels = ctx?.countryLabels
  const domain = ctx?.worldCountryDomain

  const code = resolveAgroStructuresCountryCode(props)
  if (code) {
    if (code === country) return true
    if (code === String(Number(country))) return true
    if (String(Number(code)) === String(Number(country))) return true
  }

  const wantCode =
    lookupCountryCodeInDomain(country, labels ?? new Map()) ||
    lookupCountryCodeInDomain(country, domain ?? new Map())
  if (wantCode && code) {
    if (code === wantCode || String(Number(code)) === String(Number(wantCode))) return true
  }

  const wantLabel =
    labels?.get(country) ||
    labels?.get(String(Number(country))) ||
    domain?.get(country) ||
    domain?.get(String(Number(country)))

  if (wantLabel) {
    const display = resolveAgroStructuresCountryDisplayName(props, labels)
    if (display && labelsMatch(display, wantLabel)) return true
  }

  const displayName = resolveAgroStructuresCountryDisplayName(props, labels)
  if (displayName && labelsMatch(displayName, country)) return true

  const portfolio = readPortfolioCountryLabel(props)
  if (portfolio) {
    if (normalizePortfolioLabel(portfolio) === normalizePortfolioLabel(country)) return true
    if (wantLabel && normalizePortfolioLabel(portfolio) === normalizePortfolioLabel(wantLabel)) return true
    if (domain?.size) {
      const fromDomain = lookupCountryCodeInDomain(portfolio, domain)
      if (fromDomain && (fromDomain === country || fromDomain === String(Number(country)))) {
        return true
      }
    }
  }

  return false
}
