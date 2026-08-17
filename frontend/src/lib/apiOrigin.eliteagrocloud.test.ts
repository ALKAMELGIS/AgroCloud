import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ELITE_AGROCLOUD_API_ORIGIN,
  configuredApiOrigin,
  isStaticDeploymentWithoutBackend,
  resolveApiOrigin,
} from './apiOrigin'

describe('apiOrigin eliteagrocloud Hostinger fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('resolves Pages SPA on eliteagrocloud.com to Hostinger api origin', () => {
    vi.stubEnv('VITE_AGRI_API_SECRETS_URL', '')
    vi.stubGlobal('window', {
      location: { hostname: 'www.eliteagrocloud.com', origin: 'https://www.eliteagrocloud.com' },
    })
    expect(configuredApiOrigin()).toBe(ELITE_AGROCLOUD_API_ORIGIN)
    expect(resolveApiOrigin()).toBe(ELITE_AGROCLOUD_API_ORIGIN)
    expect(isStaticDeploymentWithoutBackend()).toBe(false)
  })

  it('does not loop when already on api.eliteagrocloud.com', () => {
    vi.stubEnv('VITE_AGRI_API_SECRETS_URL', '')
    vi.stubGlobal('window', {
      location: { hostname: 'api.eliteagrocloud.com', origin: 'https://api.eliteagrocloud.com' },
    })
    expect(configuredApiOrigin()).toBe('')
    expect(resolveApiOrigin()).toBe('https://api.eliteagrocloud.com')
  })
})
