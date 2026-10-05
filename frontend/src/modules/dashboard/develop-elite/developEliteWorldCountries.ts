import { type DevelopEliteCountryListItem } from './developEliteKpiEngine'
import { comparePortfolioCountryListLabels } from './developEliteCountryListSort'



/** ArcGIS World_Countries dashboard: Active (1) outlines on map; sidebar lists Active + Ongoing. */

const SIDEBAR_STATUS = new Set([1, 3])

const MAP_VISIBLE_STATUS = new Set([1, 2, 3])



const PORTFOLIO_COUNTRY_ALIASES: Record<string, string[]> = {

  uae: ['UAE', 'United Arab Emirates'],

}



function normalizePortfolioLabel(value: string): string {

  return value.trim().toLowerCase().replace(/\s+/g, ' ')

}



function lookupCountryCodeInDomain(label: string, domain: Map<string, string>): string {

  const key = normalizePortfolioLabel(label)

  if (!key) return ''

  for (const [code, name] of domain) {

    if (normalizePortfolioLabel(name) === key) return code

  }

  const aliases = PORTFOLIO_COUNTRY_ALIASES[key]

  if (aliases) {

    for (const alias of aliases) {

      for (const [code, name] of domain) {

        if (normalizePortfolioLabel(name) === normalizePortfolioLabel(alias)) return code

      }

    }

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



/**

 * Portfolio country filter key — matches Agro_Structures `Country` coded values when possible.

 * Layer rows often leave `Country` null and use `ALL_COUNTRY` (e.g. "Morocco", "UAE").

 */

export function readWorldCountryCode(

  props: Record<string, unknown>,

  domain?: Map<string, string>,

): string {

  const coded = props.Country ?? props.country

  if (coded != null && coded !== '' && coded !== 0 && coded !== '0') {

    const code = String(coded).trim()

    if (code) return code

  }



  const portfolioLabel = readPortfolioCountryLabel(props)

  if (portfolioLabel && domain?.size) {

    const fromDomain = lookupCountryCodeInDomain(portfolioLabel, domain)

    if (fromDomain) return fromDomain

  }



  if (portfolioLabel) return portfolioLabel



  return ''

}



function readStatus(props: Record<string, unknown>): number {

  const raw = props.Status ?? props.status ?? props.STATUS

  const n = Number(raw)

  return Number.isFinite(n) ? n : 0

}



function resolveWorldCountryLabel(

  props: Record<string, unknown>,

  code: string,

  domain: Map<string, string>,

): string {

  const fromDomain = domain.get(code) || domain.get(String(Number(code)))

  if (fromDomain) return fromDomain

  const portfolio = readPortfolioCountryLabel(props)

  if (portfolio) return portfolio

  return code

}



export function filterWorldCountriesForMap(
  features: GeoJSON.Feature[],
  countryDomain?: Map<string, string>,
): GeoJSON.Feature[] {
  return features.filter(f => {
    if (!f.geometry) return false
    const props = (f.properties ?? {}) as Record<string, unknown>
    if (!MAP_VISIBLE_STATUS.has(readStatus(props))) return false
    const code = readWorldCountryCode(props, countryDomain)
    if (code) return true
    return Boolean(readPortfolioCountryLabel(props))
  })
}



export function buildWorldCountryListItems(

  geojson: GeoJSON.FeatureCollection | null | undefined,

  countryDomain: Map<string, string>,

): DevelopEliteCountryListItem[] {

  if (!geojson?.features?.length) return []

  const map = new Map<string, { label: string; count: number }>()

  for (const f of geojson.features) {

    const props = (f.properties ?? {}) as Record<string, unknown>

    const code = readWorldCountryCode(props, countryDomain)

    if (!code) continue

    if (!SIDEBAR_STATUS.has(readStatus(props))) continue

    const label = resolveWorldCountryLabel(props, code, countryDomain)

    const hit = map.get(code) ?? { label, count: 0 }

    hit.count += 1

    if (label) hit.label = label

    map.set(code, hit)

  }

  return [...map.entries()]

    .map(([code, v]) => ({ code, label: v.label, count: v.count }))

    .sort((a, b) => comparePortfolioCountryListLabels(a.label, b.label))

}


