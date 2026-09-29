import { afterEach, describe, expect, it } from 'vitest'
import {
  LOGIN_CREDENTIALS_STORAGE_KEY,
  loadLoginCredentials,
  saveLoginCredentials,
  clearLoginCredentials,
} from './loginCredentialsPersistence'

afterEach(() => {
  localStorage.clear()
})

describe('loginCredentialsPersistence', () => {
  it('saves and loads email, password, and device name when keepSignedIn is true', () => {
    saveLoginCredentials({
      email: 'user@example.com',
      password: 'secret-pass',
      deviceName: 'Windows · Chrome',
      keepSignedIn: true,
    })
    const loaded = loadLoginCredentials()
    expect(loaded).toMatchObject({
      email: 'user@example.com',
      password: 'secret-pass',
      deviceName: 'Windows · Chrome',
      keepSignedIn: true,
    })
    expect(localStorage.getItem(LOGIN_CREDENTIALS_STORAGE_KEY)).toBeTruthy()
  })

  it('clears storage when keepSignedIn is false', () => {
    saveLoginCredentials({
      email: 'user@example.com',
      password: 'secret-pass',
      deviceName: 'Tablet',
      keepSignedIn: true,
    })
    saveLoginCredentials({
      email: 'user@example.com',
      password: 'secret-pass',
      deviceName: 'Tablet',
      keepSignedIn: false,
    })
    expect(loadLoginCredentials()).toBeNull()
  })

  it('clearLoginCredentials removes saved data', () => {
    saveLoginCredentials({
      email: 'a@b.com',
      password: 'x',
      deviceName: 'Phone',
      keepSignedIn: true,
    })
    clearLoginCredentials()
    expect(loadLoginCredentials()).toBeNull()
  })
})
