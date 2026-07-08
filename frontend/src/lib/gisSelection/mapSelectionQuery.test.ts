import { describe, expect, it } from 'vitest'
import { resolveSelectionSetModeFromClick } from './mapSelectionQuery'

describe('mapSelectionQuery', () => {
  it('uses toolbar mode when no modifiers', () => {
    expect(resolveSelectionSetModeFromClick('new')).toBe('new')
    expect(resolveSelectionSetModeFromClick('add')).toBe('add')
  })

  it('shift adds and ctrl removes', () => {
    expect(resolveSelectionSetModeFromClick('new', { shiftKey: true } as MouseEvent)).toBe('add')
    expect(resolveSelectionSetModeFromClick('new', { ctrlKey: true } as MouseEvent)).toBe('remove')
  })

  it('ctrl+shift selects subset', () => {
    expect(
      resolveSelectionSetModeFromClick('new', { ctrlKey: true, shiftKey: true } as MouseEvent),
    ).toBe('subset')
  })
})
