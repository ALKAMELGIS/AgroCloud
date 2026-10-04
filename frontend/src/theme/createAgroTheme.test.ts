import { describe, expect, it } from 'vitest'
import { createAgroTheme, readDocumentThemeMode } from './createAgroTheme'
import { agroZIndex } from './zIndex'

describe('createAgroTheme', () => {
  it('builds light and dark themes with Agro z-index scale', () => {
    const light = createAgroTheme('light')
    const dark = createAgroTheme('dark')
    expect(light.palette.mode).toBe('light')
    expect(dark.palette.mode).toBe('dark')
    expect(light.zIndex.modal).toBe(agroZIndex.modal)
    expect(light.typography.fontFamily).toContain('Inter')
  })

  it('readDocumentThemeMode defaults to light without document', () => {
    expect(readDocumentThemeMode()).toBe('light')
  })
})
