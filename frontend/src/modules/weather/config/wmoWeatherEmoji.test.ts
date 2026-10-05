import { describe, expect, it } from 'vitest'
import { wmoWeatherEmojiMeta } from './wmoWeatherEmoji'

describe('wmoWeatherEmojiMeta', () => {
  it('maps clear and storm codes', () => {
    expect(wmoWeatherEmojiMeta(0).emoji).toBe('☀️')
    expect(wmoWeatherEmojiMeta(95).emoji).toBe('⛈️')
  })
})

