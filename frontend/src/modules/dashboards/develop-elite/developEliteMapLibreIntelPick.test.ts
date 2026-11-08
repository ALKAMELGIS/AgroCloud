import { describe, expect, it, vi } from 'vitest'
import { registerDevelopEliteMapLibreIntelPick } from './developEliteMapLibreIntelPick'

describe('developEliteMapLibreIntelPick', () => {
  it('fires onPick from MapLibre click with lngLat', () => {
    const container = document.createElement('div')
    container.className = 'maplibregl-map'
    const handlers: Record<string, (e: unknown) => void> = {}
    const map = {
      getContainer: () => container,
      on: (type: string, fn: (e: unknown) => void) => {
        handlers[type] = fn
      },
      off: (type: string) => {
        delete handlers[type]
      },
    }

    const onPick = vi.fn()
    const unregister = registerDevelopEliteMapLibreIntelPick(map as never, onPick)
    expect(container.classList.contains('develop-elite-map--intel-pick')).toBe(true)

    const canvas = document.createElement('canvas')
    canvas.className = 'maplibregl-canvas'
    const clickEvent = new MouseEvent('click', { button: 0, bubbles: true })
    Object.defineProperty(clickEvent, 'target', { value: canvas })
    handlers.click?.({
      lngLat: { lat: 25.2, lng: 55.3 },
      originalEvent: clickEvent,
    })
    expect(onPick).toHaveBeenCalledWith(25.2, 55.3)

    unregister()
    expect(container.classList.contains('develop-elite-map--intel-pick')).toBe(false)
    expect(handlers.click).toBeUndefined()
  })
})
