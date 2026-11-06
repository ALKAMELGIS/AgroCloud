import { compareDevelopEliteListNames } from './developEliteKpiEngine'

/** Portfolio sidebar / weather locations: UAE → Serbia → Morocco → others (A–Z). */
const COUNTRY_SORT_PRIORITY = ['uae', 'serbia', 'morocco'] as const

export function normalizePortfolioCountrySortKey(label: string): string {
  const n = label.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return ''
  if (n === 'uae' || n === 'u.a.e' || n.includes('united arab emirates') || n === 'emirates') {
    return 'uae'
  }
  if (n === 'serbia' || n === 'rs' || n.includes('serbia')) return 'serbia'
  if (n === 'morocco' || n.includes('maroc')) return 'morocco'
  return n
}

function countrySortRank(label: string): number {
  const key = normalizePortfolioCountrySortKey(label)
  const idx = COUNTRY_SORT_PRIORITY.indexOf(key as (typeof COUNTRY_SORT_PRIORITY)[number])
  return idx >= 0 ? idx : COUNTRY_SORT_PRIORITY.length
}

export function comparePortfolioCountryListLabels(a: string, b: string): number {
  const ra = countrySortRank(a)
  const rb = countrySortRank(b)
  if (ra !== rb) return ra - rb
  return compareDevelopEliteListNames(a, b)
}
