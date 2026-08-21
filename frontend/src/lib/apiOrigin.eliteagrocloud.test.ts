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

  it('routes github.io Pages to Hostinger api when VITE is unset', () => {
    vi.stubEnv('VITE_AGRI_API_SECRETS_URL', '')
    vi.stubGlobal('window', {
      location: { hostname: 'alkamelgis.github.io', origin: 'https://alkamelgis.github.io' },
    })
    expect(configuredApiOrigin()).toBe(ELITE_AGROCLOUD_API_ORIGIN)
    expect(isStaticDeploymentWithoutBackend()).toBe(false)
  })

  it('keeps localhost on same-origin even when VITE points at remote API', () => {
    vi.stubEnv('VITE_AGRI_API_SECRETS_URL', ELITE_AGROCLOUD_API_ORIGIN)
    vi.stubEnv('PROD', true)
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', origin: 'http://localhost:3011' },
    })
    expect(configuredApiOrigin()).toBe('')
    expect(resolveApiOrigin()).toBe('http://localhost:3011')
  })

  it('does not route localhost production preview to Hostinger api', () => {
    vi.stubEnv('VITE_AGRI_API_SECRETS_URL', '')
    vi.stubEnv('PROD', true)
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5174' },
    })
    expect(configuredApiOrigin()).toBe('')
    expect(resolveApiOrigin()).toBe('http://127.0.0.1:5174')
  })
})
