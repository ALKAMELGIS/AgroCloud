import { describe, expect, it } from 'vitest'
import { developEliteLoadErrorMessage } from './useDevelopEliteDashboardData'

describe('developEliteLoadErrorMessage', () => {
  it('explains network failures instead of "Failed to fetch"', () => {
    expect(developEliteLoadErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Could not reach the ArcGIS/)
  })
  it('points to the layer URLs for missing layers', () => {
    expect(developEliteLoadErrorMessage(new Error('Feature layer query failed (400)'))).toMatch(/layer was not found/)
  })
  it('points to sharing / key for refused access', () => {
    expect(developEliteLoadErrorMessage(new Error('Feature layer query failed (403)'))).toMatch(/refused access/)
  })
  it('keeps other messages', () => {
    expect(developEliteLoadErrorMessage(new Error('Feature layer did not return GeoJSON.'))).toMatch(/did not return GeoJSON/)
  })
})
