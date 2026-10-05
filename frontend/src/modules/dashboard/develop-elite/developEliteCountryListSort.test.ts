import { describe, expect, it } from 'vitest'
import { comparePortfolioCountryListLabels } from './developEliteCountryListSort'

describe('comparePortfolioCountryListLabels', () => {
  it('orders UAE, Serbia, Morocco before other countries', () => {
    const labels = ['Morocco', 'Australia', 'Serbia', 'UAE', 'Egypt'].sort(comparePortfolioCountryListLabels)
    expect(labels).toEqual(['UAE', 'Serbia', 'Morocco', 'Australia', 'Egypt'])
  })
})
