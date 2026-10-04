import { describe, expect, it } from 'vitest'
import { formatEmbedBlockReason, isValidExternalEmbedUrl } from './externalEmbedFrameCheck'

describe('externalEmbedFrameCheck', () => {
  it('rejects placeholder URLs', () => {
    expect(isValidExternalEmbedUrl('')).toBe(false)
    expect(isValidExternalEmbedUrl('https://')).toBe(false)
    expect(isValidExternalEmbedUrl('https://www.agsense365.com/farm/grid')).toBe(true)
  })

  it('formats X-Frame-Options block reason', () => {
    const msg = formatEmbedBlockReason(
      { embeddable: false, reason: 'x_frame_options:DENY' },
      'en',
    )
    expect(msg).toContain('X-Frame-Options')
  })
})
