import { describe, expect, it } from 'vitest'
import {
  ELITE_AGRO_LOGO_WHITE_URL,
  LEGACY_ELITE_AGRO_LOGO_URL,
  resolveEliteAgroLogoUrl,
} from './brandAssets'

describe('resolveEliteAgroLogoUrl', () => {
  it('maps the legacy eliteprojects.ae logo to the bundled asset', () => {
    expect(resolveEliteAgroLogoUrl(LEGACY_ELITE_AGRO_LOGO_URL)).toBe(ELITE_AGRO_LOGO_WHITE_URL)
    expect(resolveEliteAgroLogoUrl('')).toBe(ELITE_AGRO_LOGO_WHITE_URL)
    expect(
      resolveEliteAgroLogoUrl(
        'http://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png?v=1',
      ),
    ).toBe(ELITE_AGRO_LOGO_WHITE_URL)
  })

  it('keeps custom uploaded logos', () => {
    expect(resolveEliteAgroLogoUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })
})
