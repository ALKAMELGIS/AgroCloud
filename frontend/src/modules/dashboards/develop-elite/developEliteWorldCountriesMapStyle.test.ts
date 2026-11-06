import { describe, expect, it } from 'vitest'
import { developEliteWorldCountriesPathStyle } from './developEliteWorldCountriesMapStyle'

describe('developEliteWorldCountriesPathStyle', () => {
  it('uses green outline for Active (Status 1)', () => {
    const style = developEliteWorldCountriesPathStyle({
      type: 'Feature',
      properties: { Status: 1 },
      geometry: null,
    })
    expect(style.color).toBe('#4ce600')
    expect(style.weight).toBe(3)
    expect(style.fillOpacity).toBe(0)
  })

  it('uses red outline for Inactive (Status 2)', () => {
    const style = developEliteWorldCountriesPathStyle({
      type: 'Feature',
      properties: { Status: 2 },
      geometry: null,
    })
    expect(style.color).toBe('#e60000')
  })
})
