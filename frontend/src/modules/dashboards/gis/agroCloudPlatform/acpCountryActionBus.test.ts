import { describe, expect, it, vi } from 'vitest'
import {
  ACP_COUNTRY_SELECT_EVENT,
  emitAcpCountrySelect,
  subscribeAcpCountrySelect,
} from './acpCountryActionBus'

describe('acpCountryActionBus', () => {
  it('notifies subscribers and dispatches a window event', () => {
    const listener = vi.fn()
    const unsub = subscribeAcpCountrySelect(listener)
    const onWindow = vi.fn()
    window.addEventListener(ACP_COUNTRY_SELECT_EVENT, onWindow)

    const detail = emitAcpCountrySelect({ country: 'UAE', previous: 'all', flyMap: true })

    expect(listener).toHaveBeenCalledWith(detail)
    expect(onWindow).toHaveBeenCalled()
    unsub()
    window.removeEventListener(ACP_COUNTRY_SELECT_EVENT, onWindow)
  })
})
