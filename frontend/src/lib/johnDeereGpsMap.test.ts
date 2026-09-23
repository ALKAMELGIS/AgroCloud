import { describe, expect, it } from 'vitest'
import { johnDeereGpsInAppEntryUrl, johnDeereGpsInAppEmbedSrcForUrl } from './johnDeereGpsMap'

describe('johnDeereGpsInAppEntryUrl', () => {
  it('uses /login for map home', () => {
    expect(johnDeereGpsInAppEntryUrl('https://map.deere.com/')).toBe('https://map.deere.com/login')
    expect(johnDeereGpsInAppEntryUrl('https://map.deere.com')).toBe('https://map.deere.com/login')
  })

  it('keeps explicit paths', () => {
    expect(johnDeereGpsInAppEntryUrl('https://map.deere.com/login?x=1')).toBe(
      'https://map.deere.com/login?x=1',
    )
  })
})

describe('johnDeereGpsInAppEmbedSrcForUrl', () => {
  it('builds proxied login path', () => {
    expect(johnDeereGpsInAppEmbedSrcForUrl('https://map.deere.com/')).toBe(
      '/api/gps/john-deere-map/go/map.deere.com/login',
    )
  })
})
