import { describe, expect, it } from 'vitest'
import {
  developEliteListItemMatchesSearch,
  sortDevelopEliteListBySearch,
} from './developEliteListSearch'

describe('developEliteListSearch', () => {
  it('sorts matches to the top without removing non-matches', () => {
    const items = [{ name: 'Al Madam Farm' }, { name: '3-A' }, { name: 'Botanical Garden' }]
    const sorted = sortDevelopEliteListBySearch(
      items,
      'madam',
      item => item.name,
      (a, b) => a.name.localeCompare(b.name),
    )
    expect(sorted.map(i => i.name)).toEqual(['Al Madam Farm', '3-A', 'Botanical Garden'])
  })

  it('flags substring matches for highlight', () => {
    expect(developEliteListItemMatchesSearch('Al Rawda Palace', 'raw')).toBe(true)
    expect(developEliteListItemMatchesSearch('Dubai Cofe', 'tea')).toBe(false)
  })
})
