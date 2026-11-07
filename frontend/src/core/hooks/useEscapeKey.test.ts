import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEscapeKey } from './useEscapeKey'

const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }))

describe('useEscapeKey', () => {
  it('calls the handler on Escape only while active', () => {
    const onEscape = vi.fn()
    const { rerender, unmount } = renderHook(({ active }) => useEscapeKey(active, onEscape), {
      initialProps: { active: true },
    })
    press('Enter')
    expect(onEscape).not.toHaveBeenCalled()
    press('Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)

    rerender({ active: false })
    press('Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)

    rerender({ active: true })
    unmount()
    press('Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('always uses the latest handler without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useEscapeKey(true, fn), { initialProps: { fn: first } })
    rerender({ fn: second })
    press('Escape')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
