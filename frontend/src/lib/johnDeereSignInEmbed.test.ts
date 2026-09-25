import { describe, expect, it } from 'vitest'
import { JOHN_DEERE_SIGN_IN_EMBED_URL } from './defaultPageLinks'
import { readJohnDeereSignInEmbedSrc } from './johnDeereSignInEmbed'

describe('readJohnDeereSignInEmbedSrc', () => {
  it('proxies default sign-in portal home', () => {
    const src = readJohnDeereSignInEmbedSrc([])
    expect(src).toContain('/api/gps/john-deere-map/go/signin.johndeere.com/')
  })

  it('ignores expired PKCE authorize URLs from link management', () => {
    const src = readJohnDeereSignInEmbedSrc([
      {
        id: 'john-deere-sign-in-link',
        name: 'JD',
        path: '/applications/john-deere-sign-in',
        iconClass: 'fa-solid fa-user-lock',
        visible: true,
        bindTarget: 'external',
        externalUrl:
          'https://signin.johndeere.com/oauth2/v1/authorize?client_id=x&code_challenge=y&code_challenge_method=S256',
        navGroupId: 'application',
      },
    ])
    expect(src).toContain('/api/gps/john-deere-map/go/signin.johndeere.com/')
    expect(src).not.toContain('code_challenge=')
  })

  it('uses Link Management override when set', () => {
    const custom = `${JOHN_DEERE_SIGN_IN_EMBED_URL}&extra=1`
    const src = readJohnDeereSignInEmbedSrc([
      {
        id: 'john-deere-sign-in-link',
        name: 'JD',
        path: '/applications/john-deere-sign-in',
        iconClass: 'fa-solid fa-user-lock',
        visible: true,
        bindTarget: 'external',
        externalUrl: custom,
        navGroupId: 'application',
      },
    ])
    expect(src).toContain('extra=1')
  })
})
